---
id: BAP-0002
title: Reach every published doc and decision from the site
status: Done
assignee: []
created_date: '2026-09-20 13:43'
updated_date: '2026-09-20 14:09'
labels: []
dependencies: []
priority: high
type: bug
ordinal: 2000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The ingest publishes 76 tracker docs and 2 decisions, and nothing on the site links to any of them. A board links Completed, Milestones and Repository only, there is no per-project index for either folder, and record pages are noindex so they are absent from the sitemap too. Today they are reachable only through full-text search or a cross-reference from a task, which means the durable reference material each tracker carries is effectively unpublished.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A per-project page lists that project's docs and decisions, linking each one
- [x] #2 The board links to it whenever the project has at least one doc or decision
- [x] #3 The build fails if a published record has no route that reaches it from the project index
- [x] #4 The new page is indexable and carries a lastmod in the sitemap
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added /<project>/docs/ and /<project>/decisions/ index pages, generated only where the project publishes that kind, linked from the board and listed in the sitemap with a lastmod from the newest record they hold. Build check 8 now fails if any record page is reachable only by search or a cross-reference: it collects every href on every non-record page and asserts each record URL appears. Verified by that check passing over 1009 built pages with 24 document indexes present, and by the 78 previously orphaned documents and decisions now being linked.
<!-- SECTION:FINAL_SUMMARY:END -->
