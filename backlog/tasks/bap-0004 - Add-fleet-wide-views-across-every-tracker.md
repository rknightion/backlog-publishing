---
id: BAP-0004
title: Add fleet-wide views across every tracker
status: Done
assignee: []
created_date: '2026-09-20 13:43'
updated_date: '2026-09-20 14:09'
labels: []
dependencies: []
type: feature
ordinal: 4000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The site has no cross-project view of anything. The index is 25 cards sorted alphabetically showing open and done counts, which says nothing about what is alive: a tracker that moved yesterday and one untouched for a month look identical. Seeing what is in flight across the fleet means visiting every board in turn, and the whole open set is small enough to fit one page.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 An activity page lists recently changed records across every project, newest first
- [x] #2 An open-work page lists every open task across every project, filterable by project, priority and type
- [x] #3 The project index is ordered by most recent activity and each card shows how long ago that project last moved
- [x] #4 A stats page reports completion over time and the type and priority mix across the fleet
- [x] #5 All four are indexable, carry a lastmod, and are reachable from the site header or the index
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added /activity/ (the 250 most recently changed records across every tracker, grouped by day), /open/ (every open task fleet-wide, filtered by project, status, priority, type, label and milestone), and /stats/ (weekly completion, type, priority and status mix, busiest projects). The project index is now ordered by most recent activity across all five record folders rather than alphabetically, and each card carries a relative age alongside an exact time element. Verified in the built output: 147 task cards on /open/, 250 rows on /activity/, 26 weekly bars plus an equivalent accessible table on /stats/, and all four pages in the sitemap with a lastmod.
<!-- SECTION:FINAL_SUMMARY:END -->
