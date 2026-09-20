// Formatting shared by the pages. No data access, no Astro.

/**
 * A coarse "how long ago", for cards and feeds.
 *
 * Computed at build time and baked into static HTML, so it is only as fresh as
 * the last deploy. That is bounded by the six-hourly rebuild, and the exact
 * instant always ships alongside it in a `<time datetime>`, so a stale phrase
 * is never the only thing a reader has.
 */
export function relativeTime(
  date: Date | null,
  now: Date = new Date(),
): string {
  if (!date) return "never";
  const days = Math.floor((now.getTime() - date.getTime()) / 86_400_000);
  if (days < 0) return "just now";
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "last week";
  if (days < 61) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  const years = Math.floor(days / 365);
  return years === 1 ? "a year ago" : `${years} years ago`;
}

/** `2026-09-20`, in UTC. The build fixes TZ, so this never moves. */
export function isoDay(date: Date | null): string {
  return date ? date.toISOString().slice(0, 10) : "";
}

/** Where a record of a given kind lives on this site. Takes the URL segment,
 *  not the repository name: they differ wherever the name is not URL-safe. */
export function recordHref(
  project: string,
  kind: "tasks" | "docs" | "decisions",
  id: string,
): string {
  return `/${project}/${kind}/${encodeURIComponent(id)}/`;
}

/**
 * Serialise structured data for an inline `<script type="application/ld+json">`.
 *
 * Every `<` becomes `<`. Titles and descriptions on this site come from
 * third-party repositories, and one containing `</script>` would otherwise
 * close the block and inject markup into the page. The escape is still valid
 * JSON, so a consumer parses exactly the same object.
 */
export function jsonLdScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
