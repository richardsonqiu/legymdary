/**
 * Client-side image helpers: phone photos are several MB, so we downscale
 * before uploading. The AI gets a ≤1024px JPEG (~1,000 image tokens); the DB keeps a small thumbnail.
 */

async function decode(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      /* fall through to <img> decoding (e.g. some HEIC cases) */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function draw(
  src: ImageBitmap | HTMLImageElement,
  maxDim: number,
  quality: number,
): string {
  const w = "naturalWidth" in src ? src.naturalWidth : src.width;
  const h = "naturalHeight" in src ? src.naturalHeight : src.height;
  const scale = Math.min(1, maxDim / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.fillStyle = "#fff"; // flatten transparent PNGs
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}

export async function prepareMealPhoto(
  file: Blob,
): Promise<{ analysis: string; thumb: string }> {
  const img = await decode(file);
  try {
    return {
      analysis: draw(img, 1024, 0.8),
      thumb: draw(img, 360, 0.7),
    };
  } finally {
    if ("close" in img) img.close();
  }
}

/**
 * For text-heavy screenshots (e.g. an InBody report): very tall images are
 * cut into overlapping tiles (~1:1.5) so each stays readable once the AI
 * downsizes it. Each tile is ≤1000 px wide JPEG. Max 10 tiles per image.
 */
export async function prepareScreenshotTiles(file: Blob): Promise<string[]> {
  const img = await decode(file);
  try {
    const w = "naturalWidth" in img ? img.naturalWidth : img.width;
    const h = "naturalHeight" in img ? img.naturalHeight : img.height;
    const outW = Math.min(1000, w);
    const scale = outW / w;
    const tileH = Math.round(w * 1.5);
    const overlap = Math.round(w * 0.08);
    const tiles: string[] = [];
    for (let y = 0; y < h && tiles.length < 10; y += tileH - overlap) {
      const sh = Math.min(tileH, h - y);
      if (sh < w * 0.15 && tiles.length) break; // tiny remainder already covered by overlap
      const canvas = document.createElement("canvas");
      canvas.width = outW;
      canvas.height = Math.max(1, Math.round(sh * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas not supported");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, y, w, sh, 0, 0, canvas.width, canvas.height);
      tiles.push(canvas.toDataURL("image/jpeg", 0.85));
      if (y + sh >= h) break;
    }
    return tiles;
  } finally {
    if ("close" in img) img.close();
  }
}
