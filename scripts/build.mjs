#!/usr/bin/env node
// Build the site, index it, and prove the result rather than assume it.
//
// Every check here exists because the corresponding failure is silent: the
// build stays green and the defect ships. A guard that can match nothing is
// worse than no guard, so each one asserts a count, not just an absence.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, renameSync } from "node:fs";
import path from "node:path";

const DIST = path.resolve("./dist");

function run(command, args, env = {}) {
  execFileSync(command, args, {
    stdio: "inherit",
    // Dates are derived from tracker front matter and formatted at build time.
    // Without a fixed zone the output depends on the runner's locale, so two
    // identical inputs produce two different sites.
    env: { ...process.env, TZ: "UTC", ...env },
  });
}

/** Every .html file under dist, as absolute paths. */
function htmlFiles(dir = DIST) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...htmlFiles(full));
    else if (entry.name.endsWith(".html")) out.push(full);
  }
  return out;
}

const exists = (p) => existsSync(p);

function fail(message) {
  console.error(`::error::${message}`);
  process.exitCode = 1;
}

console.log("→ astro build");
run("npx", ["astro", "build"]);

// Workers Static Assets serves /404.html for a miss, so the file has to sit at
// that exact path. Astro writes it there already despite `format: "directory"`,
// but move it if a future version stops doing so - and fail if it is missing
// either way, because the fallback is Workers' own bare error page.
const flat404 = path.join(DIST, "404.html");
const nested404 = path.join(DIST, "404", "index.html");
if (!exists(flat404) && exists(nested404)) {
  renameSync(nested404, flat404);
  console.log("→ 404/index.html moved to 404.html");
}
if (!exists(flat404)) {
  fail("no 404.html was built; Workers would serve its own bare fallback");
}

console.log("→ pagefind");
run("npx", ["pagefind", "--site", "dist"]);

const pages = htmlFiles();
console.log(`\n${pages.length} pages built`);

// ---------------------------------------------------------------- assertions

const contents = new Map(pages.map((p) => [p, readFileSync(p, "utf8")]));

// 1. Pagefind honours data-pagefind-body only once at least one page carries
//    it. If every such attribute were lost in a refactor, Pagefind would index
//    whole pages including nav and footer, and search would return nav text
//    forever with a green build.
const scoped = [...contents.values()].filter((html) =>
  html.includes("data-pagefind-body"),
).length;
if (scoped === 0) {
  fail(
    "no page carries data-pagefind-body; Pagefind would index nav and footer text",
  );
} else {
  console.log(`  ${scoped} pages scoped for indexing`);
}

const indexed = (() => {
  try {
    const meta = JSON.parse(
      readFileSync(path.join(DIST, "pagefind", "pagefind-entry.json"), "utf8"),
    );
    return Object.values(meta.languages ?? {}).reduce(
      (sum, l) => sum + (l.page_count ?? 0),
      0,
    );
  } catch {
    return 0;
  }
})();
if (indexed !== scoped) {
  fail(
    `pagefind indexed ${indexed} pages but ${scoped} are scoped for indexing`,
  );
} else {
  console.log(`  pagefind indexed ${indexed} pages`);
}

// 2. Link resolution. These trackers cross-reference each other constantly, so
//    zero resolved references means the pass went inert. It has done exactly
//    that once already, by being passed to renderMarkdown as a plugin option
//    that function silently discards.
const refs = [...contents.values()].filter((html) =>
  html.includes("backlog-ref"),
).length;
if (refs === 0) {
  fail("no page contains a resolved tracker reference; the link pass is inert");
} else {
  console.log(`  ${refs} pages carry resolved tracker references`);
}

// 3. The board must work with JavaScript off. It is easy to regress into
//    rendering cards client-side from a JSON blob while chasing page weight,
//    and the result looks fine in a browser and is empty to a crawler.
//
//    Asserted as an exact count against the ingest manifest, not as "some
//    tasks are present": a project whose tasks are all done has an empty board
//    legitimately, so a presence check is wrong in both directions.
const manifest = JSON.parse(readFileSync(".backlog-cache/index.json", "utf8"));
const projectSlugs = new Set(manifest.repos.map((r) => r.name));
const boardPages = [...contents.entries()].filter(([p]) => {
  const rel = path.relative(DIST, p);
  return rel.endsWith("/index.html") && projectSlugs.has(path.dirname(rel));
});
const renderedTasks = boardPages.reduce(
  (sum, [, html]) => sum + (html.match(/data-task/g) ?? []).length,
  0,
);
if (boardPages.length !== projectSlugs.size) {
  fail(
    `built ${boardPages.length} board pages for ${projectSlugs.size} projects`,
  );
} else if (renderedTasks === 0) {
  fail("no board page renders a task in HTML; the board needs JavaScript");
} else {
  console.log(
    `  ${boardPages.length} boards render ${renderedTasks} tasks in HTML`,
  );
}

// 4. No third-party subresource. Every fetch a visitor's browser makes without
//    being asked is a privacy and supply-chain decision, and this site has made
//    none: fonts and search assets are all served from this origin.
const EXTERNAL =
  /<(?:link[^>]*\brel=["'](?:stylesheet|preload|preconnect|prefetch)["'][^>]*\bhref|script[^>]*\bsrc|img[^>]*\bsrc|iframe[^>]*\bsrc)=["']https?:\/\/([^/"']+)/gi;
const hosts = new Map();
for (const [file, html] of contents) {
  for (const match of html.matchAll(EXTERNAL)) {
    if (!hosts.has(match[1])) hosts.set(match[1], file);
  }
}
if (hosts.size) {
  fail(
    `third-party subresources from ${[...hosts.keys()].join(", ")} ` +
      `(first seen in ${path.relative(DIST, hosts.values().next().value)})`,
  );
} else {
  console.log("  no third-party subresources");
}

// 5. Two pages sharing a <title> is near-certain here, because task titles
//    repeat across projects. It is a real duplicate-content signal, so the
//    title has to carry the project.
const titles = new Map();
const duplicates = [];
for (const [file, html] of contents) {
  const title = /<title>([^<]*)<\/title>/.exec(html)?.[1];
  if (!title) continue;
  if (titles.has(title)) duplicates.push(title);
  else titles.set(title, file);
}
if (duplicates.length) {
  fail(
    `${duplicates.length} duplicate <title>: ${[...new Set(duplicates)].slice(0, 3).join(" | ")}`,
  );
} else {
  console.log(`  ${titles.size} unique page titles`);
}

// 6. A record page must be noindex and must not appear in the sitemap. Those
//    two have to agree, or the sitemap contradicts the page it points at.
const sitemap = readFileSync(path.join(DIST, "sitemap.xml"), "utf8");
const indexable = [...contents.entries()].filter(
  ([, html]) => !html.includes('name="robots" content="noindex'),
);
const leaked = indexable
  .filter(([p]) => /\/(tasks|docs|decisions)\//.test(p))
  .map(([p]) => p);
if (leaked.length) {
  fail(
    `${leaked.length} record pages are missing noindex, e.g. ${path.relative(DIST, leaked[0])}`,
  );
}
const sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
  (m) => m[1],
);
const noindexInSitemap = sitemapUrls.filter((u) =>
  /\/(tasks|docs|decisions)\//.test(u),
);
if (noindexInSitemap.length) {
  fail(`${noindexInSitemap.length} noindex URLs are listed in the sitemap`);
} else {
  console.log(
    `  sitemap lists ${sitemapUrls.length} indexable URLs, no noindex leakage`,
  );
}

// 7. Nothing withheld may reach the output. `drafts/` and `archive/` are never
//    cloned and never read, and this proves neither rule quietly lapsed.
const withheld = [...contents.entries()].filter(([, html]) =>
  /backlog\/(drafts|archive)\//.test(html),
);
if (withheld.length) {
  fail(`${withheld.length} pages reference withheld tracker content`);
} else {
  console.log("  no references to withheld tracker content");
}

if (process.exitCode) {
  console.error("\nbuild checks FAILED");
} else {
  console.log("\nall build checks passed");
}
