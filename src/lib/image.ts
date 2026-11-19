/** Image helpers: decode photos (respecting EXIF rotation), shrink for storage, enhance for OCR. */

export interface PreparedImage {
  blob: Blob;
  thumb: Blob;
  width: number;
  height: number;
  /** High-contrast grayscale copy that gives Tesseract cleaner input. */
  ocrCanvas: HTMLCanvasElement;
}

const MAX_STORED = 1800;
const MAX_OCR = 2400;
const THUMB = 240;

async function decode(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      /* fall through to <img> for formats createImageBitmap can't handle */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function sizeOf(src: ImageBitmap | HTMLImageElement): { w: number; h: number } {
  return 'naturalWidth' in src
    ? { w: src.naturalWidth, h: src.naturalHeight }
    : { w: src.width, h: src.height };
}

function draw(src: CanvasImageSource, w: number, h: number, max: number): HTMLCanvasElement {
  const scale = Math.min(1, max / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function toBlob(canvas: HTMLCanvasElement, quality = 0.82): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Could not encode image'))),
      'image/jpeg',
      quality,
    ),
  );
}

/** Grayscale + contrast stretch. Cheap, and it noticeably helps with phone photos of paper. */
function enhanceForOcr(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return canvas;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  const hist = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4) {
    const g = (d[i]! * 299 + d[i + 1]! * 587 + d[i + 2]! * 114) / 1000;
    const v = g | 0;
    d[i] = d[i + 1] = d[i + 2] = v;
    hist[v]!++;
  }
  const total = d.length / 4;
  let lo = 0;
  let hi = 255;
  let acc = 0;
  for (let i = 0; i < 256; i++) {
    acc += hist[i]!;
    if (acc > total * 0.02) {
      lo = i;
      break;
    }
  }
  acc = 0;
  for (let i = 255; i >= 0; i--) {
    acc += hist[i]!;
    if (acc > total * 0.02) {
      hi = i;
      break;
    }
  }
  const range = Math.max(1, hi - lo);
  for (let i = 0; i < d.length; i += 4) {
    const v = Math.max(0, Math.min(255, ((d[i]! - lo) * 255) / range));
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

export async function prepareImage(file: Blob): Promise<PreparedImage> {
  const src = await decode(file);
  const { w, h } = sizeOf(src);
  const stored = draw(src, w, h, MAX_STORED);
  const thumbCanvas = draw(src, w, h, THUMB);
  const ocrCanvas = enhanceForOcr(draw(src, w, h, MAX_OCR));
  if ('close' in src) src.close();
  const [blob, thumb] = await Promise.all([toBlob(stored), toBlob(thumbCanvas, 0.7)]);
  return { blob, thumb, width: stored.width, height: stored.height, ocrCanvas };
}

export function isPdf(file: File | Blob): boolean {
  return file.type === 'application/pdf' || ('name' in file && /\.pdf$/i.test(file.name));
}
