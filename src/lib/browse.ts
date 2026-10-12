// Sorting for the "all tasks" tables. Logic adapted from portina-site
// src/lib/browse.ts (685ec8b); copied, not imported, because the repos are separate.
// No DOM and no Astro, so node --test can reach it.

export interface BrowseItem {
  id: string;
  /** Fleet-wide pages mix projects; absent on a single-project page. */
  project?: string;
  title: string;
  priority: string;
  status: string;
  type: string;
  milestone: string;
  updated: string;
  created?: string;
  /** Share of acceptance criteria checked, 0-1; absent when a task has none. */
  acceptance?: number | null;
}

const PRIORITY_RANK: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};
const MISSING_MILESTONES = new Set(["", "unassigned"]);
const MISSING_TEXT = new Set(["", "unspecified", "not recorded"]);

/** The primary key for a sort, or null when the item has no value for it. */
function sortKey(
  item: BrowseItem,
  sort: string,
  statusOrder: string[],
): string | number | null {
  switch (sort) {
    case "title":
      return item.title;
    case "project":
      return item.project || null;
    case "updated":
      return item.updated || null;
    case "created":
      return item.created || null;
    case "priority":
      return PRIORITY_RANK[item.priority.toLowerCase()] ?? null;
    case "status": {
      const rank = statusOrder.indexOf(item.status);
      return rank >= 0
        ? rank
        : MISSING_TEXT.has(item.status.toLowerCase())
          ? null
          : statusOrder.length;
    }
    case "milestone":
      return MISSING_MILESTONES.has(item.milestone.toLowerCase())
        ? null
        : item.milestone;
    case "type":
      return MISSING_TEXT.has(item.type.toLowerCase()) ? null : item.type;
    case "acceptance":
      return item.acceptance ?? null;
    default:
      return null;
  }
}

/** Dates and acceptance progress read newest or most complete first. */
const DESCENDING = new Set(["updated", "created", "acceptance"]);

/** Whether a column currently reads high-to-low, which is what `aria-sort` reports. */
export function isDescending(sort: string, reverse: boolean): boolean {
  return DESCENDING.has(sort) !== reverse;
}

const natural = (a: string, b: string) =>
  a.localeCompare(b, undefined, { numeric: true });

/**
 * Orders two items by `sort`. `reverse` flips the primary order only: items
 * with no value always sort last and ties always fall back to natural order
 * (project, then ID), so a reversed column never scatters blanks or IDs.
 */
export function compareItems(
  a: BrowseItem,
  b: BrowseItem,
  sort: string,
  { reverse = false, statusOrder = [] as string[] } = {},
): number {
  const tie = natural(a.project ?? "", b.project ?? "") || natural(a.id, b.id);
  if (sort === "id") return reverse ? -tie : tie;
  const left = sortKey(a, sort, statusOrder);
  const right = sortKey(b, sort, statusOrder);
  if (left === null || right === null)
    return left === right ? tie : left === null ? 1 : -1;
  let order =
    typeof left === "number" && typeof right === "number"
      ? left - right
      : natural(String(left), String(right));
  if (DESCENDING.has(sort)) order = -order;
  if (reverse) order = -order;
  return order || tie;
}
