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
