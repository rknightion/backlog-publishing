---
id: BAP-0001
title: Announce changed pages with IndexNow and join the fleet sitemap index
status: Done
assignee: []
created_date: '2026-09-20 12:01'
updated_date: '2026-09-20 12:13'
labels:
  - infra
dependencies: []
priority: medium
ordinal: 1000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
backlogs.m7kni.io is a new origin with no IndexNow submission and no entry in m7kni.io's sitemap index, so its 51 indexable URLs are discovered only by crawl.

Record pages are noindex and absent from the sitemap by design, so only the project index, the 24 boards, completed and milestones pages are announced. Reuse the fleet IndexNow key, served from this site's own root: IndexNow requires the key file to be reachable at the host of the URLs submitted.

Decided against security.txt for this origin (MKN-0027): the repo is public and GitHub is the contact path.

Also slow the rebuild cron. Hourly was chosen when freshness was the only concern; with IndexNow announcing every change it also means pinging search engines about tracker churn nobody searches for.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A key file is served from the site root and the submission uses it as keyLocation
- [x] #2 Only indexable URLs are submitted; noindex record pages are never announced
- [x] #3 Submission is state-based so an unchanged lastmod is not re-announced, and HTTP 202 is treated as success
- [x] #4 m7kni.io's sitemap index lists this site's sitemap
- [x] #5 The rebuild cron runs every 6 hours rather than hourly
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Key file reuses the fleet IndexNow key, served from this site's own root: IndexNow validates by fetching <host>/<key>.txt, so one key works across hosts provided it is reachable at each.

Submission reads dist/sitemap.xml rather than walking dist/, so the announced set is exactly the set the sitemap claims is indexable. Record pages are noindex and absent from the sitemap, so they can never be announced by construction rather than by a filter someone can forget.

State lives in an actions/cache entry keyed per run and restored by prefix, matching the hub's arrangement. HTTP 202 is success (key validation pending) and a non-2xx never fails the run: the deploy already succeeded and a late engine notification is not a reason to mark a good release red.

Cron moved from hourly to every 6 hours. Hourly predated IndexNow, when freshness was the only concern.

Hub side: scripts/generate_sitemaps.py grows BACKLOG_SITE_URL and appends this site's sitemap to m7kni.io's sitemap index. Cross-host entries in a sitemap index are only honoured where both hosts are verified to one owner; both are m7kni.io properties.

Verified live 2026-09-20: key file 200 at the site root, deploy run 35509910272 announced 52 URLs with HTTP 202, and m7kni.io/sitemap.xml lists https://backlogs.m7kni.io/sitemap.xml.

52, not the 51 in the plan: adding this tracker made the site discover and publish itself, so the index is now 25 projects. The recursion works without a special case.
<!-- SECTION:NOTES:END -->
