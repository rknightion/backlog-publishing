---
id: BAP-0008
title: Stop the edge injecting a WebMCP bridge into every page
status: Done
assignee: []
created_date: '2026-09-20 13:43'
updated_date: '2026-09-20 14:46'
labels: []
dependencies: []
type: chore
ordinal: 8000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Every response on this zone carries an injected module script pointing at a bridge under a dot-prefixed path, roughly 47 KB, on every page including the 404. It is not in the build output and no assertion can see it, because it is same-origin and added after the asset is served. It exposes two image-provenance tools to a site that has no images. The sibling zone that hosts a different site does not have it. The same zone also has edge markdown conversion enabled, which is wanted and must stay on: these are separate toggles and turning off the wrong one would remove the markdown representations the rest of the agent work depends on.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The injection is off for this host and for the documentation hub on the same zone
- [x] #2 The markdown representation still returns under Accept: text/markdown after the change, verified against the live host
- [x] #3 The setting that was changed is recorded by name so the next person does not have to rediscover it
- [x] #4 The build or a check notices if the injection returns
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The control is a hidden zone setting, webmcp_enabled, which GET /zones/{zone}/settings does not enumerate: it lists 56 settings and names neither this nor content_converter, so both have to be addressed by name. It had been on since 2026-08-29. Patched to off and the zone cache purged, because the injected markup was already cached and the setting alone does not reach it. Verified live across both hosts on the zone: zero script references on the index, the boards, a record page and the documentation hub, and /.webmcp/bridge.js now 404 where it previously served 47 KB. content_converter was read before and after and is untouched at on; Accept: text/markdown still returns 200 text/markdown for both hosts. The deploy workflow now probes bridge.js after every release and expects a 404, marked continue-on-error so a zone setting flipping back is visible on the run without marking a good release failed.
<!-- SECTION:FINAL_SUMMARY:END -->
