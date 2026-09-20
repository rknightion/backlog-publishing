// Reading a Backlog.md tracker off the ingest cache.
//
// Pure parsing and domain rules. Nothing here touches the network, Astro, or
// the filesystem outside `.backlog-cache/`, so it is testable on its own and
// survives a change of site generator.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
// js-yaml 4's `load` is safe by default: its schema constructs only standard
// YAML types, and the JS-specific ones live in a separate package we do not
// install. There is no `safeLoad` to reach for - it was removed when `load`
// became the safe one. This matters because every file parsed here comes from
// a third-party repository.
import yaml from "js-yaml";

export const CACHE_DIR = path.resolve("./.backlog-cache");

/** Folders that may be published. Mirrors scripts/fetch-backlogs.mjs. */
export const PUBLISHED_DIRS = [
  "tasks",
  "completed",
  "milestones",
  "docs",
  "decisions",
] as const;
export type PublishedDir = (typeof PUBLISHED_DIRS)[number];

// A tracker ID has to be safe to put in a URL segment and safe to compare.
// Anything else is a broken tracker, not a page to render defensively.
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

// Backlog.md wraps its sections in HTML comment markers. They carry no meaning
// for a reader and would render as stray comments, so they come out.
const SECTION_MARKERS =
  /<!--\s*(?:SECTION:[\w-]+:|AC:|DOD:)(?:BEGIN|END)\s*-->/g;

const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

// The acceptance-criteria block, by its own markers. Parsing by heading would
// be wrong: the Definition of Done section uses identical `- [x] #N` syntax, so
// a heading-agnostic count of checkboxes reports a number nobody asked for.
const AC_BLOCK = /<!--\s*AC:BEGIN\s*-->([\s\S]*?)<!--\s*AC:END\s*-->/;
const AC_HEADING = /^##[ \t]+Acceptance Criteria\b[ \t]*\r?$/m;
const NEXT_HEADING = /^##[ \t]/m;
const CHECKBOX = /^[ \t]*[-*][ \t]+\[([ xX])\]/gm;

/**
 * Acceptance-criteria progress, counted from the raw body.
 *
 * Must run before `SECTION_MARKERS` strips the comments, which is why it lives
 * here rather than anywhere that sees a rendered record.
 */
export function acceptanceProgress(rawBody: string): AcceptanceProgress | null {
  let block = AC_BLOCK.exec(rawBody)?.[1];
  if (block === undefined) {
    // A broken marker makes Backlog.md drop the section on its next write, so
    // a tracker can legitimately arrive with the heading and no comments. Read
    // from the heading to the next one - a lazy match to `$` under /m stops at
    // the first line ending and counts exactly one criterion, always.
    const at = rawBody.search(AC_HEADING);
    if (at < 0) return null;
    const after = rawBody.slice(at).replace(/^.*\r?\n/, "");
    const next = after.search(NEXT_HEADING);
    block = next < 0 ? after : after.slice(0, next);
  }

  let checked = 0;
  let total = 0;
  for (const match of block.matchAll(CHECKBOX)) {
    total++;
    if (match[1] !== " ") checked++;
  }
  // A declared but empty section is not progress, and rendering "0/0" on a
  // card reads as work that has not started rather than work with no criteria.
  return total === 0 ? null : { checked, total };
}

export interface RepoManifestEntry {
  name: string;
  description: string;
  language: string | null;
  pushedAt: string;
  defaultBranch: string;
  url: string;
  sha: string;
  counts: Record<string, number>;
}

export interface Manifest {
  owner: string;
  fetchedAt: string;
  repos: RepoManifestEntry[];
}

export interface TrackerRecord {
  /** Tracker ID exactly as the front matter spells it, e.g. `SFL-0001`. */
  id: string;
  title: string;
  meta: TrackerMeta;
  body: string;
  /** Path of the source file inside the repo, e.g. `backlog/tasks/x.md`. */
  sourcePath: string;
  folder: PublishedDir;
  completed: boolean;
  /** Acceptance-criteria progress, or null when the record declares none. */
  acceptance: AcceptanceProgress | null;
}

export interface AcceptanceProgress {
  checked: number;
  total: number;
}

export interface TrackerMeta {
  id?: string;
  title?: string;
  status?: string;
  priority?: string;
  labels?: string[] | string;
  milestone?: string;
  dependencies?: string[] | string;
  /** Backlog.md writes `parent_task_id`. `parent` has never been emitted. */
  parent_task_id?: string;
  parent?: string;
  type?: string;
  assignee?: string[] | string;
  references?: string[] | string;
  created_date?: string;
  updated_date?: string;
  [key: string]: unknown;
}

/**
 * The URL segment a repository is published under.
 *
 * Workers Static Assets refuses any path whose segment begins with a dot: it
 * answers 403, not 404, and it does so at the edge where no build output can
 * show it. `rknightion/.github` is a real repository with a real tracker, so
 * its pages are built under a rewritten segment and only its display name
 * keeps the dot. The build asserts no dot-leading segment reaches `dist/`.
 */
export function urlSegment(repo: string): string {
  return repo.startsWith(".") ? `dot-${repo.slice(1)}` : repo;
}

export function loadManifest(): Manifest {
  const file = path.join(CACHE_DIR, "index.json");
  if (!existsSync(file)) {
    throw new Error(
      `No ingest cache at ${file}. Run \`just fetch\` (scripts/fetch-backlogs.mjs) before building.`,
    );
  }
  return JSON.parse(readFileSync(file, "utf8")) as Manifest;
}

export interface TrackerConfig {
  projectName?: string;
  statuses: string[];
  taskPrefix?: string;
}

export function readConfig(project: string): TrackerConfig {
  const file = path.join(CACHE_DIR, project, "backlog", "config.yml");
  const raw = existsSync(file)
    ? (yaml.load(readFileSync(file, "utf8")) as any)
    : {};
  const statuses: string[] = Array.isArray(raw?.statuses)
    ? raw.statuses.map((s: unknown) => String(s))
    : [];
  return {
    projectName: raw?.project_name ? String(raw.project_name) : undefined,
    // Deduplicate: a tracker with a repeated status would otherwise render the
    // same column twice and split its tasks across them.
    statuses: [...new Set(statuses)],
    taskPrefix: raw?.task_prefix ? String(raw.task_prefix) : undefined,
  };
}

function splitFrontMatter(text: string): { meta: TrackerMeta; body: string } {
  const match = FRONT_MATTER.exec(text);
  if (!match) return { meta: {}, body: text };
  const parsed = yaml.load(match[1]);
  return {
    meta: (parsed && typeof parsed === "object" ? parsed : {}) as TrackerMeta,
    body: text.slice(match[0].length),
  };
}

/** Normalise a field that Backlog writes as either a scalar or a list. */
export function asList(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value))
    return value.map((v) => String(v).trim()).filter(Boolean);
  const text = String(value).trim();
  return text ? [text] : [];
}

export function asText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(asText).join(", ");
  return String(value);
}

export function readRecords(
  project: string,
  folder: PublishedDir,
): TrackerRecord[] {
  const dir = path.join(CACHE_DIR, project, "backlog", folder);
  if (!existsSync(dir)) return [];

  const records: TrackerRecord[] = [];
  for (const name of readdirSync(dir).sort()) {
    if (!name.endsWith(".md")) continue;
    const file = path.join(dir, name);
    const { meta, body } = splitFrontMatter(readFileSync(file, "utf8"));

    // Fall back to the filename's leading ID when front matter omits one.
    const id =
      asText(meta.id).trim() || name.split(" - ")[0].replace(/\.md$/, "");
    if (!ID_PATTERN.test(id) || id === "." || id === "..") {
      throw new Error(`${project}: invalid tracker ID in ${name}`);
    }

    records.push({
      id,
      title: asText(meta.title).trim() || id,
      meta,
      body: body.replace(SECTION_MARKERS, ""),
      sourcePath: `backlog/${folder}/${name}`,
      folder,
      acceptance: acceptanceProgress(body),
      // Most trackers in this fleet never use the `completed/` folder and mark
      // a finished task `status: Done` in place, so both have to count.
      completed:
        folder === "completed" || asText(meta.status).toLowerCase() === "done",
    });
  }
  return records;
}

/** Every task, from both the live folder and the archive folder. */
export function readTasks(project: string): TrackerRecord[] {
  return [
    ...readRecords(project, "tasks"),
    ...readRecords(project, "completed"),
  ];
}

/**
 * Board columns: the tracker's own configured order first, then any status
 * actually seen on an open task, so a task in a status someone deleted from
 * config.yml still appears somewhere instead of vanishing.
 *
 * `Done` never gets a column. Completed work has its own page.
 */
export function deriveColumns(
  config: TrackerConfig,
  tasks: TrackerRecord[],
): string[] {
  const columns = [...config.statuses];
  for (const task of tasks) {
    if (task.completed) continue;
    const status = asText(task.meta.status).trim() || "Unspecified";
    if (!columns.includes(status)) columns.push(status);
  }
  return columns.filter((s) => s.toLowerCase() !== "done");
}

/**
 * Milestone grouping. A task's `milestone` field may name either a milestone's
 * ID or its title, and both have to land in the same bucket or one milestone
 * renders as two. Resolving to the ID is what makes that true.
 */
export function milestoneResolver(milestones: TrackerRecord[]) {
  const byId = new Map(milestones.map((m) => [m.id, m]));
  if (byId.size !== milestones.length) {
    throw new Error(
      "duplicate milestone ID; repair the source tracker before publishing",
    );
  }

  function key(task: TrackerRecord): string {
    const value = asText(task.meta.milestone).trim() || "Unassigned";
    if (byId.has(value)) return value;
    const matches = milestones.filter((m) => m.title === value);
    if (matches.length > 1) {
      throw new Error(`ambiguous milestone title ${value}; use a milestone ID`);
    }
    return matches.length === 1 ? matches[0].id : value;
  }

  function title(key: string): string {
    const milestone = byId.get(key);
    if (!milestone) return key;
    // Two milestones sharing a title would be indistinguishable on the page.
    const shared =
      milestones.filter((m) => m.title === milestone.title).length > 1;
    return shared ? `${key}: ${milestone.title}` : milestone.title;
  }

  return { key, title, byId };
}

/**
 * The date a page reports as its last modification.
 *
 * `updated_date`, then `created_date`, then a decision's `date`, with a naive
 * timestamp read as UTC. This
 * is the site's only source of sitemap lastmod: these pages are generated and
 * have no git history of their own, which is also why the ingest is allowed to
 * clone shallowly.
 */
export function sourceDate(meta: TrackerMeta): Date | null {
  // `date` is last because only decisions carry it, and they carry nothing
  // else: a decision has no updated_date, so without this every decision is
  // undated and any page that indexes them has no lastmod to report.
  for (const key of ["updated_date", "created_date", "date"] as const) {
    const raw = asText(meta[key]).trim();
    if (!raw) continue;
    // Backlog writes `2026-08-14 16:58` (no zone). Treat it as UTC rather than
    // as the build machine's local time, or lastmod moves with the runner.
    const normalised = /[zZ]|[+-]\d{2}:?\d{2}$/.test(raw)
      ? raw.replace(" ", "T")
      : `${raw.replace(" ", "T")}Z`;
    const date = new Date(normalised);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return null;
}

/** Guard against two records claiming the same URL within one project. */
export function assertUniqueIds(
  project: string,
  records: TrackerRecord[],
): void {
  const seen = new Map<string, string>();
  for (const record of records) {
    const key = record.id.toLowerCase();
    const existing = seen.get(key);
    if (existing) {
      throw new Error(
        `${project}: duplicate tracker ID ${record.id} (${existing} and ${record.sourcePath})`,
      );
    }
    seen.set(key, record.sourcePath);
  }
}
