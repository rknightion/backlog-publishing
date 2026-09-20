import type { APIRoute } from "astro";

// Individual records carry noindex in their own markup; the boards and indexes
// are indexable. Nothing is Disallow-ed here, because a crawler blocked from
// fetching a page can never see the noindex on it and may index the URL anyway
// from inbound links. Allow the fetch, let the meta tag do the work.
export const GET: APIRoute = ({ site }) =>
  new Response(
    [
      "User-agent: *",
      "Allow: /",
      "",
      `Sitemap: ${new URL("/sitemap.xml", site).href}`,
      "",
    ].join("\n"),
    { headers: { "Content-Type": "text/plain; charset=utf-8" } },
  );
