// Tests for link resolution. The rule that matters most is the withholding
// one: content we chose not to publish must not be reachable by linking
// through to GitHub instead.

import test from "node:test";
import assert from "node:assert/strict";
import { resolveLinks } from "../src/lib/rehype-backlog-links.mjs";

// What this fake project publishes. A reference to anything absent from this
// set must come out as text, never as a link to a page that does not exist.
const PUBLISHED = new Set([
  "tasks/sfl-0012",
  "tasks/sfl-0002",
  "docs/doc-0001",
]);
const OPTS = {
  project: "demo",
  repoUrl: "https://github.com/rknightion/demo",
  published: PUBLISHED,
};
const resolve = (html) => resolveLinks(html, OPTS);

test("a bare tracker ID in prose becomes a link to that task", () => {
  assert.match(
    resolve("<p>Blocked by SFL-0012 until then.</p>"),
    /href="\/demo\/tasks\/SFL-0012\/"/,
  );
});

test("a bare ID inside code is left alone", () => {
  const html = resolve("<p><code>SFL-0012</code></p>");
  assert.ok(!html.includes("<a"), html);
});

test("a bare ID inside an existing link does not gain a nested link", () => {
  const html = resolve('<p><a href="https://example.com">SFL-0012</a></p>');
  assert.equal((html.match(/<a /g) ?? []).length, 1);
});

test("prose that merely looks like an ID is not linked", () => {
  // Lowercase and over-long prefixes are excluded deliberately: an RFC number
  // or a version string must not turn into a broken internal link.
  const html = resolve("<p>See rfc-6035 and the LONGPREFIXXX-1 note.</p>");
  assert.ok(!html.includes("<a"), html);
});

test("an ID-shaped string that is not a task here stays as prose", () => {
  // Another project's tracker prefix, or an issue reference. Linking it would
  // produce a confident 404.
  const html = resolve("<p>Mirrors GRA-0007 upstream.</p>");
  assert.ok(!html.includes("<a"), html);
  assert.match(html, /GRA-0007/);
});

test("a link to a task that does not exist becomes text", () => {
  const html = resolve('<p><a href="backlog/tasks/SFL-9999.md">gone</a></p>');
  assert.ok(!html.includes("href="), html);
  assert.match(html, /gone/);
});

test("a relative link to another task resolves to its page", () => {
  const html = resolve(
    '<p><a href="backlog/tasks/SFL-0002.md">that one</a></p>',
  );
  assert.match(html, /href="\/demo\/tasks\/SFL-0002\/"/);
});

test("a relative link to a tracker doc resolves into the docs section", () => {
  const html = resolve(
    '<p><a href="backlog/docs/doc-0001.md">the protocol</a></p>',
  );
  assert.match(html, /href="\/demo\/docs\/doc-0001\/"/);
});

test("a link to a source file points at the repository", () => {
  const html = resolve('<p><a href="src/main.go">main.go</a></p>');
  assert.match(
    html,
    /href="https:\/\/github\.com\/rknightion\/demo\/blob\/HEAD\/src\/main\.go"/,
  );
});

test("a link to withheld tracker content is unlinked, never redirected to GitHub", () => {
  // This is the rule that keeps drafts private. Rewriting it to a blob URL
  // would publish, through the link, exactly what the ingest refused to clone.
  const html = resolve('<p><a href="backlog/drafts/secret.md">a draft</a></p>');
  assert.ok(!html.includes("href="), html);
  assert.match(html, /backlog-unlinked/);
  assert.match(html, /a draft/);
});

test("an archive path is withheld the same way", () => {
  const html = resolve('<p><a href="backlog/archive/tasks/old.md">old</a></p>');
  assert.ok(!html.includes("github.com"), html);
});

test("an absolute URL survives and gains rel=noopener", () => {
  const html = resolve('<p><a href="https://example.com/x">x</a></p>');
  assert.match(html, /href="https:\/\/example\.com\/x"/);
  assert.match(html, /rel="noopener"/);
});

test("an in-page anchor is left exactly as written", () => {
  assert.match(
    resolve('<p><a href="#summary">Summary</a></p>'),
    /href="#summary"/,
  );
});

test("an image becomes its alt text rather than a broken asset request", () => {
  const html = resolve('<p><img src="docs/diagram.png" alt="The flow"></p>');
  assert.ok(!html.includes("<img"), html);
  assert.match(html, /The flow/);
});

test("resolveLinks leaves ordinary prose untouched", () => {
  const html = resolve("<p>Nothing to resolve here.</p>");
  assert.equal(html, "<p>Nothing to resolve here.</p>");
});
