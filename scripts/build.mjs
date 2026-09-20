#!/usr/bin/env node
// Build the site, index it, and prove the result rather than assume it.
//
// Every check here exists because the corresponding failure is silent: the
// build stays green and the defect ships. A guard that can match nothing is
// worse than no guard, so each one asserts a count, not just an absence.

import { execFileSync } from "node:child_process";
import {
  existsSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
} from "node:fs";
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

/** Same, but hands back what the command printed so it can be asserted on. */
function capture(command, args, env = {}) {
  const output = execFileSync(command, args, {
    encoding: "utf8",
    stdio: ["inherit", "pipe", "inherit"],
    // Dates are derived from tracker front matter and formatted at build time.
    // Without a fixed zone the output depends on the runner's locale, so two
    // identical inputs produce two different sites.
    env: { ...process.env, TZ: "UTC", ...env },
  });
  process.stdout.write(output);
  return output;
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
const pagefindLog = capture("npx", ["pagefind", "--site", "dist"]);

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
// Same rule as `urlSegment` in src/lib/backlog.ts, which is its source of
// truth. Duplicated rather than imported because this script is plain Node and
// that module is TypeScript; if the two ever disagree, these assertions fail,
// which is the behaviour we want from a duplicated rule.
const segment = (name) =>
  name.startsWith(".") ? `dot-${name.slice(1)}` : name;
const projectSlugs = new Set(manifest.repos.map((r) => segment(r.name)));
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
const RECORD_FILE = /\/(tasks|docs|decisions)\/[^/]+\/index\.html$/;
const RECORD_URL = /\/(tasks|docs|decisions)\/[^/]+\/$/;
const leaked = indexable.filter(([p]) => RECORD_FILE.test(p)).map(([p]) => p);
if (leaked.length) {
  fail(
    `${leaked.length} record pages are missing noindex, e.g. ${path.relative(DIST, leaked[0])}`,
  );
}
const sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
  (m) => m[1],
);
const noindexInSitemap = sitemapUrls.filter((u) => RECORD_URL.test(u));
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

// 8. Every record page must be reachable from an indexable page. Records are
//    noindex and absent from the sitemap by design, so a record whose only
//    route is a URL nobody links is published in name only - which is exactly
//    what happened to every tracker document until this check existed.
const linked = new Set();
for (const [file, html] of contents) {
  if (RECORD_FILE.test(file)) continue; // a record linking a record is not a route in
  for (const match of html.matchAll(/href="(\/[^"#?]*)"/g)) {
    linked.add(decodeURIComponent(match[1]));
  }
}
const orphans = [...contents.keys()]
  .filter((file) => RECORD_FILE.test(file))
  .map((file) => `/${path.relative(DIST, file).replace(/index\.html$/, "")}`)
  .filter((url) => !linked.has(url));
if (orphans.length) {
  fail(
    `${orphans.length} record pages are reachable only by search or a cross-reference, ` +
      `e.g. ${orphans.slice(0, 3).join(", ")}`,
  );
} else {
  console.log("  every record page is linked from an index");
}

// 9. llms.txt is generated from the same manifest the pages are, so a project
//    missing from it means the generator and the router disagree about what
//    this site publishes.
const llms = readFileSync(path.join(DIST, "llms.txt"), "utf8");
const projectSection = llms.split("\n## Projects\n")[1] ?? "";
if (!projectSection) fail("llms.txt has no Projects section");
const named = new Set(
  [
    ...projectSection.matchAll(
      /^- \[([^\]]+)\]\(https?:\/\/[^/]+\/([^/)]+)\/\)/gm,
    ),
  ].map((m) => m[2]),
);
const missing = [...projectSlugs].filter((slug) => !named.has(slug));
const extra = [...named].filter((slug) => !projectSlugs.has(slug));
if (missing.length || extra.length) {
  fail(
    `llms.txt disagrees with the ingest: missing ${missing.join(", ") || "none"}; ` +
      `unknown ${extra.join(", ") || "none"}`,
  );
} else {
  console.log(`  llms.txt names all ${named.size} published projects`);
}

// 10. Search filters and the recency sort. The attributes are easy to drop in
//     a refactor and the only symptom is a facet quietly missing from the
//     sidebar, so assert on what Pagefind actually built rather than on the
//     markup that was supposed to produce it.
const EXPECTED_FILTERS = ["project", "status", "kind", "type", "priority"];
const filterFiles = existsSync(path.join(DIST, "pagefind", "filter"))
  ? readdirSync(path.join(DIST, "pagefind", "filter")).filter((f) =>
      f.endsWith(".pf_filter"),
    ).length
  : 0;
const claimedFilters = Number(
  /Indexed (\d+) filters?/.exec(pagefindLog)?.[1] ?? 0,
);
const claimedSorts = Number(/Indexed (\d+) sorts?/.exec(pagefindLog)?.[1] ?? 0);
if (filterFiles !== EXPECTED_FILTERS.length) {
  fail(
    `pagefind built ${filterFiles} filter indexes, expected ${EXPECTED_FILTERS.length} ` +
      `(${EXPECTED_FILTERS.join(", ")})`,
  );
} else if (claimedFilters !== EXPECTED_FILTERS.length) {
  fail(
    `pagefind reported ${claimedFilters} filters, expected ${EXPECTED_FILTERS.length}`,
  );
} else if (claimedSorts < 1) {
  fail("pagefind indexed no sort; results cannot be ordered by recency");
} else {
  console.log(
    `  pagefind indexed ${claimedFilters} search filters and ${claimedSorts} sort`,
  );
}

// 11. No path segment may begin with a dot. Workers Static Assets answers 403
//     for one - not 404, and not at build time - so a repository whose name
//     starts with a dot publishes a board that every link on this site points
//     at and nobody can open. `rknightion/.github` is exactly that case.
const dotted = pages
  .map((file) => path.relative(DIST, file))
  .filter((rel) => rel.split("/").some((seg) => seg.startsWith(".")));
if (dotted.length) {
  fail(
    `${dotted.length} built paths have a dot-leading segment, which the edge ` +
      `refuses with 403: e.g. ${dotted[0]}`,
  );
} else {
  console.log("  no dot-leading path segments");
}

// 12. Every link preview image a page claims must exist and must have had text
//     rendered into it. The rasteriser resolves the generic font stack against
//     whatever the build machine has; when it finds nothing it renders the
//     canvas and no glyphs, which is a valid PNG of roughly a tenth the size.
const OG_FLOOR = 12_000;
const claimedImages = new Set();
for (const html of contents.values()) {
  for (const m of html.matchAll(
    /property="og:image" content="[^"]*?(\/og\/[^"]+)"/g,
  )) {
    claimedImages.add(m[1]);
  }
}
const badImages = [];
for (const url of claimedImages) {
  const file = path.join(DIST, url);
  if (!exists(file)) badImages.push(`${url} (missing)`);
  else if (statSync(file).size < OG_FLOOR) {
    badImages.push(`${url} (${statSync(file).size} bytes; no text rendered?)`);
  }
}
if (claimedImages.size === 0) {
  fail("no page declares an og:image");
} else if (badImages.length) {
  fail(
    `${badImages.length} link preview images are unusable: ${badImages.slice(0, 3).join(", ")}`,
  );
} else {
  console.log(`  ${claimedImages.size} link preview images render text`);
}

if (process.exitCode) {
  console.error("\nbuild checks FAILED");
} else {
  console.log("\nall build checks passed");
}
