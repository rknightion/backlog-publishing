// @ts-check
import { defineConfig } from "astro/config";

// Overridable so a preview build can advertise its own origin. Every canonical
// and every sitemap entry derives from `site`, so a preview left on the
// production value would publish canonicals for pages that do not exist there.
const site = process.env.SITE_URL ?? "https://backlogs.m7kni.io";

export default defineConfig({
  site,
  // Pure static. No adapter and no Worker script: wrangler points its asset
  // store at dist/ and every request is served from the edge, unbilled.
  output: "static",
  trailingSlash: "always",
  build: {
    // One directory per route, so /<project>/tasks/<id>/ resolves to an
    // index.html and keeps its trailing slash without a redirect.
    format: "directory",
  },
  // No @astrojs/sitemap. Its `serialize` hook matches pages by URL string, so a
  // trailing-slash mismatch silently drops lastmod and the build stays green.
  // src/pages/sitemap.xml.ts builds the sitemap from the same collection data
  // the pages use, and asserts every URL carries a date.
  markdown: {
    shikiConfig: {
      // Both themes ship and CSS variables choose between them, so a fenced
      // block in a task follows the page theme instead of being burned in.
      themes: { light: "github-light", dark: "github-dark" },
      wrap: false,
    },
  },
});
