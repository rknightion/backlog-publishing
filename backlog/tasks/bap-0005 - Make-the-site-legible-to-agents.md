---
id: BAP-0005
title: Make the site legible to agents
status: Done
assignee: []
created_date: '2026-09-20 13:43'
updated_date: '2026-09-20 14:10'
labels: []
dependencies: []
type: feature
ordinal: 5000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Two agent-readiness scans of the live site agree on what is missing. There is no JSON-LD anywhere, which is the weakest scored dimension. There is no llms.txt, which for a site that is an index of 25 trackers is the one file that would let an agent orient without crawling. No Link headers are advertised on any response. robots.txt declares no content usage preference either way. Markdown representations of every page are already served by the edge through content negotiation, verified live, so no markdown twin needs building - the gap is everything that would point an agent at them.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 llms.txt lists every project with its board URL and its current open and completed counts, generated from the ingest rather than hand-maintained
- [x] #2 The index, the boards and the record pages carry JSON-LD describing what they are
- [x] #3 Responses advertise the sitemap and the markdown representation through Link headers
- [x] #4 robots.txt declares content usage preferences
- [x] #5 The build fails if llms.txt names a project the site does not publish, or omits one it does
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added llms.txt generated from the same collections the pages read, JSON-LD on the index, the boards, the record pages and the document indexes, Link headers advertising the sitemap and llms.txt, and a Content-Signal line inside the User-agent group in robots.txt. Two findings from the scans were rejected rather than implemented: markdown negotiation is already served by the zone for every page, verified live, so no markdown twin was built; and the agent-protocol cards were left absent because publishing a card for a server that does not exist is worse than publishing none. Build check 9 fails if llms.txt names a project the router does not publish or omits one it does. Verified by that check over 24 projects, and by every ld+json block on all 956 pages carrying one parsing as JSON.
<!-- SECTION:FINAL_SUMMARY:END -->
