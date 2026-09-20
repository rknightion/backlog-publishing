---
id: BAP-0008
title: Stop the edge injecting a WebMCP bridge into every page
status: To Do
assignee: []
created_date: '2026-09-20 13:43'
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
- [ ] #1 The injection is off for this host and for the documentation hub on the same zone
- [ ] #2 The markdown representation still returns under Accept: text/markdown after the change, verified against the live host
- [ ] #3 The setting that was changed is recorded by name so the next person does not have to rediscover it
- [ ] #4 The build or a check notices if the injection returns
<!-- AC:END -->
