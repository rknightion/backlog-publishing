---
id: BAP-0003
title: Surface the record metadata the ingest already carries
status: Done
assignee: []
created_date: '2026-09-20 13:43'
updated_date: '2026-09-20 14:09'
labels: []
dependencies: []
priority: high
type: feature
ordinal: 3000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Every record is parsed with its full front matter and most of it is then dropped. Acceptance-criteria checkboxes exist on 816 records and the only way to see progress is to open the page and count. type is set on 604 records and is invisible everywhere. dependencies and parent_task_id are rendered as flat text in the meta table rather than links, so a subtask tree that exists in the data is not navigable. assignee is set on 349 records and unused. Separately, the meta table is a definition list, and the edge markdown conversion passes dl/dt/dd through as raw HTML, so every record's agent-facing view carries markup instead of prose.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Task cards and record pages show acceptance-criteria progress as checked-of-total, and omit it when a record has no criteria
- [x] #2 Dependencies and parent link to the records they name, in both directions, and a reference to a record that is not published is rendered as text rather than a dead link
- [x] #3 The record type is shown on task cards and on record pages
- [x] #4 The assignee is shown on record pages when set
- [x] #5 The record meta block converts to prose under Accept: text/markdown with no raw HTML tags
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Parsed acceptance-criteria progress from the AC marker block, never the identically-formatted Definition of Done, and rendered it on cards and record pages; surfaced type and assignee; made dependencies, parent, blocks and subtasks real links resolved against what the project actually publishes. Fixed the field name: the site read meta.parent, which Backlog.md never writes, so all 110 parent_task_id relationships in the fleet parsed as absent with no error to show for it. Replaced the record's definition list with a list, because the edge converts these pages to Markdown on request and passes dl, dt and dd through as raw HTML. Verified in the built output: 110 Parent, 93 Depends on, 83 Blocks and 14 Subtasks rows, matching the front-matter counts in the ingest cache exactly; zero definition lists across 1009 pages; 9 new unit tests covering the parser.
<!-- SECTION:FINAL_SUMMARY:END -->
