import type { APIRoute } from "astro";

// Individual records carry noindex in their own markup; the boards and indexes
// are indexable. Nothing is Disallow-ed here, because a crawler blocked from
// fetching a page can never see the noindex on it and may index the URL anyway
// from inbound links. Allow the fetch, let the meta tag do the work.
export const GET: APIRoute = ({ site }) =>
  new Response(
    [
      "User-agent: *",
      // Inside the group, not after it: a blank line ends a robots.txt group,
      // so a Content-Signal below one applies to no user-agent at all.
      // https://contentsignals.org/ - a declaration, not an access control.
      // Everything here is already public in the repositories it is generated
      // from, so all three are yes: refusing training use of content that is
      // published openly on GitHub would be a claim this site cannot enforce
      // and does not mean.
      "Content-Signal: search=yes, ai-input=yes, ai-train=yes",
      "Allow: /",
      "",
      `Sitemap: ${new URL("/sitemap.xml", site).href}`,
      "",
    ].join("\n"),
    { headers: { "Content-Type": "text/plain; charset=utf-8" } },
  );
