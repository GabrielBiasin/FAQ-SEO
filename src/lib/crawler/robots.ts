// Minimal robots.txt parser: honors User-agent groups, Disallow/Allow, and
// Sitemap directives. Good enough for polite first-party crawling.

export interface RobotsRules {
  disallow: string[];
  allow: string[];
  sitemaps: string[];
  crawlDelay: number | null;
}

const EMPTY: RobotsRules = { disallow: [], allow: [], sitemaps: [], crawlDelay: null };

/**
 * Fetch and parse robots.txt for an origin. Returns permissive rules if the
 * file is missing or unreadable (standard behavior: absence = allow all).
 */
export async function fetchRobots(origin: string, userAgent: string): Promise<RobotsRules> {
  try {
    const res = await fetch(new URL("/robots.txt", origin).toString(), {
      headers: { "User-Agent": userAgent },
    });
    if (!res.ok) return { ...EMPTY };
    return parseRobots(await res.text(), userAgent);
  } catch {
    return { ...EMPTY };
  }
}

export function parseRobots(text: string, userAgent: string): RobotsRules {
  const rules: RobotsRules = { disallow: [], allow: [], sitemaps: [], crawlDelay: null };
  const uaLower = userAgent.toLowerCase();

  // Track applicable groups: the most specific matching UA group, falling back to *.
  let currentAgents: string[] = [];
  let groupApplies = false;
  const starRules = { disallow: [] as string[], allow: [] as string[], crawlDelay: null as number | null };
  const matchRules = { disallow: [] as string[], allow: [] as string[], crawlDelay: null as number | null };

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (field === "sitemap") {
      rules.sitemaps.push(value);
      continue;
    }
    if (field === "user-agent") {
      currentAgents = [value.toLowerCase()];
      groupApplies = value === "*" || uaLower.includes(value.toLowerCase());
      continue;
    }
    const target = currentAgents.includes("*") ? starRules : groupApplies ? matchRules : null;
    if (!target) continue;

    if (field === "disallow") target.disallow.push(value);
    else if (field === "allow") target.allow.push(value);
    else if (field === "crawl-delay") {
      const n = Number(value);
      if (!Number.isNaN(n)) target.crawlDelay = n;
    }
  }

  // Specific UA group wins over '*'.
  const chosen = matchRules.disallow.length || matchRules.allow.length || matchRules.crawlDelay !== null
    ? matchRules
    : starRules;
  rules.disallow = chosen.disallow;
  rules.allow = chosen.allow;
  rules.crawlDelay = chosen.crawlDelay;
  return rules;
}

/**
 * Returns true if the path is allowed under the rules. Longest-match wins
 * between Allow and Disallow (per the de-facto robots spec).
 */
export function isAllowed(rules: RobotsRules, pathname: string): boolean {
  const longest = (patterns: string[]) =>
    patterns
      .filter((p) => p !== "" && matchPattern(p, pathname))
      .reduce((max, p) => Math.max(max, p.length), -1);

  const dis = longest(rules.disallow);
  const allow = longest(rules.allow);
  if (dis === -1) return true; // nothing disallows it
  return allow >= dis; // an equally/more specific Allow overrides
}

// Supports the '*' wildcard and '$' end-anchor used in robots paths.
function matchPattern(pattern: string, path: string): boolean {
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  const anchored = escaped.endsWith("$") ? escaped : escaped;
  try {
    return new RegExp("^" + anchored).test(path);
  } catch {
    return path.startsWith(pattern.replace(/[*$]/g, ""));
  }
}
