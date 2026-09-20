import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { isoDay } from "../lib/display";

/**
 * https://llmstxt.org/ - one file that tells a model what this site is and
 * where its parts are, so orienting does not require crawling 900 pages.
 *
 * Generated from the same collections the pages are, never hand-maintained:
 * this site's whole point is that a new public repository with a tracker
 * appears without anyone editing this repository.
 */
export const GET: APIRoute = async ({ site }) => {
  if (!site) throw new Error("astro.config.mjs must set `site`");
  const url = (path: string) => new URL(path, site).href;

  const [projects, tasks, docs, decisions] = await Promise.all([
    getCollection("projects"),
    getCollection("tasks"),
    getCollection("trackerDocs"),
    getCollection("decisions"),
  ]);

  const ordered = [...projects].sort((a, b) => {
    const at = a.data.lastActivity?.getTime() ?? 0;
    const bt = b.data.lastActivity?.getTime() ?? 0;
    return bt - at || a.data.slug.localeCompare(b.data.slug);
  });

  const open = tasks.filter((t) => !t.data.completed).length;
  const done = tasks.length - open;

  const lines = [
    "# Backlogs - m7kni.io",
    "",
    `> Public Backlog.md trackers for ${projects.length} open-source repositories owned by rknightion: ${open} open tasks, ${done} completed, plus ${docs.length} tracker documents and ${decisions.length} decisions. Read-only. Each repository is the source of truth and this site is generated from it.`,
    "",
    "Every page here is also available as Markdown: request it with the `Accept: text/markdown` header and the edge converts it. Individual record pages are `noindex` and are deliberately absent from the sitemap; the boards and the indexes below reach all of them.",
    "",
    "## Site",
    "",
    `- [Project index](${url("/")}): every published tracker, most recently changed first.`,
    `- [All open work](${url("/open/")}): every open task across every tracker, on one page.`,
    `- [Recent activity](${url("/activity/")}): the most recently changed records, newest first.`,
    `- [Statistics](${url("/stats/")}): completion over time and the type and priority mix.`,
    `- [Search](${url("/search/")}): full text across every record, filterable by project, status, type and priority.`,
    "",
    "## Projects",
    "",
  ];

  for (const project of ordered) {
    const d = project.data;
    const base = d.path;
    const extras = [
      `board ${url(`/${base}/`)}`,
      d.completedCount > 0 ? `completed ${url(`/${base}/completed/`)}` : "",
      d.milestoneCount > 0 ? `milestones ${url(`/${base}/milestones/`)}` : "",
      d.docCount > 0 ? `documents ${url(`/${base}/docs/`)}` : "",
      d.decisionCount > 0 ? `decisions ${url(`/${base}/decisions/`)}` : "",
    ].filter(Boolean);

    lines.push(
      `- [${d.slug}](${url(`/${base}/`)}): ${d.description || "No description."} ` +
        `${d.openCount} open, ${d.completedCount} completed` +
        (d.lastActivity ? `, last changed ${isoDay(d.lastActivity)}` : "") +
        `. Source: ${d.repoUrl}. Pages: ${extras.join("; ")}.`,
    );
  }

  lines.push("");

  return new Response(lines.join("\n"), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
