// Compression navigateur avant upload (réduit poids/dimensions).
export async function compressImage(file, { maxW = 1600, quality = 0.82 } = {}) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxW / bitmap.width);
  const w = Math.round(bitmap.width * scale), h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  canvas.getContext("2d").drawImage(bitmap, 0, 0, w, h);
  return new Promise((res) => canvas.toBlob((b) => res(b), "image/webp", quality));
}
