// Señales deterministas de la sub-dimensión "discoverability" (Readiness).
// Puras sobre AuditContext: sin red, sin LLM → mismo input, misma salida.

import type {
  AuditContext,
  Evaluator,
  EvidenceItem,
  SignalDefinition,
  SignalMeasurement,
} from "../types";

const SUB = "discoverability";

// Mapea una proporción 0..1 a un score 0..10.
const pct = (n: number, total: number): number =>
  total <= 0 ? 0 : Number(((n / total) * 10).toFixed(2));

// Helper para construir una medición determinista "measured".
function measured<Raw>(
  def: SignalDefinition<Raw>,
  raw: Raw,
  normalized: number | null,
  evidence: EvidenceItem[]
): SignalMeasurement<Raw> {
  return {
    signalId: def.id,
    signalVersion: def.version,
    topDimension: def.topDimension,
    subDimension: def.subDimension,
    type: def.type,
    state: normalized === null ? "unavailable" : "measured",
    raw,
    normalized,
    confidence: normalized === null ? null : 1,
    evidence,
  };
}

// --- 1. sitemap válido y declarado ---------------------------------------
const sitemapValidDef: SignalDefinition = {
  id: "discoverability.sitemap_valid",
  version: 1,
  topDimension: "readiness",
  subDimension: SUB,
  type: "deterministic",
  title: "Sitemap válido y declarado",
  description: "Sitemap XML válido, referenciado en robots.txt y consistente.",
  source: ["crawler"],
  weight: 1,
  evidenceKeys: ["sitemap_url", "http_status", "url_count", "invalid_url_count", "declared_in_robots"],
};

const sitemapValid: Evaluator = {
  definition: sitemapValidDef,
  async measure(ctx: AuditContext) {
    const found = ctx.sitemaps.find((s) => s.xml && (s.httpStatus ?? 0) < 400) ?? null;
    if (!found) {
      const raw = { found: false };
      return measured(sitemapValidDef, raw, 0, [
        { key: "sitemap_url", kind: "flag", value: "no encontrado" },
      ]);
    }
    const locs = Array.from(found.xml!.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)).map((m) =>
      m[1].trim()
    );
    const isXml = /<(urlset|sitemapindex)[\s>]/i.test(found.xml!);
    const invalid = locs.filter((u) => {
      try {
        return new URL(u).host !== new URL(ctx.origin).host;
      } catch {
        return true;
      }
    }).length;
    const declared = found.declaredInRobots;
    let score = 5;
    if (!isXml || locs.length === 0) score = 0;
    else if (declared && invalid === 0) score = 10;
    const raw = {
      found: true,
      url: found.url,
      httpStatus: found.httpStatus,
      xmlValid: isXml,
      urlCount: locs.length,
      invalidUrlCount: invalid,
      declaredInRobots: declared,
    };
    return measured(sitemapValidDef, raw, score, [
      { key: "sitemap_url", kind: "url", value: found.url, url: found.url },
      { key: "http_status", kind: "http_status", value: found.httpStatus },
      { key: "url_count", kind: "count", value: locs.length },
      { key: "invalid_url_count", kind: "count", value: invalid },
      { key: "declared_in_robots", kind: "flag", value: declared },
    ]);
  },
};

// --- 2. robots permite rastreo -------------------------------------------
const robotsDef: SignalDefinition = {
  id: "discoverability.robots_allows_crawl",
  version: 1,
  topDimension: "readiness",
  subDimension: SUB,
  type: "deterministic",
  title: "robots.txt permite el rastreo",
  description: "El contenido clave no está bloqueado por robots.txt.",
  source: ["crawler"],
  weight: 1,
  evidenceKeys: ["robots_present", "disallow_all", "blocked_paths"],
};

const robotsAllows: Evaluator = {
  definition: robotsDef,
  async measure(ctx: AuditContext) {
    const robots = ctx.robotsTxt;
    if (robots === null) {
      // Ausencia de robots.txt = rastreo permitido.
      return measured(robotsDef, { robotsPresent: false }, 10, [
        { key: "robots_present", kind: "flag", value: false },
      ]);
    }
    // Disallows del grupo User-agent: *.
    const lines = robots.split(/\r?\n/).map((l) => l.replace(/#.*$/, "").trim());
    let inStar = false;
    const disallows: string[] = [];
    for (const line of lines) {
      const m = line.match(/^(user-agent|disallow)\s*:\s*(.*)$/i);
      if (!m) continue;
      const field = m[1].toLowerCase();
      const value = m[2].trim();
      if (field === "user-agent") inStar = value === "*";
      else if (field === "disallow" && inStar && value) disallows.push(value);
    }
    const disallowAll = disallows.includes("/");
    const blocked = ctx.pages.filter((p) => {
      try {
        const path = new URL(p.url).pathname;
        return disallows.some((d) => d !== "/" && path.startsWith(d));
      } catch {
        return false;
      }
    }).length;
    let score = 10;
    if (disallowAll) score = 0;
    else if (blocked > 0) score = Math.max(0, 10 - pct(blocked, ctx.pages.length));
    const raw = { robotsPresent: true, disallowAll, blockedPages: blocked, disallows };
    return measured(robotsDef, raw, Number(score.toFixed(2)), [
      { key: "robots_present", kind: "flag", value: true },
      { key: "disallow_all", kind: "flag", value: disallowAll },
      { key: "blocked_paths", kind: "count", value: blocked },
    ]);
  },
};

// --- 3. canonical presente y consistente ---------------------------------
const canonicalDef: SignalDefinition = {
  id: "discoverability.canonical_consistent",
  version: 1,
  topDimension: "readiness",
  subDimension: SUB,
  type: "deterministic",
  title: "Canonical presente y consistente",
  description: "Cada página declara un canonical válido al mismo host.",
  source: ["crawler"],
  weight: 1,
  evidenceKeys: ["pages_total", "with_canonical", "cross_host"],
};

const canonicalConsistent: Evaluator = {
  definition: canonicalDef,
  async measure(ctx: AuditContext) {
    const total = ctx.pages.length;
    if (total === 0) return measured(canonicalDef, { total: 0 }, null, []);
    let withCanonical = 0;
    let crossHost = 0;
    for (const p of ctx.pages) {
      if (!p.canonicalUrl) continue;
      withCanonical++;
      try {
        if (new URL(p.canonicalUrl).host !== new URL(ctx.origin).host) crossHost++;
      } catch {
        crossHost++;
      }
    }
    // Score: presencia de canonical válido (mismo host).
    const valid = withCanonical - crossHost;
    const score = pct(valid, total);
    const raw = { total, withCanonical, crossHost };
    return measured(canonicalDef, raw, score, [
      { key: "pages_total", kind: "count", value: total },
      { key: "with_canonical", kind: "count", value: withCanonical },
      { key: "cross_host", kind: "count", value: crossHost },
    ]);
  },
};

// --- 4. meta robots indexable --------------------------------------------
const metaRobotsDef: SignalDefinition = {
  id: "discoverability.meta_robots_indexable",
  version: 1,
  topDimension: "readiness",
  subDimension: SUB,
  type: "deterministic",
  title: "Páginas indexables (sin noindex)",
  description: "Las páginas clave no llevan noindex/none en meta robots.",
  source: ["crawler"],
  weight: 1,
  evidenceKeys: ["pages_total", "noindex_pages"],
};

const metaRobotsIndexable: Evaluator = {
  definition: metaRobotsDef,
  async measure(ctx: AuditContext) {
    const total = ctx.pages.length;
    if (total === 0) return measured(metaRobotsDef, { total: 0 }, null, []);
    const noindex = ctx.pages.filter((p) => {
      const r = (p.metaRobots || "").toLowerCase();
      return r.includes("noindex") || r.includes("none");
    });
    const indexable = total - noindex.length;
    const score = pct(indexable, total);
    const raw = { total, noindexCount: noindex.length, noindexUrls: noindex.map((p) => p.url) };
    return measured(metaRobotsDef, raw, score, [
      { key: "pages_total", kind: "count", value: total },
      { key: "noindex_pages", kind: "count", value: noindex.length },
    ]);
  },
};

// --- 5. salud HTTP -------------------------------------------------------
const httpDef: SignalDefinition = {
  id: "discoverability.http_health",
  version: 1,
  topDimension: "readiness",
  subDimension: SUB,
  type: "deterministic",
  title: "Salud HTTP de páginas clave",
  description: "Proporción de páginas que responden 2xx (sin errores/redirects).",
  source: ["crawler"],
  weight: 1,
  evidenceKeys: ["pages_total", "ok_2xx", "by_status"],
};

const httpHealth: Evaluator = {
  definition: httpDef,
  async measure(ctx: AuditContext) {
    const known = ctx.pages.filter((p) => p.httpStatus !== null);
    if (known.length === 0) {
      // No se capturó status en ninguna página → no medible.
      return measured(httpDef, { measured: false }, null, [
        { key: "by_status", kind: "flag", value: "sin datos de status" },
      ]);
    }
    const ok = known.filter((p) => (p.httpStatus as number) >= 200 && (p.httpStatus as number) < 300).length;
    const byStatus: Record<string, number> = {};
    for (const p of known) {
      const k = String(p.httpStatus);
      byStatus[k] = (byStatus[k] || 0) + 1;
    }
    const score = pct(ok, known.length);
    const raw = { total: known.length, ok2xx: ok, byStatus };
    return measured(httpDef, raw, score, [
      { key: "pages_total", kind: "count", value: known.length },
      { key: "ok_2xx", kind: "count", value: ok },
      { key: "by_status", kind: "count", value: byStatus },
    ]);
  },
};

// --- 6. huérfanas y profundidad de clics ---------------------------------
const orphanDef: SignalDefinition = {
  id: "discoverability.orphans_click_depth",
  version: 1,
  topDimension: "readiness",
  subDimension: SUB,
  type: "deterministic",
  title: "Páginas huérfanas y profundidad de clics",
  description: "Todas las páginas son alcanzables desde el home y a poca profundidad.",
  source: ["crawler"],
  weight: 1,
  evidenceKeys: ["pages_total", "orphans", "max_depth"],
};

const orphansClickDepth: Evaluator = {
  definition: orphanDef,
  async measure(ctx: AuditContext) {
    const total = ctx.pages.length;
    if (total === 0) return measured(orphanDef, { total: 0 }, null, []);
    const norm = (u: string): string => {
      try {
        const x = new URL(u);
        x.hash = "";
        return x.toString().replace(/\/$/, "");
      } catch {
        return u;
      }
    };
    const byUrl = new Map(ctx.pages.map((p) => [norm(p.url), p]));
    const root = norm(ctx.rootUrl);
    // BFS de profundidad de clics desde el root.
    const depth = new Map<string, number>();
    if (byUrl.has(root)) depth.set(root, 0);
    else {
      // fallback: la primera página como raíz
      const first = ctx.pages[0] && norm(ctx.pages[0].url);
      if (first) depth.set(first, 0);
    }
    let frontier = Array.from(depth.keys());
    while (frontier.length) {
      const next: string[] = [];
      for (const u of frontier) {
        const page = byUrl.get(u);
        if (!page) continue;
        for (const link of page.internalLinks) {
          const t = norm(link);
          if (byUrl.has(t) && !depth.has(t)) {
            depth.set(t, (depth.get(u) as number) + 1);
            next.push(t);
          }
        }
      }
      frontier = next;
    }
    const orphans = ctx.pages.filter((p) => !depth.has(norm(p.url))).length;
    const depths = Array.from(depth.values());
    const maxDepth = depths.length ? Math.max(...depths) : 0;
    // Score: sin huérfanas y profundidad ≤ 3 = 10; penaliza ambas cosas.
    const orphanPenalty = pct(orphans, total); // 0..10
    const depthPenalty = maxDepth <= 3 ? 0 : Math.min(4, maxDepth - 3);
    const score = Math.max(0, Number((10 - orphanPenalty - depthPenalty).toFixed(2)));
    const raw = { total, orphans, maxDepth, reachable: depth.size };
    return measured(orphanDef, raw, score, [
      { key: "pages_total", kind: "count", value: total },
      { key: "orphans", kind: "count", value: orphans },
      { key: "max_depth", kind: "count", value: maxDepth },
    ]);
  },
};

// --- 7. hreflang válido (N/A si no es multilingüe) ------------------------
const hreflangDef: SignalDefinition = {
  id: "discoverability.hreflang_valid",
  version: 1,
  topDimension: "readiness",
  subDimension: SUB,
  type: "deterministic",
  title: "hreflang válido",
  description: "Si el sitio es multilingüe, los hreflang son válidos.",
  source: ["crawler"],
  weight: 1,
  evidenceKeys: ["multilingual", "with_hreflang", "invalid_entries"],
};

const LANG_RE = /^[a-z]{2}(-[a-z]{2})?$|^x-default$/i;

const hreflangValid: Evaluator = {
  definition: hreflangDef,
  async measure(ctx: AuditContext) {
    const withHreflang = ctx.pages.filter((p) => p.hreflang.length > 0);
    if (withHreflang.length === 0) {
      // No multilingüe → no aplica.
      return measured(hreflangDef, { multilingual: false }, null, [
        { key: "multilingual", kind: "flag", value: false },
      ]);
    }
    let invalid = 0;
    let entries = 0;
    for (const p of withHreflang) {
      for (const h of p.hreflang) {
        entries++;
        const langOk = LANG_RE.test(h.lang || "");
        let hrefOk = false;
        try {
          new URL(h.href);
          hrefOk = true;
        } catch {
          hrefOk = false;
        }
        if (!langOk || !hrefOk) invalid++;
      }
    }
    const score = pct(entries - invalid, entries);
    const raw = { multilingual: true, pagesWithHreflang: withHreflang.length, entries, invalid };
    return measured(hreflangDef, raw, score, [
      { key: "multilingual", kind: "flag", value: true },
      { key: "with_hreflang", kind: "count", value: withHreflang.length },
      { key: "invalid_entries", kind: "count", value: invalid },
    ]);
  },
};

export const discoverabilityEvaluators: Evaluator[] = [
  sitemapValid,
  robotsAllows,
  canonicalConsistent,
  metaRobotsIndexable,
  httpHealth,
  orphansClickDepth,
  hreflangValid,
];
