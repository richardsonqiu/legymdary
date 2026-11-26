/**
 * Generates every One Up icon from one SVG mark (web + mobile).
 * Run: node scripts/gen-icons.mjs   (uses sharp, which ships with Next)
 *
 * The mark: a "1" with a Citron up-chevron above it (one rep up) and the
 * Citron full stop from the "one up." wordmark, on Carbon.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const CARBON = "#191919";
const CITRON = "#DED97A";
const PAPER = "#F5F5F0";

/** The mark in a 1024 box, centred. `k` scales it about the centre. */
function glyph(k = 1, ink = PAPER) {
  return `<g transform="translate(512 512) scale(${k}) translate(-554 -496)">
    <path d="M410 290 L540 190 L670 290" fill="none" stroke="${CITRON}" stroke-width="90" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M392 470 L540 360 L540 790" fill="none" stroke="${ink}" stroke-width="116" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="716" cy="748" r="58" fill="${CITRON}"/>
  </g>`;
}

/** rx: corner radius in the 1024 box (0 = full-bleed square, null = no tile). */
function svg({ rx = 230, k = 1, tile = true } = {}) {
  const bg = tile ? `<rect width="1024" height="1024" rx="${rx}" fill="${CARBON}"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${bg}${glyph(k)}</svg>`;
}

async function png(file, size, opts) {
  await sharp(Buffer.from(svg(opts)), { density: 300 }).resize(size, size).png({ compressionLevel: 9 }).toFile(file);
  console.log("wrote", file);
}

/** Minimal .ico with PNG entries (supported by every modern browser). */
async function ico(file, sizes, opts) {
  const pngs = await Promise.all(sizes.map((s) => sharp(Buffer.from(svg(opts)), { density: 300 }).resize(s, s).png().toBuffer()));
  const header = Buffer.alloc(6 + 16 * sizes.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(sizes.length, 4);
  let offset = header.length;
  sizes.forEach((s, i) => {
    const e = 6 + 16 * i;
    header.writeUInt8(s >= 256 ? 0 : s, e);
    header.writeUInt8(s >= 256 ? 0 : s, e + 1);
    header.writeUInt8(0, e + 2);
    header.writeUInt8(0, e + 3);
    header.writeUInt16LE(1, e + 4);
    header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(pngs[i].length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += pngs[i].length;
  });
  writeFileSync(file, Buffer.concat([header, ...pngs]));
  console.log("wrote", file);
}

// ---- Web (Next.js) ----
writeFileSync("public/brand/one-up-mark.svg", svg());
await png("public/icon-192.png", 192, { rx: 230 });
await png("public/icon-512.png", 512, { rx: 230 });
// Maskable: full bleed, mark inside the 80% safe circle.
await png("public/icon-maskable-512.png", 512, { rx: 0, k: 0.74 });
// iOS rounds the corners itself and dislikes transparency.
await png("public/apple-touch-icon.png", 180, { rx: 0, k: 0.86 });
await ico("app/favicon.ico", [16, 32, 48], { rx: 200, k: 1.12 });

// ---- Mobile (Expo) ----
mkdirSync("apps/mobile/assets", { recursive: true });
await png("apps/mobile/assets/icon.png", 1024, { rx: 0, k: 0.86 });
// Android adaptive icon: transparent foreground inside the 66% safe zone.
await png("apps/mobile/assets/adaptive-icon.png", 1024, { tile: false, k: 0.62 });
// Splash: the rounded tile on Paper (light) or Carbon (dark).
await png("apps/mobile/assets/splash-icon.png", 1024, { rx: 230 });
await png("apps/mobile/assets/favicon.png", 48, { rx: 200, k: 1.12 });
