---
id: BAP-0006
title: Filter and sort search results
status: Done
assignee: []
created_date: '2026-09-20 13:43'
updated_date: '2026-09-20 14:10'
labels: []
dependencies: []
type: feature
ordinal: 6000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The search index emits one filter, project, so the sidebar the default UI would render is a single facet. Status, type and priority are parsed for every record and never reach the index. Results are relevance-ranked with no way to ask what changed most recently, which is the question a tracker search is usually asked.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Status, type and priority are emitted as search filters alongside project
- [x] #2 Results can be sorted by recency, and relevance ranking stays the default
- [x] #3 The build asserts the filters are present in the built index rather than assuming the attributes were emitted
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Emitted status, kind, type and priority as Pagefind filters alongside project, all as attribute captures rather than inline values because an inline value may only be the last item in a capture list. Added an opt-in recency sort; it stays opt-in because Pagefind sorting replaces relevance ranking rather than breaking ties within it, and the default UI takes its sort at construction so the control rebuilds the widget and replays the current term. Build check 10 asserts against what Pagefind reports and the filter indexes it wrote, not against the markup meant to produce them: 5 filters and 1 sort.
<!-- SECTION:FINAL_SUMMARY:END -->
