# backlog-publishing

Publishes every public `rknightion` repository's Backlog.md tracker as a browsable site at
`backlogs.m7kni.io`. Astro, static output, one assets-only Cloudflare Worker.

This replaced the Backlog rendering that used to live in `m7kni-net-site`, where tracker
content grew to 73% of the built pages and 65% of the search index of a site whose job is
documentation. Docs and trackers are separate sites on purpose; do not reunite them.

## The model

No repository opts in. `scripts/fetch-backlogs.mjs` lists public, non-fork, non-archived
`rknightion` repos, keeps the ones with a `backlog/config.yml`, and sparse-clones just their
`backlog/` directory into `.backlog-cache/`. Adding a tracker to a public repo publishes it;
nothing here changes.

- **Private repositories are never published.** Visibility is the whole access-control model:
  everything on this site is already public on GitHub. There is no token, no allowlist and no
  private clone, and adding one would make a rule that currently cannot fail into one that
  can. A private repo's backlog was once published by accident through the docs hub, which is
  why this is stated rather than assumed.
- `drafts/` and `archive/` are withheld, enforced twice: the sparse-checkout pattern, and an
  allowlist sweep after clone. Two gates, because widening one for an unrelated reason must
  not publish drafts.
- The deny-list in `fetch-backlogs.mjs` is for repos that should not appear despite being
  eligible. Every entry needs a reason or someone deletes it as stale.

## Task interface

`just check` is the gate: `fmt-check`, `lint`, `test`, `build`. It needs no network, because
`just fetch` owns every network call and writes the cache the build reads. Run `just fetch`
once, then `just check` as often as you like, and `just dev` to work against the same cache
offline.

## Freshness is a cron, deliberately

Nothing in the tracked repositories knows this site exists. That is what makes auto-detect
work, and the cost is polling: `.github/workflows/deploy.yml` rebuilds every six hours. A
per-repo `repository_dispatch` would be fresher and would need wiring in every repo, which is
exactly the coupling this design removes. Do not add it without accepting that trade.

## What the build proves, and why each check exists

`scripts/build.mjs` asserts on the built output rather than trusting the build. Every check
corresponds to a failure that is otherwise **silent**, leaving a green build and a broken site:

1. **Pagefind scope.** Pagefind honours `data-pagefind-body` only once at least one page
   carries it, and indexes whole pages otherwise. Losing the attribute gives you a search box
   that returns nav text forever.
2. **Link resolution is not inert.** This has already happened once: the resolver was passed
   to `renderMarkdown` as a `rehypePlugins` option, which that function accepts and discards
   without warning. The build was clean and not one link was rewritten. It now runs as an
   explicit pipeline over the rendered HTML, and the count is asserted.
3. **Boards render server-side.** Cards are in the HTML; JavaScript only hides them. Asserted
   as a count against the ingest manifest, because a project with no open tasks has an empty
   board legitimately.
4. **No third-party subresource.** Fonts and search assets are served from this origin.
5. **Unique titles.** Task titles repeat across projects, so the title must carry the project.
6. **noindex and the sitemap agree.** Records are noindex and absent from the sitemap. The
   `docs/` and `decisions/` _index_ pages are indexable and in it; only the records below
   them are not.
7. **Nothing withheld reached the output.**
8. **Every record page is linked from an index.** Records are noindex and out of the sitemap,
   so a record nothing links to is published in name only. That is exactly what happened to
   all 76 tracker documents until this check existed.
9. **`llms.txt` names the published projects, no more and no fewer.** It is generated from
   the same collections the pages are; a disagreement means the generator and the router have
   diverged.
10. **Pagefind built every filter and the sort.** Asserted against what Pagefind reports and
    the filter indexes it wrote, not against the markup that was meant to produce them.
11. **No dot-leading path segment.** See the trap below.
12. **Every declared `og:image` exists and has text in it.** The rasteriser resolves fonts
    against the build machine; when it finds none it renders the canvas and no glyphs, which
    is a valid PNG at roughly a tenth the size.

## Traps

- **`renderMarkdown(content, options)` takes only `{ fileURL }`.** Anything else is silently
  discarded. See check 2 above.
- **Astro writes `dist/404.html` directly** despite `format: "directory"`. The build moves a
  nested one if that ever changes, and fails if neither exists.
- **A shallow clone is correct here**, and is the opposite of the rule in `m7kni-net-site`.
  That repo forbids `--depth` because its sitemap `lastmod` comes from `git log` per file.
  Here `lastmod` comes from Backlog front matter, so the reason does not apply and the clone
  is much cheaper. Do not reinstate a full clone from muscle memory.
- **A naive tracker timestamp is read as UTC.** `2026-08-14 16:58` carries no zone, so
  reading it as local time makes every `lastmod` depend on where the build ran. `TZ=UTC` is
  also fixed in `build.mjs` for the same reason.
- **A milestone may be named by ID or by title** and both must land in one bucket, or one
  milestone renders as two. An ambiguous title fails the build rather than guessing.
- **Most trackers never use `completed/`.** They mark a task `status: Done` in place, so
  "completed" means either, and a check for the folder alone finds almost nothing.
- **Workers Static Assets answers 403 for any dot-leading path segment.** Not 404, and not
  at build time. `rknightion/.github` is a real repository with a real tracker, so
  `urlSegment()` publishes it under `dot-github` and only its display name keeps the dot. Its
  board was live and unreachable for exactly this reason. Anything that builds a URL from a
  repository name goes through that function.
- **The zone converts every page to Markdown on request**, through Cloudflare's Markdown for
  Agents (`content_converter`), so `Accept: text/markdown` on any URL here returns prose.
  Nothing in this repo produces it and nothing here can test it. Two consequences: do not
  build `.md` twins, and **do not use `<dl>`** - definition lists pass through that converter
  as raw HTML, which is why the record metadata is a `<ul>` with `<strong>` labels.
- **A freshly deployed URL 404s at the Cloudflare edge briefly.** `Cache-Control: no-cache`
  is not enough on a brand-new path; add a query-string cache-buster before believing a 404.

## Agent-facing surfaces

`llms.txt`, JSON-LD on every page, `Link` headers in `public/_headers`, and a
`Content-Signal` line inside the `User-agent` group in `robots.txt` - inside, because a blank
line ends a group and a signal below one applies to nothing. All four are generated or
asserted; none is hand-maintained. Cards under `/og/` are drawn as SVG and rasterised at build
time from the same collections the pages read, so a card cannot claim a count the site does
not show.

## Brand

`@m7kni/tokens` from npm, imported once in `src/styles/global.css`. No colour is written by
hand and no token is copied. The docs hub's `brand.css` is a hand-maintained adaptation of the
same system onto Material's variables; this site does not share that layer and must not grow
a copy of it.

<!-- BACKLOG.MD GUIDELINES START -->
<!-- backlog.md-instructions-version: 1.52.0 -->

<CRITICAL_INSTRUCTION>

## Backlog.md Workflow

This project uses Backlog.md for task and project management.

**At the beginning of each conversation in this project, run `backlog instructions overview` before answering or taking action. Re-read it only if you have not read it yet in the current conversation.**

Use the overview to decide whether to search, read, create, or update Backlog tasks.

Before task lifecycle actions, read the matching detailed guide:

- `backlog instructions task-creation` before creating or splitting tasks
- `backlog instructions task-execution` before planning, changing status or assignee, adding a plan or implementation notes, or implementing task work
- `backlog instructions task-finalization` before checking acceptance criteria, writing final summaries, or moving tasks to terminal statuses

Use `backlog <command> --help` before running unfamiliar commands. Help shows options, fields, and examples.

Do not edit Backlog task, draft, document, decision, or milestone markdown files directly. Use the `backlog` CLI so metadata, relationships, and history stay consistent.

</CRITICAL_INSTRUCTION>
<!-- BACKLOG.MD GUIDELINES END -->
