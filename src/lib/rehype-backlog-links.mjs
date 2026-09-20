// Resolve the links inside a tracker record's body.
//
// Three jobs, all on the parsed HTML tree rather than on Markdown text:
//
//   1. A link to another record in the same project becomes a site link.
//   2. A bare tracker ID in prose becomes a link to that record.
//   3. Anything that cannot be proved from the ingest cache is left as text.
//
// Rule 3 is the important one. A tracker is written for people who have the
// repository checked out, so its links routinely point at paths and anchors
// that mean nothing on a public site. Emitting those unchanged produces a page
// full of 404s; emitting them as text is honest.

// It runs as an explicit pipeline over the HTML that Astro's renderMarkdown
// returns, NOT as a plugin passed to renderMarkdown. That function's only
// option is `fileURL`: anything else is accepted and discarded without a
// warning, so passing rehypePlugins there produces a clean build, correct
// looking output, and no link rewriting at all. `resolveLinks` below owns the
// pipeline, and `linkStats` exists so the build can prove it ran.

import { visit } from "unist-util-visit";
import { unified } from "unified";
import rehypeParse from "rehype-parse";
import rehypeStringify from "rehype-stringify";

/** Counts what the last resolveLinks call rewrote, for the build assertion. */
export const linkStats = {
  refs: 0,
  internal: 0,
  source: 0,
  unlinked: 0,
  documents: 0,
};

/**
 * Resolve every link in one record's rendered HTML.
 *
 * @param {string} html   rendered.html from Astro's renderMarkdown
 * @param {{project: string, repoUrl: string, published: Set<string>}} options
 *        `published` holds "<segment>/<lowercased id>" for every record this
 *        project actually publishes, so a link to one we withheld or that does
 *        not exist becomes text instead of a 404.
 * @returns {string} the same HTML with links resolved
 */
export function resolveLinks(html, options) {
  linkStats.documents++;
  return String(
    unified()
      .use(rehypeParse, { fragment: true })
      .use(rehypeBacklogLinks, options)
      .use(rehypeStringify, { allowDangerousHtml: true })
      .processSync(html),
  );
}

// Tracker IDs look like `SFL-0001`, `mkn-0007`, `DOC-3`. Deliberately narrow:
// a looser pattern turns ordinary prose like "RFC-6035" into a broken link.
const BARE_ID = /\b([A-Z][A-Z0-9]{1,9}-\d{1,6})\b/g;

// Elements whose text must never be rewritten. Code is quoted verbatim and an
// existing link must not grow a nested one.
const OPAQUE = new Set(["code", "pre", "a", "script", "style"]);

/**
 * @param {{project: string, repoUrl: string, published: Set<string>}} options
 */
export function rehypeBacklogLinks(options) {
  const { project, repoUrl, published = new Set() } = options;
  const base = repoUrl.replace(/\/+$/, "").replace(/\.git$/, "");

  return (tree) => {
    visit(tree, "element", (node, index, parent) => {
      if (node.tagName === "a") return rewriteAnchor(node);
      if (node.tagName === "img") return replaceImage(node, index, parent);
    });

    // Bare IDs run after anchors so an ID already inside a link is left alone.
    visit(tree, "text", (node, index, parent) => {
      if (!parent || OPAQUE.has(parent.tagName)) return;
      if (!BARE_ID.test(node.value)) return;
      BARE_ID.lastIndex = 0;

      const children = [];
      let cursor = 0;
      for (const match of node.value.matchAll(BARE_ID)) {
        const [id] = match;
        if (match.index > cursor) {
          children.push({
            type: "text",
            value: node.value.slice(cursor, match.index),
          });
        }
        if (!published.has(`tasks/${id.toLowerCase()}`)) {
          // An ID-shaped string that is not a task here: another project's
          // tracker, an issue number, a spec reference. Leave it as prose.
          children.push({ type: "text", value: id });
        } else {
          linkStats.refs++;
          children.push({
            type: "element",
            tagName: "a",
            properties: { href: taskHref(id), className: ["backlog-ref"] },
            children: [{ type: "text", value: id }],
          });
        }
        cursor = match.index + id.length;
      }
      if (cursor < node.value.length) {
        children.push({ type: "text", value: node.value.slice(cursor) });
      }
      parent.children.splice(index, 1, ...children);
      return index + children.length;
    });
  };

  function taskHref(id) {
    return `/${project}/tasks/${encodeURIComponent(id)}/`;
  }

  function rewriteAnchor(node) {
    const href = String(node.properties?.href ?? "").trim();
    if (!href) return;

    // An absolute URL is already meaningful off a checkout. Keep it, but make
    // it safe to follow from a page we publish.
    if (/^https?:\/\//i.test(href)) {
      node.properties.rel = "noopener";
      return;
    }
    // A mail or other scheme, and a pure fragment, are left exactly as written.
    if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return;
    if (href.startsWith("#")) return;

    const clean = href.replace(/^\.\//, "").replace(/^\/+/, "");
    const anchor = href.includes("#") ? href.slice(href.indexOf("#")) : "";

    // Anything under backlog/ is decided here and nowhere else, BEFORE the
    // generic .md rule gets a chance at it. A link to backlog/drafts/x.md
    // otherwise matched ".md" first and became a task URL, which both 404s and
    // defeats the point of never cloning drafts. Order is the whole guard.
    const inTracker = clean.startsWith("backlog/");

    // `backlog/tasks/SFL-0001.md`, `./SFL-0001.md` -> that record's page, but
    // only if the record was actually published. A link to a record we did not
    // publish is a dead link, so it becomes text instead.
    const idFromPath = /(?:^|\/)([^/]+)\.md(?:#.*)?$/.exec(clean);
    if (idFromPath) {
      if (
        inTracker &&
        !/^backlog\/(tasks|completed|milestones|docs|decisions)\//.test(clean)
      ) {
        return unlink(node); // drafts/, archive/, anything else withheld
      }
      const id = idFromPath[1].split(" - ")[0];
      const folder = /backlog\/(docs|decisions)\//.exec(clean)?.[1];
      const segment = folder ?? "tasks";
      if (!published.has(`${segment}/${id.toLowerCase()}`)) return unlink(node);
      node.properties.href = `/${project}/${segment}/${encodeURIComponent(id)}/${anchor}`;
      linkStats.internal++;
      return;
    }

    // A path into the repository that is not a tracker record. Point at the
    // source on GitHub, except anywhere under backlog/: content we chose not to
    // publish must not be reachable by linking through to GitHub instead.
    if (inTracker) return unlink(node);
    if (/^[\w.@-]+(\/[\w.@ -]+)*\.?[\w]*$/.test(clean)) {
      node.properties.href = `${base}/blob/HEAD/${clean}`;
      node.properties.rel = "noopener";
      linkStats.source++;
      return;
    }

    unlink(node);
  }

  /** Replace a link with its own text: keeps the words, drops the dead target. */
  function unlink(node) {
    linkStats.unlinked++;
    node.tagName = "span";
    node.properties = { className: ["backlog-unlinked"] };
  }

  /**
   * Images in a tracker point at files in the repo that this site does not
   * serve, so rendering one guarantees a broken image. Show its alt text as a
   * note instead, and never emit a new externally loaded asset.
   */
  function replaceImage(node, index, parent) {
    if (!parent || index === null) return;
    const alt = String(node.properties?.alt ?? "").trim();
    parent.children.splice(index, 1, {
      type: "element",
      tagName: "span",
      properties: { className: ["backlog-unlinked"] },
      children: [{ type: "text", value: alt || "image" }],
    });
  }
}
