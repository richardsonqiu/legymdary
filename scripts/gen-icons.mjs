/**
 * Generates every One Up icon (web + mobile) from the "one up." wordmark.
 * Run: node scripts/gen-icons.mjs   (uses sharp, which ships with Next)
 *
 * The letters are Geist Bold outlines saved in scripts/brand/one-up-wordmark.json
 * (made with scripts/brand/extract-wordmark.py), so no font is needed here.
 * Paper text with a round Citron full stop on Carbon, like the in-app logo.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const W = JSON.parse(readFileSync(new URL("./brand/one-up-wordmark.json", import.meta.url), "utf8"));
const CARBON = "#191919";
const CITRON = "#DED97A";
const PAPER = "#F5F5F0";
/** Citron is too pale on Paper; the light theme uses this olive instead. */
const OLIVE = "#8A851F";

/**
 * The full stop is a round dot, like the in-app .wordmark: 0.22 em wide,
 * 0.07 em after the last letter, sitting on the baseline (1 em = 1000 units).
 */
const R = 110;
const dot = (afterX, fill) => `<circle cx="${afterX + 70 + R}" cy="${-R}" r="${R}" fill="${fill}"/>`;

/** "one up." on one line, centred in a 1024 box. k = scale of the 1000-unit font. */
function line(k, ink = PAPER, stop = CITRON) {
  const cx = (W.wordBounds[0] + W.wordBounds[2] + 70 + 2 * R) / 2;
  const cy = -250; // middle of the x-height, so the descender of "p" hangs naturally
  return `<g transform="translate(512 512) scale(${k}) translate(${-cx} ${-cy})"><path d="${W.word}" fill="${ink}"/>${dot(W.wordBounds[2], stop)}</g>`;
}

/** "one" over "up." for tiny sizes (browser tab), where one line is unreadable. */
function stacked(k) {
  const x0 = Math.min(W.oneBounds[0], W.upBounds[0]);
  const x1 = Math.max(W.oneBounds[2], W.upBounds[2] + 70 + 2 * R);
  const lead = 820;
  const cx = (x0 + x1) / 2;
  const cy = (-560 + lead + 150) / 2 - 40;
  return `<g transform="translate(512 512) scale(${k}) translate(${-cx} ${-cy})"><path d="${W.one}" fill="${PAPER}"/><g transform="translate(0 ${lead})"><path d="${W.up}" fill="${PAPER}"/>${dot(W.upBounds[2], CITRON)}</g></g>`;
}

/** rx: corner radius (0 = full-bleed square), bg null = transparent. */
function svg(inner, { rx = 230, bg = CARBON } = {}) {
  const rect = bg ? `<rect width="1024" height="1024" rx="${rx}" fill="${bg}"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${rect}${inner}</svg>`;
}

const render = (s, size) => sharp(Buffer.from(s), { density: 300 }).resize(size, size).png({ compressionLevel: 9 });

async function png(file, size, s) {
  await render(s, size).toFile(file);
  console.log("wrote", file);
}

/** Minimal .ico with PNG entries (supported by every modern browser). */
async function ico(file, sizes, s) {
  const pngs = await Promise.all(sizes.map((n) => render(s, n).toBuffer()));
  const header = Buffer.alloc(6 + 16 * sizes.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(sizes.length, 4);
  let offset = header.length;
  sizes.forEach((n, i) => {
    const e = 6 + 16 * i;
    header.writeUInt8(n >= 256 ? 0 : n, e);
    header.writeUInt8(n >= 256 ? 0 : n, e + 1);
    header.writeUInt16LE(1, e + 4);
    header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(pngs[i].length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += pngs[i].length;
  });
  writeFileSync(file, Buffer.concat([header, ...pngs]));
  console.log("wrote", file);
}

const ICON = svg(line(0.235));

// ---- Web (Next.js) ----
mkdirSync("public/brand", { recursive: true });
writeFileSync("public/brand/one-up-icon.svg", ICON);
await png("public/icon-192.png", 192, ICON);
await png("public/icon-512.png", 512, ICON);
// Maskable: full bleed, text inside the 80% safe circle.
await png("public/icon-maskable-512.png", 512, svg(line(0.2), { rx: 0 }));
// iOS rounds the corners itself and dislikes transparency.
await png("public/apple-touch-icon.png", 180, svg(line(0.235), { rx: 0 }));
await ico("app/favicon.ico", [16, 32, 48], svg(stacked(0.4), { rx: 200 }));

// ---- Mobile (Expo) ----
mkdirSync("apps/mobile/assets", { recursive: true });
await png("apps/mobile/assets/icon.png", 1024, svg(line(0.235), { rx: 0 }));
// Android adaptive icon: transparent foreground inside the 66% safe zone.
await png("apps/mobile/assets/adaptive-icon.png", 1024, svg(line(0.18), { bg: null }));
// Splash: just the wordmark, on Paper (light) or Carbon (dark).
await png("apps/mobile/assets/splash-icon.png", 1024, svg(line(0.28, CARBON, OLIVE), { bg: null }));
await png("apps/mobile/assets/splash-icon-dark.png", 1024, svg(line(0.28), { bg: null }));
await png("apps/mobile/assets/favicon.png", 48, svg(stacked(0.4), { rx: 200 }));
