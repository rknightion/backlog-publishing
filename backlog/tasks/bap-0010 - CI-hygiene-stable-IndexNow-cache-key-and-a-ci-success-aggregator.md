---
id: BAP-0010
title: 'CI hygiene: stable IndexNow cache key and a ci-success aggregator'
status: Done
assignee: []
created_date: '2026-09-26 15:55'
updated_date: '2026-09-26 17:16'
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
- [x] #1 IndexNow state uses a single stable cache entry
- [x] #2 deploy.yml emits a ci-success check on PRs and on main
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixed both acceptance criteria in .github/workflows/deploy.yml.

1. IndexNow cache key: replaced the run/attempt-unique key with one stable key (indexnow-state) for both restore and save. Since GitHub will not overwrite an existing cache entry, the old entry is deleted before each save. That delete needs actions:write on the token, which is now isolated in a new save-indexnow-cache job (needs: deploy) rather than added to the deploy job itself, because deploy also runs npm ci / just check against pull_request code and giving that job repo-wide cache-delete rights would have been an unnecessary permission escalation reachable from PR-triggered dependency code (CodeRabbit flagged this as major on the first pass; fixed by splitting the job and handing the state file across via actions/upload-artifact + download-artifact). The delete step filters gh cache list results to an exact key match (gh's --key flag is prefix-matching, so an unfiltered match would have caught the 45+ old run-unique entries) and deletes every match via explicit command substitution rather than process substitution, so a real API/auth failure surfaces instead of being swallowed alongside the legitimate no-cache-yet case. The upload-artifact step sets include-hidden-files: true (.indexnow-state.json is a dotfile, silently dropped otherwise) and if-no-files-found: error.

2. ci-success aggregator: added as its own job, if: always(), needs: [deploy, save-indexnow-cache], failing on any failure/cancelled result. deploy's deploy/IndexNow steps (and now save-indexnow-cache entirely) are already guarded to skip on pull_request, so a PR run reports ci-success once the build/check steps in deploy pass; save-indexnow-cache's skip there is legitimate (mirrors deploy's own guard) so it doesn't fail the aggregator.

Verified: just check passes; actionlint clean; zizmor shows only one pre-existing high finding (cache-poisoning on the existing setup-node step, present before this change, unrelated to what changed here); CodeRabbit --agent --base main went from 2 major findings (job-permission scope, error-swallowing) through two more fix/re-review rounds (prefix-match over-matching, hidden-file/process-substitution issues) to 0 findings on the final pass.
<!-- SECTION:FINAL_SUMMARY:END -->
