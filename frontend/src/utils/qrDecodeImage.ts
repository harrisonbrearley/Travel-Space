// Decode a QR code from an image file / URI. Works everywhere jsqr does,
// which is web + native (native uses off-screen canvas via react-native's
// image loader — for our PWA-first use case the web path is what matters).
//
// jsqr operates on `ImageData` (Uint8ClampedArray of RGBA pixels). We
// draw the image onto an off-screen HTMLCanvasElement to get that data.

import jsQR from "jsqr";

export async function decodeQrFromUri(uri: string): Promise<string | null> {
  if (typeof document === "undefined") {
    // Native: React Native Web only ships DOM; for a bare native runtime
    // callers should stick with the CameraView scan flow. Returning null
    // here lets the UI show a "not supported" hint instead of crashing.
    return null;
  }

  const img = await loadImage(uri);
  const { canvas, ctx } = makeCanvas(img.naturalWidth || img.width, img.naturalHeight || img.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  // Try the raw resolution first, then progressively downscale — mobile
  // photos are often huge and jsqr can time out on 4000x3000 images.
  const attempts = [1, 0.5, 0.25];
  for (const scale of attempts) {
    const w = Math.max(1, Math.round(canvas.width * scale));
    const h = Math.max(1, Math.round(canvas.height * scale));
    const { ctx: tinyCtx } = makeCanvas(w, h);
    tinyCtx.drawImage(img, 0, 0, w, h);
    const data = tinyCtx.getImageData(0, 0, w, h);
    const found = jsQR(data.data, w, h, { inversionAttempts: "attemptBoth" });
    if (found?.data) return found.data;
  }
  return null;
}

function loadImage(uri: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load image"));
    img.src = uri;
  });
}

function makeCanvas(w: number, h: number) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  return { canvas, ctx };
}
