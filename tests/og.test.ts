// Card titles are repository names, which arrive from GitHub auto-discovery.
// The longest one this site will ever draw is not knowable, and an overrun
// produces a valid PNG with the name running off the canvas - which no build
// assertion can see, because the card is an image.

import test from "node:test";
import assert from "node:assert/strict";
import { titleFontSize, fitTitle, cardSvg, OG_WIDTH } from "../src/lib/og.ts";

const RATIO = 0.62;
const width = (title: string) => title.length * titleFontSize(title) * RATIO;

test("a short title takes the largest size", () => {
  assert.equal(titleFontSize("sf2loki"), 88);
});

test("every plausible title length stays inside the canvas", () => {
  for (let n = 1; n <= 52; n++) {
    const title = "x".repeat(n);
    assert.ok(
      80 + width(title) <= OG_WIDTH,
      `a ${n}-character title is ${Math.round(width(title))}px wide`,
    );
  }
});

test("the longest name in the fleet today still fits", () => {
  const title = "grafana-cloud-vending-machine";
  assert.ok(80 + width(title) <= OG_WIDTH);
});

test("a title too long even at the smallest size is truncated, not overrun", () => {
  const title =
    "a-really-very-extremely-long-repository-name-that-keeps-going-and-going";
  const shown = fitTitle(title);
  assert.ok(shown.length < title.length);
  assert.ok(shown.endsWith("…"));
  assert.ok(80 + width(shown) <= OG_WIDTH);
});

test("a title that fits is not touched", () => {
  assert.equal(
    fitTitle("meraki-dashboard-exporter"),
    "meraki-dashboard-exporter",
  );
});

test("cardSvg escapes markup coming from a repository description", () => {
  const svg = cardSvg({
    eyebrow: "Task board",
    title: "demo",
    description: 'A & B <script>alert("x")</script>',
    facts: ["1 open"],
  });
  assert.ok(!svg.includes("<script>"));
  assert.ok(svg.includes("&amp;"));
});
