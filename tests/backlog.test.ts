// Tests for the parsing and domain rules. These are the parts with real room
// to be wrong: date coercion, milestone aliasing, column derivation and the
// completed rule. Rendering and layout are not tested here; scripts/build.mjs
// asserts on the built output instead.

import test from "node:test";
import assert from "node:assert/strict";
import {
  deriveColumns,
  milestoneResolver,
  sourceDate,
  asList,
  assertUniqueIds,
  acceptanceProgress,
  urlSegment,
} from "../src/lib/backlog.ts";

const record = (over: Record<string, unknown> = {}) =>
  ({
    id: "T-1",
    title: "A task",
    meta: {},
    body: "",
    sourcePath: "backlog/tasks/T-1.md",
    folder: "tasks",
    completed: false,
    ...over,
  }) as any;

test("sourceDate prefers updated_date over created_date", () => {
  const date = sourceDate({
    created_date: "2026-01-01 09:00",
    updated_date: "2026-02-02 10:00",
  });
  assert.equal(date?.toISOString(), "2026-02-02T10:00:00.000Z");
});

test("sourceDate reads a naive timestamp as UTC, not as the runner's local time", () => {
  // Backlog writes `2026-08-14 16:58` with no zone. Reading that as local time
  // makes every lastmod depend on where the build ran.
  assert.equal(
    sourceDate({ created_date: "2026-08-14 16:58" })?.toISOString(),
    "2026-08-14T16:58:00.000Z",
  );
});

test("sourceDate keeps an explicit offset rather than re-stamping it", () => {
  assert.equal(
    sourceDate({ updated_date: "2026-08-14T16:58:00+01:00" })?.toISOString(),
    "2026-08-14T15:58:00.000Z",
  );
});

test("sourceDate returns null when there is no usable date", () => {
  assert.equal(sourceDate({}), null);
  assert.equal(sourceDate({ created_date: "not a date" }), null);
});

test("deriveColumns keeps the tracker's configured order and drops Done", () => {
  const config = { statuses: ["To Do", "In Progress", "Done"] };
  assert.deepEqual(deriveColumns(config, []), ["To Do", "In Progress"]);
});

test("deriveColumns appends a status seen on a task but missing from config", () => {
  // A status deleted from config.yml must not make its tasks disappear.
  const config = { statuses: ["To Do", "Done"] };
  const tasks = [record({ meta: { status: "Parked" } })];
  assert.deepEqual(deriveColumns(config, tasks), ["To Do", "Parked"]);
});

test("deriveColumns ignores the status of a completed task", () => {
  const tasks = [record({ completed: true, meta: { status: "Archived" } })];
  assert.deepEqual(deriveColumns({ statuses: ["To Do"] }, tasks), ["To Do"]);
});

test("milestoneResolver groups a title and an ID into the same bucket", () => {
  const milestones = [record({ id: "M-1", title: "Beta" })];
  const { key } = milestoneResolver(milestones);
  assert.equal(key(record({ meta: { milestone: "M-1" } })), "M-1");
  assert.equal(key(record({ meta: { milestone: "Beta" } })), "M-1");
});

test("milestoneResolver buckets an unset milestone as Unassigned", () => {
  const { key } = milestoneResolver([]);
  assert.equal(key(record({})), "Unassigned");
});

test("milestoneResolver disambiguates two milestones sharing a title", () => {
  const milestones = [
    record({ id: "M-1", title: "Beta" }),
    record({ id: "M-2", title: "Beta" }),
  ];
  const { title } = milestoneResolver(milestones);
  assert.equal(title("M-1"), "M-1: Beta");
});

test("milestoneResolver refuses an ambiguous title rather than guessing", () => {
  const milestones = [
    record({ id: "M-1", title: "Beta" }),
    record({ id: "M-2", title: "Beta" }),
  ];
  const { key } = milestoneResolver(milestones);
  assert.throws(
    () => key(record({ meta: { milestone: "Beta" } })),
    /ambiguous/i,
  );
});

test("milestoneResolver refuses duplicate milestone IDs", () => {
  const milestones = [record({ id: "M-1" }), record({ id: "M-1" })];
  assert.throws(() => milestoneResolver(milestones), /duplicate/i);
});

test("asList normalises a scalar, a list and an absent value", () => {
  assert.deepEqual(asList("one"), ["one"]);
  assert.deepEqual(asList(["one", "two"]), ["one", "two"]);
  assert.deepEqual(asList(null), []);
  assert.deepEqual(asList(""), []);
});

test("assertUniqueIds catches two records claiming one URL", () => {
  const records = [record({ id: "T-1" }), record({ id: "t-1" })];
  assert.throws(() => assertUniqueIds("demo", records), /duplicate/i);
});

test("sourceDate falls back to a decision's `date`, which is its only date", () => {
  assert.equal(
    sourceDate({ date: "2026-09-09 09:39" })?.toISOString(),
    "2026-09-09T09:39:00.000Z",
  );
});

test("sourceDate still prefers updated_date when a record carries both", () => {
  assert.equal(
    sourceDate({
      date: "2026-01-01 00:00",
      updated_date: "2026-05-05 12:00",
    })?.toISOString(),
    "2026-05-05T12:00:00.000Z",
  );
});

test("acceptanceProgress counts only the acceptance block, never the DoD", () => {
  const body = [
    "## Acceptance Criteria",
    "<!-- AC:BEGIN -->",
    "- [x] #1 One",
    "- [ ] #2 Two",
    "- [x] #3 Three",
    "<!-- AC:END -->",
    "## Definition of Done",
    "<!-- DOD:BEGIN -->",
    "- [ ] #1 Gate",
    "- [ ] #2 Generate",
    "<!-- DOD:END -->",
  ].join("\n");
  assert.deepEqual(acceptanceProgress(body), { checked: 2, total: 3 });
});

test("acceptanceProgress falls back to the heading when the markers are gone", () => {
  // A broken marker silently drops the section on the next Backlog write, so a
  // tracker can legitimately reach us with the heading and no comments.
  const body =
    "## Acceptance Criteria\n- [x] #1 One\n- [ ] #2 Two\n\n## Notes\n- [x] not counted\n";
  assert.deepEqual(acceptanceProgress(body), { checked: 1, total: 2 });
});

test("acceptanceProgress reports nothing for a record with no criteria", () => {
  assert.equal(acceptanceProgress("## Description\n\nJust prose.\n"), null);
});

test("acceptanceProgress treats a declared but empty block as no criteria", () => {
  // "0/0" on a card reads as work not started rather than work with no criteria.
  assert.equal(
    acceptanceProgress("<!-- AC:BEGIN -->\n\n<!-- AC:END -->"),
    null,
  );
});

test("acceptanceProgress counts an uppercase X as met", () => {
  assert.deepEqual(
    acceptanceProgress("<!-- AC:BEGIN -->\n- [X] #1 One\n<!-- AC:END -->"),
    { checked: 1, total: 1 },
  );
});

test("urlSegment rewrites a dot-leading repository name", () => {
  // Workers Static Assets answers 403 for any dot-leading path segment, at the
  // edge, where no build output shows it.
  assert.equal(urlSegment(".github"), "dot-github");
});

test("urlSegment leaves an ordinary name alone", () => {
  assert.equal(urlSegment("sf2loki"), "sf2loki");
  assert.equal(urlSegment("meraki-dashboard-ha"), "meraki-dashboard-ha");
});

test("sourceDate takes a Date the YAML layer already built, rather than restringifying it", () => {
  // A bare `2026-01-01` is a Date under js-yaml 4's schema and a string under
  // 5's. Stringifying the Date gives `Thu Jan 01 2026 ...`, which the naive
  // normalisation turns into `ThuTJan` and the record loses its date entirely.
  const date = new Date("2026-03-04T05:06:00Z");
  assert.equal(
    sourceDate({ created_date: date } as never)?.toISOString(),
    date.toISOString(),
  );
});

test("sourceDate skips an invalid Date and falls through to the next key", () => {
  assert.equal(
    sourceDate({
      updated_date: new Date("nonsense"),
      created_date: "2026-01-02 03:04",
    } as never)?.toISOString(),
    "2026-01-02T03:04:00.000Z",
  );
});
