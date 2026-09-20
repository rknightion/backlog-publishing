#!/usr/bin/env node
// Discover every public rknightion repository that carries a Backlog.md tracker
// and cache just its `backlog/` directory locally.
//
// Network access lives here and nowhere else. The Astro build reads only the
// cache, so `astro dev` works offline and the clone step is independently
// cacheable in CI.

import { execFile } from "node:child_process";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { promisify } from "node:util";
import path from "node:path";

const run = promisify(execFile);

export const OWNER = "rknightion";
export const CACHE_DIR = path.resolve("./.backlog-cache");

// Folders inside a repo's backlog/ that may be published. Anything else -
// `drafts/`, `archive/`, and whatever Backlog.md adds next - is withheld.
// This list is enforced at clone time by sparse-checkout AND again at read
// time in src/lib/backlog.ts. Two independent gates, because widening one of
// them for an unrelated reason must not silently publish drafts.
export const PUBLISHED_DIRS = [
  "tasks",
  "completed",
  "milestones",
  "docs",
  "decisions",
];

// Repos that carry a tracker but should not appear on the site. Keep this
// short and give every entry a reason: an unexplained entry gets deleted by
// someone assuming it is stale.
const DENY = new Set([
  // No entries. `.github` is deliberately included: its backlog is real work.
]);

async function gh(endpoint, { paginate = false } = {}) {
  const args = ["api", ...(paginate ? ["--paginate"] : []), endpoint];
  const { stdout } = await run("gh", args, { maxBuffer: 64 * 1024 * 1024 });
  return stdout;
}

/** Public, non-fork, non-archived repos owned by OWNER. */
export async function discoverRepos() {
  const raw = await gh(`/users/${OWNER}/repos?type=owner&per_page=100`, {
    paginate: true,
  });
  // --paginate concatenates JSON arrays; parse each one and flatten.
  const pages = raw.replace(/\]\s*\[/g, "],[");
  const repos = JSON.parse(`[${pages}]`).flat();

  const candidates = repos
    .filter((r) => !r.private && !r.fork && !r.archived && !DENY.has(r.name))
    .map((r) => ({
      name: r.name,
      description: r.description ?? "",
      language: r.language ?? null,
      pushedAt: r.pushed_at,
      defaultBranch: r.default_branch,
      url: r.html_url,
    }));

  // A repo is in scope only if it actually has a tracker. Probing the contents
  // API is far cheaper than cloning to find out.
  const withBacklog = [];
  await Promise.all(
    candidates.map(async (repo) => {
      try {
        await gh(`/repos/${OWNER}/${repo.name}/contents/backlog/config.yml`);
        withBacklog.push(repo);
      } catch {
        // No tracker. Not an error.
      }
    }),
  );

  return withBacklog.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Sparse, shallow clone of one repo's backlog/ directory.
 *
 * `--depth 1` is correct here and is a deliberate departure from the docs hub,
 * which forbids shallow clones because its sitemap lastmod comes from `git log`
 * on each source file. This site takes lastmod from Backlog front matter
 * instead, so the reason for that ban does not exist and the clone gets much
 * cheaper. Do not "fix" this back to a full clone.
 */
async function cloneBacklog(repo) {
  const dest = path.join(CACHE_DIR, repo.name);
  await rm(dest, { recursive: true, force: true });
  await run("git", [
    "clone",
    "--depth",
    "1",
    "--filter=blob:none",
    "--sparse",
    "--branch",
    repo.defaultBranch,
    `https://github.com/${OWNER}/${repo.name}.git`,
    dest,
  ]);
  // Restrict the working tree to the folders we are allowed to publish.
  await run("git", [
    "-C",
    dest,
    "sparse-checkout",
    "set",
    "--no-cone",
    "backlog/config.yml",
    ...PUBLISHED_DIRS.map((d) => `backlog/${d}/`),
  ]);

  const { stdout: sha } = await run("git", ["-C", dest, "rev-parse", "HEAD"]);

  // Second gate: delete anything the sparse pattern let through that is not on
  // the allowlist. Belt and braces, because a widened pattern must not publish.
  const backlogDir = path.join(dest, "backlog");
  if (existsSync(backlogDir)) {
    for (const entry of await readdir(backlogDir, { withFileTypes: true })) {
      const allowed = entry.isDirectory()
        ? PUBLISHED_DIRS.includes(entry.name)
        : entry.name === "config.yml";
      if (!allowed) {
        await rm(path.join(backlogDir, entry.name), {
          recursive: true,
          force: true,
        });
      }
    }
  }

  // Drop the git metadata: it is a build cache, not a checkout, and leaving it
  // means the published bundle could carry history we sparse-checked out of.
  await rm(path.join(dest, ".git"), { recursive: true, force: true });

  return sha.trim();
}

async function main() {
  const t0 = Date.now();
  await mkdir(CACHE_DIR, { recursive: true });

  const repos = await discoverRepos();
  console.log(
    `discovered ${repos.length} public ${OWNER} repos with a tracker`,
  );

  const manifest = [];
  for (const repo of repos) {
    const sha = await cloneBacklog(repo);
    const counts = {};
    for (const dir of PUBLISHED_DIRS) {
      const p = path.join(CACHE_DIR, repo.name, "backlog", dir);
      counts[dir] = existsSync(p)
        ? (await readdir(p)).filter((f) => f.endsWith(".md")).length
        : 0;
    }
    manifest.push({ ...repo, sha, counts });
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    console.log(
      `  ${repo.name}: ${total} records (${counts.tasks} tasks, ${counts.completed} completed)`,
    );
  }

  // Previous manifest, if any, so the build can refuse a silent mass deletion.
  const manifestPath = path.join(CACHE_DIR, "index.json");
  let previous = null;
  if (existsSync(manifestPath)) {
    try {
      previous = JSON.parse(await readFile(manifestPath, "utf8"));
    } catch {
      previous = null;
    }
  }

  await writeFile(
    manifestPath,
    JSON.stringify(
      { owner: OWNER, fetchedAt: new Date().toISOString(), repos: manifest },
      null,
      2,
    ),
  );

  const totals = manifest.reduce(
    (a, r) => a + Object.values(r.counts).reduce((x, y) => x + y, 0),
    0,
  );
  console.log(
    `\n${manifest.length} repos, ${totals} records, ${((Date.now() - t0) / 1000).toFixed(1)}s`,
  );

  // A repo going private, archived or renamed removes it from the site and
  // 404s its URLs, with a green build. One disappearing is normal; several at
  // once is a discovery failure and should stop the build.
  if (previous?.repos?.length && manifest.length < previous.repos.length - 1) {
    const gone = previous.repos
      .map((r) => r.name)
      .filter((n) => !manifest.some((m) => m.name === n));
    console.error(
      `::error::project count dropped from ${previous.repos.length} to ${manifest.length}: ${gone.join(", ")}`,
    );
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
