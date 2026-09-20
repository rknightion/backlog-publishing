import type { APIRoute } from "astro";
import { getCollection } from "astro:content";

/**
 * Built from the same collections the pages are built from, deliberately not
 * from @astrojs/sitemap. That integration's `serialize` hook matches pages by
 * URL string, so a trailing-slash mismatch drops a lastmod silently and the
 * build stays green. Deriving both from one source removes the chance to
 * disagree, and the assertion below turns a gap into a failed build.
 *
 * Individual records are noindex, so they are absent on purpose: a sitemap
 * naming a noindex page is the sitemap contradicting the page it points at.
 */
export const GET: APIRoute = async ({ site }) => {
  if (!site)
    throw new Error(
      "astro.config.mjs must set `site` for the sitemap to resolve URLs",
    );

  const projects = await getCollection("projects");
  const tasks = await getCollection("tasks");
  const milestones = await getCollection("milestones");

  const newest = (dates: Array<Date | null>): Date | null => {
    const valid = dates.filter((d): d is Date => d instanceof Date);
    return valid.length
      ? new Date(Math.max(...valid.map((d) => d.getTime())))
      : null;
  };

  const entries: Array<{ path: string; lastmod: Date | null }> = [];

  // The index moves whenever anything moves.
  entries.push({
    path: "/",
    lastmod: newest(tasks.map((t) => t.data.lastmod)),
  });

  for (const project of projects) {
    const slug = project.data.slug;
    const mine = tasks.filter((t) => t.data.project === slug);
    const done = mine.filter((t) => t.data.completed);

    entries.push({
      path: `/${slug}/`,
      lastmod: newest(mine.map((t) => t.data.lastmod)),
    });
    if (done.length) {
      entries.push({
        path: `/${slug}/completed/`,
        lastmod: newest(done.map((t) => t.data.lastmod)),
      });
    }
    if (milestones.some((m) => m.data.project === slug)) {
      entries.push({
        path: `/${slug}/milestones/`,
        lastmod: newest(mine.map((t) => t.data.lastmod)),
      });
    }
  }

  // A page with no date would ship a <url> with no <lastmod>, which is exactly
  // the silent gap this endpoint exists to prevent. Every record in this fleet
  // carries created_date at minimum, so a miss is a parsing bug, not a tracker
  // that happens to be undated.
  const undated = entries.filter((e) => !e.lastmod).map((e) => e.path);
  if (undated.length) {
    throw new Error(
      `sitemap: ${undated.length} URL(s) have no lastmod: ${undated.slice(0, 5).join(", ")}`,
    );
  }

  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries.map(
      (e) =>
        `  <url><loc>${new URL(e.path, site).href}</loc>` +
        `<lastmod>${e.lastmod!.toISOString()}</lastmod></url>`,
    ),
    "</urlset>",
  ].join("\n");

  return new Response(body, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
};
