import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { Resvg } from "@resvg/resvg-js";
import { cardSvg, OG_WIDTH } from "../../lib/og";

/**
 * One card per project plus one for the site. Rendered here rather than in a
 * post-build script so the numbers on the card come from the same collections
 * the pages do and cannot drift from them.
 */
export async function getStaticPaths() {
  const [projects, tasks] = await Promise.all([
    getCollection("projects"),
    getCollection("tasks"),
  ]);

  const open = tasks.filter((t) => !t.data.completed).length;

  const site = {
    params: { slug: "site" },
    props: {
      eyebrow: "Project workspace",
      title: "Backlogs",
      description:
        "Public Backlog.md trackers for every open-source repository, published as they are written.",
      facts: [
        `${projects.length} projects`,
        `${open} open`,
        `${tasks.length - open} completed`,
      ],
    },
  };

  return [
    site,
    ...projects.map((project) => ({
      params: { slug: project.data.path },
      props: {
        eyebrow: "Task board",
        title: project.data.slug,
        description: project.data.description || "No description.",
        facts: [
          `${project.data.openCount} open`,
          `${project.data.completedCount} completed`,
          ...(project.data.language ? [project.data.language] : []),
        ],
      },
    })),
  ];
}

export const GET: APIRoute = ({ props }) => {
  const svg = cardSvg(props as Parameters<typeof cardSvg>[0]);
  const png = new Resvg(svg, {
    fitTo: { mode: "width", value: OG_WIDTH },
    // The SVG names a generic stack; without the system fonts there is nothing
    // to resolve it against and every card renders with no text at all.
    font: { loadSystemFonts: true, defaultFontFamily: "sans-serif" },
  })
    .render()
    .asPng();

  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=3600",
    },
  });
};
