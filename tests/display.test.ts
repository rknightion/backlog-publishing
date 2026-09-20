// Formatting rules that are easy to get subtly wrong and impossible to notice:
// an off-by-one in a relative phrase reads as plausible no matter what it says.

import test from "node:test";
import assert from "node:assert/strict";
import {
  relativeTime,
  isoDay,
  recordHref,
  jsonLdScript,
} from "../src/lib/display.ts";

const now = new Date("2026-09-20T12:00:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);

test("relativeTime names the near past exactly", () => {
  assert.equal(relativeTime(daysAgo(0), now), "today");
  assert.equal(relativeTime(daysAgo(1), now), "yesterday");
  assert.equal(relativeTime(daysAgo(3), now), "3 days ago");
});

test("relativeTime coarsens as it goes back", () => {
  assert.equal(relativeTime(daysAgo(10), now), "last week");
  assert.equal(relativeTime(daysAgo(30), now), "4 weeks ago");
  assert.equal(relativeTime(daysAgo(200), now), "6 months ago");
  assert.equal(relativeTime(daysAgo(400), now), "a year ago");
  assert.equal(relativeTime(daysAgo(900), now), "2 years ago");
});

test("relativeTime does not report the future as the distant past", () => {
  // A tracker with a clock-skewed timestamp would otherwise read as ancient.
  assert.equal(
    relativeTime(new Date(now.getTime() + 86_400_000), now),
    "just now",
  );
});

test("relativeTime handles a record with no date", () => {
  assert.equal(relativeTime(null, now), "never");
});

test("isoDay is UTC, not the runner's zone", () => {
  assert.equal(isoDay(new Date("2026-01-01T23:30:00Z")), "2026-01-01");
  assert.equal(isoDay(null), "");
});

test("recordHref keeps the trailing slash the site is configured for", () => {
  assert.equal(
    recordHref("sf2loki", "tasks", "SFL-0001"),
    "/sf2loki/tasks/SFL-0001/",
  );
});

test("recordHref escapes an ID that would otherwise change the path", () => {
  assert.equal(recordHref("demo", "docs", "a/b"), "/demo/docs/a%2Fb/");
});

test("jsonLdScript cannot be closed by a record title", () => {
  // Titles come from third-party repositories. A raw `</script>` in one would
  // end the ld+json block and put whatever followed into the document.
  const out = jsonLdScript({
    name: "Fix </script><img src=x onerror=alert(1)>",
  });
  assert.ok(!out.includes("<"), "no raw angle bracket may survive");
  assert.ok(out.includes("\\u003c"), "the bracket is escaped, not dropped");
});

test("jsonLdScript still produces the same object once parsed", () => {
  const value = { "@type": "CreativeWork", name: "a < b", n: 1 };
  assert.deepEqual(JSON.parse(jsonLdScript(value)), value);
});
