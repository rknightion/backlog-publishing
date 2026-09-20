---
id: BAP-0009
title: Publish the .github tracker under a URL the edge will serve
status: Done
assignee: []
created_date: '2026-09-20 14:10'
updated_date: '2026-09-20 14:10'
labels: []
dependencies: []
priority: high
type: bug
ordinal: 9000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Every board, task and document for rknightion/.github was built, linked from the project index and returned 403 in production. Cloudflare Workers Static Assets refuses any path whose segment begins with a dot: it answers 403 rather than 404, and it does so at the edge, so nothing in the build output or the deploy log shows it. The project index linked straight at it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The tracker is served under a path the edge will return, with the repository name still shown as written
- [x] #2 The build fails if any built path has a dot-leading segment
- [x] #3 Everything that turns a repository name into a URL goes through one function rather than interpolating the name
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added urlSegment(), which rewrites a dot-leading repository name, and threaded it through every route, href, sitemap entry, llms.txt entry and card path; the display name is untouched, so the board still reads .github. Build check 11 fails on any dot-leading segment in dist. Verified live before the fix: backlogs.m7kni.io/.github/ returned 403 while /synthkit/ returned 200. Verified after: the board builds at /dot-github/ with its 5 tasks and 3 documents, and the check passes over 1009 pages.
<!-- SECTION:FINAL_SUMMARY:END -->
