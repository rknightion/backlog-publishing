import { defineCollection, z } from "astro:content";
import {
  assertUniqueIds,
  deriveColumns,
  loadManifest,
  milestoneResolver,
  readConfig,
  readRecords,
  readTasks,
  sourceDate,
  asList,
  asText,
  type TrackerRecord,
} from "./lib/backlog";
import { resolveLinks } from "./lib/rehype-backlog-links.mjs";

/**
 * Everything here reads `.backlog-cache/`, which `scripts/fetch-backlogs.mjs`
 * writes. No loader touches the network, so `astro dev` works offline against
 * whatever the last ingest produced.
 */

const dateOrNull = z.union([z.date(), z.null()]);

/** One entry per repository that carries a tracker. */
const projects = defineCollection({
  loader: {
    name: "backlog-projects",
    async load({ store, parseData }) {
      const manifest = loadManifest();
      store.clear();
      for (const repo of manifest.repos) {
        const config = readConfig(repo.name);
        const tasks = readTasks(repo.name);
        const open = tasks.filter((t) => !t.completed);
        const data = await parseData({
          id: repo.name,
          data: {
            slug: repo.name,
            title: config.projectName || repo.name,
            description: repo.description,
            language: repo.language,
            repoUrl: repo.url,
            sha: repo.sha,
            columns: deriveColumns(config, tasks),
            openCount: open.length,
            completedCount: tasks.length - open.length,
            docCount: readRecords(repo.name, "docs").length,
            decisionCount: readRecords(repo.name, "decisions").length,
            milestoneCount: readRecords(repo.name, "milestones").length,
          },
        });
        store.set({ id: repo.name, data });
      }
    },
  },
  schema: z.object({
    slug: z.string().min(1),
    title: z.string().min(1),
    description: z.string(),
    language: z.string().nullable(),
    repoUrl: z.string().url(),
    sha: z.string().regex(/^[0-9a-f]{7,40}$/),
    columns: z.array(z.string()),
    openCount: z.number().int().nonnegative(),
    completedCount: z.number().int().nonnegative(),
    docCount: z.number().int().nonnegative(),
    decisionCount: z.number().int().nonnegative(),
    milestoneCount: z.number().int().nonnegative(),
  }),
});

/**
 * Shared loader for every record-shaped collection. `tasks`, `milestones`,
 * `trackerDocs` and `decisions` differ only in which folder they read, so one
 * function builds all four and they cannot drift apart.
 */
function recordCollection(
  folders: Array<"tasks" | "completed" | "milestones" | "docs" | "decisions">,
) {
  return defineCollection({
    loader: {
      name: `backlog-${folders.join("-")}`,
      async load({ store, parseData, renderMarkdown }) {
        const manifest = loadManifest();
        store.clear();
        for (const repo of manifest.repos) {
          const milestones = readRecords(repo.name, "milestones");
          const resolver = milestoneResolver(milestones);

          const records: TrackerRecord[] = folders.flatMap((f) =>
            readRecords(repo.name, f),
          );
          assertUniqueIds(repo.name, records);

          // Every record this project publishes, in any collection, so link
          // resolution can tell a real cross-reference from a dead one. Built
          // from all five folders rather than just this collection's, because
          // a task routinely links to a doc.
          const published = new Set<string>();
          for (const folder of ["tasks", "completed"] as const) {
            for (const r of readRecords(repo.name, folder))
              published.add(`tasks/${r.id.toLowerCase()}`);
          }
          for (const folder of ["docs", "decisions"] as const) {
            for (const r of readRecords(repo.name, folder))
              published.add(`${folder}/${r.id.toLowerCase()}`);
          }

          for (const record of records) {
            // `<project>/<ID>` keeps two projects' identically-numbered tasks
            // apart. Trackers pick their own prefixes and collisions happen.
            const id = `${repo.name}/${record.id}`;
            const isTask =
              record.folder === "tasks" || record.folder === "completed";
            const data = await parseData({
              id,
              data: {
                project: repo.name,
                taskId: record.id,
                title: record.title,
                status: asText(record.meta.status).trim() || "Unspecified",
                priority: asText(record.meta.priority).trim() || "Unspecified",
                labels: asList(record.meta.labels),
                milestone: isTask ? resolver.title(resolver.key(record)) : null,
                milestoneKey: isTask ? resolver.key(record) : null,
                dependencies: asList(record.meta.dependencies),
                parent: asText(record.meta.parent).trim() || null,
                references: asList(record.meta.references),
                completed: record.completed,
                sourcePath: record.sourcePath,
                repoUrl: repo.url,
                lastmod: sourceDate(record.meta),
              },
              filePath: `.backlog-cache/${repo.name}/${record.sourcePath}`,
            });
            // Link resolution runs on the rendered HTML, after Markdown
            // parsing. Doing it on Markdown text (as the old Python renderer
            // did) means every rewrite has to survive a second parse it does
            // not control, which is where that renderer's escaping complexity
            // came from. It cannot be passed to renderMarkdown as a plugin:
            // see the note at the top of rehype-backlog-links.mjs.
            const rendered = await renderMarkdown(record.body);
            store.set({
              id,
              data,
              body: record.body,
              rendered: {
                ...rendered,
                html: resolveLinks(rendered.html, {
                  project: repo.name,
                  repoUrl: repo.url,
                  published,
                }),
              },
            });
          }
        }

        // Not asserted here. A small collection (six decisions, say) can
        // legitimately contain no cross-references, so a per-collection check
        // fails on correct input. scripts/build.mjs asserts on the built HTML
        // instead, which is both the stronger claim and the one that survives
        // a change to how these loaders are organised.
      },
    },
    schema: z.object({
      project: z.string().min(1),
      taskId: z.string().min(1),
      title: z.string().min(1),
      status: z.string(),
      priority: z.string(),
      labels: z.array(z.string()),
      milestone: z.string().nullable(),
      milestoneKey: z.string().nullable(),
      dependencies: z.array(z.string()),
      parent: z.string().nullable(),
      references: z.array(z.string()),
      completed: z.boolean(),
      sourcePath: z.string(),
      repoUrl: z.string().url(),
      lastmod: dateOrNull,
    }),
  });
}

export const collections = {
  projects,
  tasks: recordCollection(["tasks", "completed"]),
  milestones: recordCollection(["milestones"]),
  trackerDocs: recordCollection(["docs"]),
  decisions: recordCollection(["decisions"]),
};
