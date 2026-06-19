import { createServiceClient } from "@/lib/supabase";
import { crawlSite } from "@/lib/crawler";
import type { JobContext } from "../index";
import type { Json } from "@/types/database";

interface CrawlPayload {
  crawl_id: string;
}

/**
 * crawl_site handler.
 * Payload: { crawl_id }. The crawls row carries root_url (via project) and
 * max_pages. Pages are persisted incrementally so progress is visible mid-run.
 */
export async function handleCrawlSite(ctx: JobContext): Promise<Json> {
  const db = createServiceClient();
  const { crawl_id } = ctx.payload as unknown as CrawlPayload;
  if (!crawl_id) throw new Error("crawl_site: payload.crawl_id requerido");

  const { data: crawl, error: crawlErr } = await db
    .from("crawls")
    .select("*")
    .eq("id", crawl_id)
    .single();
  if (crawlErr || !crawl) throw new Error(`crawl_site: crawl ${crawl_id} no encontrado`);

  const { data: project, error: projErr } = await db
    .from("projects")
    .select("root_url")
    .eq("id", ctx.projectId)
    .single();
  if (projErr || !project) throw new Error("crawl_site: proyecto no encontrado");

  // Mark running + clear any prior pages for a clean re-crawl.
  await db
    .from("crawls")
    .update({ status: "running", started_at: new Date().toISOString(), error: null, pages_count: 0 })
    .eq("id", crawl_id);
  await db.from("pages").delete().eq("crawl_id", crawl_id);

  let count = 0;
  try {
    await crawlSite({
      rootUrl: project.root_url,
      maxPages: crawl.max_pages,
      onPage: async (page) => {
        await db.from("pages").insert({
          crawl_id,
          project_id: ctx.projectId,
          url: page.url,
          title: page.title,
          headings: page.headings as unknown as Json,
          clean_text: page.cleanText,
          word_count: page.wordCount,
        });
        count++;
        // Update running tally periodically for live progress.
        if (count % 3 === 0) {
          await db.from("crawls").update({ pages_count: count }).eq("id", crawl_id);
        }
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .from("crawls")
      .update({ status: "error", error: message, pages_count: count, finished_at: new Date().toISOString() })
      .eq("id", crawl_id);
    throw err;
  }

  await db
    .from("crawls")
    .update({ status: "done", pages_count: count, finished_at: new Date().toISOString() })
    .eq("id", crawl_id);

  return { pages_count: count } as Json;
}
