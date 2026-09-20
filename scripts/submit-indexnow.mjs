#!/usr/bin/env node
// Tell the search engines which pages changed, using IndexNow.
//
// Reads the built sitemap rather than walking dist/, so the set of announced
// URLs is exactly the set we claim is indexable. Record pages are noindex and
// absent from the sitemap by design, and announcing one would contradict the
// page's own meta tag.
//
// State-based: a URL is submitted only when its lastmod differs from the one
// already announced. Without that, every rebuild would re-announce all 51 URLs
// whether or not anything moved.

import { readFileSync, existsSync, writeFileSync } from "node:fs";
import path from "node:path";

const SITEMAP = path.resolve("./dist/sitemap.xml");
const ENDPOINT = "https://api.indexnow.org/IndexNow";

function parseArgs() {
  const args = new Map();
  for (let i = 2; i < process.argv.length; i += 2) {
    args.set(process.argv[i].replace(/^--/, ""), process.argv[i + 1]);
  }
  return args;
}

function sitemapEntries() {
  if (!existsSync(SITEMAP))
    throw new Error(`no sitemap at ${SITEMAP}; run the build first`);
  const xml = readFileSync(SITEMAP, "utf8");
  const entries = [];
  for (const block of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const loc = /<loc>([^<]+)<\/loc>/.exec(block[1])?.[1];
    const lastmod = /<lastmod>([^<]+)<\/lastmod>/.exec(block[1])?.[1] ?? "";
    if (loc) entries.push({ loc, lastmod });
  }
  return entries;
}

async function main() {
  const args = parseArgs();
  const keyFile = args.get("key-file");
  const statePath = args.get("state");
  const dryRun = args.has("dry-run");

  if (!keyFile || !existsSync(keyFile)) {
    console.log(`::warning::IndexNow key file missing: ${keyFile}; skipping`);
    return;
  }
  const key = readFileSync(keyFile, "utf8").trim();
  // The key file's name is the key. IndexNow validates by fetching
  // <host>/<key>.txt and comparing, so a mismatch is a silent 403 later.
  const stem = path.basename(keyFile, ".txt");
  if (stem !== key) {
    console.error(
      `::error::key file ${keyFile} contains "${key}" but is named "${stem}"`,
    );
    process.exitCode = 1;
    return;
  }

  const entries = sitemapEntries();
  if (!entries.length) {
    console.error(
      "::error::sitemap contains no URLs; refusing to announce nothing",
    );
    process.exitCode = 1;
    return;
  }

  const host = new URL(entries[0].loc).host;
  const keyLocation = `https://${host}/${key}.txt`;

  let state = {};
  if (statePath && existsSync(statePath)) {
    try {
      state = JSON.parse(readFileSync(statePath, "utf8"));
    } catch {
      // A corrupt or missing cache means announce everything once, which is
      // correct-but-noisy rather than silently announcing nothing.
      state = {};
    }
  }

  const changed = entries.filter((e) => state[e.loc] !== e.lastmod);
  console.log(
    `${entries.length} indexable URLs, ${changed.length} changed since the last run`,
  );

  if (!changed.length) {
    console.log("nothing to announce");
    return;
  }

  if (dryRun) {
    for (const e of changed.slice(0, 10))
      console.log(`  would announce ${e.loc}`);
    return;
  }

  // A bounded timeout and a catch, because the deploy has already succeeded by
  // the time this runs: an unhandled rejection here would reject main(), fail
  // the step, and mark a good release red over an endpoint being unreachable.
  let response;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host,
        key,
        keyLocation,
        urlList: changed.map((e) => e.loc),
      }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    console.log(
      `::warning::IndexNow request failed: ${error instanceof Error ? error.message : error}`,
    );
    return;
  }

  // 202 means "received, key validation pending" and is the NORMAL response
  // for a host the service has not validated recently. It is success.
  if (response.status === 200 || response.status === 202) {
    console.log(`announced ${changed.length} URLs (HTTP ${response.status})`);
    if (statePath) {
      const next = Object.fromEntries(entries.map((e) => [e.loc, e.lastmod]));
      writeFileSync(statePath, JSON.stringify(next, null, 2));
    }
    return;
  }

  const reason =
    {
      400: "malformed request",
      403: "key file not valid or not reachable at keyLocation",
      422: "URLs do not belong to the declared host, or key mismatch",
      429: "rate limited",
    }[response.status] ?? "unexpected status";
  // Never fail the build: the deploy already succeeded, and an engine not
  // being told promptly is not a reason to mark a good release red.
  console.log(
    `::warning::IndexNow returned HTTP ${response.status} (${reason})`,
  );
}

await main();
