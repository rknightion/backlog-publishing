/**
 * Link preview cards, drawn as SVG and rasterised at build time.
 *
 * Fonts are deliberately a generic stack rather than the site's Hanken
 * Grotesk. The rasteriser resolves families against fonts installed on the
 * build machine, and a family it cannot find falls back silently with
 * different metrics - so a card that looked right locally ships subtly wrong
 * from CI. A stack that exists everywhere renders the same in both.
 *
 * Colours are the design system's dark-scheme values written as hex, because
 * the rasteriser does not implement `oklch()` and renders an unknown colour as
 * black without complaining.
 */

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

const CANVAS = "#101618";
const ACCENT = "#66aecb";
const INK = "#e1e5e8";
const MUTED = "#95a1a6";
const FONT = "DejaVu Sans, Liberation Sans, Helvetica, Arial, sans-serif";

/** XML-escape. Descriptions come from GitHub and routinely contain & and <. */
function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Break text into at most `maxLines` lines of roughly `perLine` characters.
 * SVG has no text wrapping, so the alternative is one line running off the
 * canvas.
 */
function wrap(text: string, perLine: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (line && line.length + 1 + word.length > perLine) {
      lines.push(line);
      line = "";
      if (lines.length === maxLines) break;
    }
    line = line ? `${line} ${word}` : word;
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (
    lines.length === maxLines &&
    words.join(" ").length > lines.join(" ").length
  ) {
    lines[maxLines - 1] = `${lines[maxLines - 1].replace(/[.,;:]$/, "")}...`;
  }
  return lines;
}

// Horizontal room for the title: the canvas less the left inset and an equal
// gutter on the right.
const TITLE_WIDTH = OG_WIDTH - 160;
// Mean advance width of the bold generic sans, as a fraction of the font size.
// Deliberately pessimistic: overestimating shrinks a card's title slightly,
// underestimating runs it off the canvas where nothing would report it.
const GLYPH_RATIO = 0.62;
const MAX_TITLE_SIZE = 88;
const MIN_TITLE_SIZE = 32;

/**
 * Font size for a card title, from the width it has to fit rather than from
 * length bands. Repository names arrive from GitHub auto-discovery, so the
 * longest one this site will ever draw is not knowable here.
 */
export function titleFontSize(title: string): number {
  const ideal = Math.floor(
    TITLE_WIDTH / (Math.max(title.length, 1) * GLYPH_RATIO),
  );
  return Math.max(MIN_TITLE_SIZE, Math.min(MAX_TITLE_SIZE, ideal));
}

/** The title, truncated if it would overrun even at the smallest size. */
export function fitTitle(title: string): string {
  const max = Math.floor(TITLE_WIDTH / (MIN_TITLE_SIZE * GLYPH_RATIO));
  return title.length <= max ? title : `${title.slice(0, max - 1)}\u2026`;
}

export interface CardInput {
  /** Small label above the title. */
  eyebrow: string;
  title: string;
  description: string;
  /** Short stats, rendered along the bottom. */
  facts: string[];
}

export function cardSvg({
  eyebrow,
  title,
  description,
  facts,
}: CardInput): string {
  const shown = fitTitle(title);
  const titleSize = titleFontSize(shown);
  const lines = wrap(description, 58, 3);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_WIDTH}" height="${OG_HEIGHT}" viewBox="0 0 ${OG_WIDTH} ${OG_HEIGHT}">
  <rect width="${OG_WIDTH}" height="${OG_HEIGHT}" fill="${CANVAS}"/>
  <rect width="${OG_WIDTH}" height="8" fill="${ACCENT}"/>
  <g font-family="${FONT}">
    <text x="80" y="150" fill="${ACCENT}" font-size="28" letter-spacing="4">${esc(eyebrow.toUpperCase())}</text>
    <text x="80" y="${150 + titleSize + 24}" fill="${INK}" font-size="${titleSize}" font-weight="bold">${esc(shown)}</text>
    ${lines
      .map(
        (line, i) =>
          `<text x="80" y="${150 + titleSize + 100 + i * 46}" fill="${MUTED}" font-size="32">${esc(line)}</text>`,
      )
      .join("\n    ")}
    <text x="80" y="550" fill="${MUTED}" font-size="28">${esc(facts.join("   ·   "))}</text>
    <text x="${OG_WIDTH - 80}" y="550" fill="${ACCENT}" font-size="28" text-anchor="end">backlogs.m7kni.io</text>
  </g>
</svg>`;
}
