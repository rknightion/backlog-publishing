// Sort rules for the "all tasks" tables. Ported from portina-site's browse
// tests (685ec8b), extended with the fleet-wide project tie-break.

import test from "node:test";
import assert from "node:assert/strict";
import {
  compareItems,
  isDescending,
  type BrowseItem,
} from "../src/lib/browse.ts";

const item: BrowseItem = {
  id: "TASK-2",
  title: "Provider routing",
  priority: "high",
  status: "In Progress",
  type: "feature",
  milestone: "Release",
  updated: "2026-09-22",
};
const order = { statusOrder: ["To Do", "In Progress", "Done"] };

test("status sorts in workflow order, not alphabetically", () => {
  const todo = { ...item, id: "TASK-9", status: "To Do" };
  const done = { ...item, status: "Done" };
  // Alphabetically Done < In Progress < To Do; the workflow says the opposite.
  assert.ok(compareItems(todo, item, "status", order) < 0);
  assert.ok(compareItems(item, done, "status", order) < 0);
  assert.ok(compareItems(todo, done, "status", order) < 0);
});

test("an unknown status sorts after every known one, a blank one last", () => {
  const odd = { ...item, status: "Review" };
  const done = { ...item, status: "Done" };
  assert.ok(compareItems(done, odd, "status", order) < 0);
  assert.ok(
    compareItems(odd, { ...item, status: "Unspecified" }, "status", order) < 0,
  );
});

test("items with no value stay last in both directions", () => {
  const blank = { ...item, id: "TASK-1", created: "", acceptance: null };
  const dated = { ...item, created: "2026-09-01", acceptance: 0.5 };
  for (const reverse of [false, true]) {
    assert.ok(compareItems(blank, dated, "created", { reverse }) > 0);
    assert.ok(compareItems(dated, blank, "created", { reverse }) < 0);
    assert.ok(compareItems(blank, dated, "acceptance", { reverse }) > 0);
    const noMilestone = { ...item, milestone: "Unassigned" };
    assert.ok(compareItems(noMilestone, item, "milestone", { reverse }) > 0);
    const noType = { ...item, type: "" };
    assert.ok(compareItems(noType, item, "type", { reverse }) > 0);
    const noPriority = { ...item, priority: "Unspecified" };
    assert.ok(compareItems(noPriority, item, "priority", { reverse }) > 0);
  }
});

test("dates and acceptance run newest or most complete first by default", () => {
  const older = {
    ...item,
    id: "TASK-3",
    created: "2026-08-01",
    acceptance: 0.25,
  };
  const newer = { ...item, created: "2026-09-01", acceptance: 1 };
  assert.ok(compareItems(newer, older, "created") < 0);
  assert.ok(compareItems(newer, older, "acceptance") < 0);
  assert.ok(compareItems(newer, older, "created", { reverse: true }) > 0);
});

test("everything else is ascending, priority by rank not by name", () => {
  const low = { ...item, priority: "low" };
  const critical = { ...item, priority: "critical" };
  assert.ok(compareItems(critical, item, "priority") < 0);
  assert.ok(compareItems(item, low, "priority") < 0);
  assert.ok(compareItems({ ...item, type: "bug" }, item, "type") < 0);
});

test("reverse flips the primary order but not the ID tie-break", () => {
  const twin = { ...item, id: "TASK-10" };
  assert.ok(compareItems(item, twin, "type") < 0); // TASK-2 before TASK-10: natural
  assert.ok(compareItems(item, twin, "type", { reverse: true }) < 0);
  assert.ok(compareItems(item, twin, "id") < 0);
  assert.ok(compareItems(item, twin, "id", { reverse: true }) > 0);
});

test("a fleet-wide tie breaks on project before ID", () => {
  const a = { ...item, project: "alpha", id: "TASK-9" };
  const b = { ...item, project: "beta", id: "TASK-1" };
  assert.ok(compareItems(a, b, "type") < 0);
  assert.ok(compareItems(a, b, "project") < 0);
  assert.ok(compareItems(a, b, "project", { reverse: true }) > 0);
});

test("isDescending names the arrow a header shows", () => {
  assert.equal(isDescending("created", false), true);
  assert.equal(isDescending("created", true), false);
  assert.equal(isDescending("acceptance", false), true);
  assert.equal(isDescending("status", false), false);
  assert.equal(isDescending("status", true), true);
});
