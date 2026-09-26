---
id: BAP-0010
title: 'CI hygiene: stable IndexNow cache key and a ci-success aggregator'
status: To Do
assignee: []
created_date: '2026-09-26 15:55'
labels: []
dependencies: []
priority: high
type: chore
ordinal: 10000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
1. `deploy.yml` steps 'Restore/Save the IndexNow state' key on `indexnow-state-${{ github.run_id }}-${{ github.run_attempt }}`, so every main deploy writes a brand-new cache forever (45 entries and counting). Use one stable key and delete the old entry before saving (GitHub will not overwrite an existing key), or move the state somewhere that is not the Actions cache.
2. Add a `ci-success` aggregator job so the fleet's gated `main` ruleset can require it: `if: always()`, `needs:` the jobs below, fail unless every needed result is success (or skipped where that is legitimate). Run it on pull_request and push to main. The aligner only applies the gated ruleset and allow_auto_merge once `ci-success` has reported on the default branch, so nothing breaks before this lands. Jobs: `deploy` (the only job in deploy.yml). This public repo currently has no ruleset at all.

Context: fleet CI hygiene, tracked centrally as GHC-0006 in rknightion/.github. The container-publish.yml buildx cache move to a GHCR registry cache happens there and arrives here through the normal Renovate bump; orphaned PR and tag caches are deleted by the n8n repo-settings aligner. Neither needs work in this repo.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 IndexNow state uses a single stable cache entry
- [ ] #2 deploy.yml emits a ci-success check on PRs and on main
<!-- AC:END -->
