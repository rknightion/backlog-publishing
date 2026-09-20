---
id: BAP-0007
title: Give every page a link preview image
status: Done
assignee: []
created_date: '2026-09-20 13:43'
updated_date: '2026-09-20 14:10'
labels: []
dependencies: []
type: feature
ordinal: 7000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
No page carries an og:image, so every URL from this site previews blank wherever it is pasted. The documentation hub already generates social cards per project; this site shares its design tokens and fonts but none of its assets.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The index, each board and each record page declare an og:image that resolves
- [x] #2 Project pages use an image that identifies the project
- [x] #3 Images are produced by the build rather than committed by hand, or if committed, the build fails when a published project has none
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Cards are drawn as SVG and rasterised by an Astro endpoint, so the counts on a card come from the same collections the pages do and cannot drift. A generic font stack is used deliberately: the rasteriser resolves families against the build machine and a missing family falls back silently with different metrics. Build check 12 collects every og:image any page declares, asserts the file exists, and asserts it clears a size floor, because a card with no font resolved is a valid PNG at roughly a tenth the size. Verified by that check over 25 images and by reading one rendered card.
<!-- SECTION:FINAL_SUMMARY:END -->
