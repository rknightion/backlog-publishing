# backlog-publishing

Publishes every public [rknightion](https://github.com/rknightion) repository's
[Backlog.md](https://backlog.md) tracker at **[backlogs.m7kni.io](https://backlogs.m7kni.io)**.

Each project gets a task board, a completed-work page, milestone progress, and a page per
task, document and decision. Full-text search spans every project.

## How a repository gets published

Make it public and commit a `backlog/` directory. That is the whole process: the build lists
public repositories, keeps the ones carrying `backlog/config.yml`, and publishes them.

Private repositories are never published, and `drafts/` and `archive/` are never read.

## Working on it

```bash
just setup    # install the pinned toolchain
just fetch    # refresh .backlog-cache/ from GitHub (the only network step)
just dev      # serve locally against that cache
just check    # the gate: format, types, tests, build and its assertions
```

`just fetch` is deliberately not part of `just check`, so the gate runs offline and a GitHub
outage cannot fail a build that has a warm cache.

## Layout

| Path                               | What it is                                        |
| ---------------------------------- | ------------------------------------------------- |
| `scripts/fetch-backlogs.mjs`       | Repository discovery and sparse cloning           |
| `scripts/build.mjs`                | Build, Pagefind index, and every output assertion |
| `src/lib/backlog.ts`               | Tracker parsing and domain rules, no framework    |
| `src/lib/rehype-backlog-links.mjs` | Link resolution over rendered HTML                |
| `src/content.config.ts`            | Astro collections, one per record type            |

`AGENTS.md` carries the design decisions and the traps.
