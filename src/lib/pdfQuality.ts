/**
 * Checks that a compressed PDF still looks like the original.
 *
 * A few pages of each are rendered and compared. This is a safety net for a
 * result that is broken — a blank or shifted page, wrong colours, a missing
 * picture — not what decides the quality: that is fixed by the presets in
 * ebookFile.ts. Pixel-by-pixel comparison can't judge a scan finely anyway:
 * paper grain and the resampling of sharp edges swamp the number, so the bar
 * is set to catch breakage and let every healthy result through (the usual
 * value on a healthy scan is 33–40 dB).
 */

export interface RgbImage {
  width: number;
  height: number;
  /** width × height × 3 bytes, RGB. */
  data: Uint8Array;
}

/** The least similarity (PSNR, dB) a rendered page may have to the original's. */
export const MIN_PAGE_PSNR = 28;

/** The most the average brightness of a page may move (0–255). */
export const MAX_MEAN_SHIFT = 4;

/** Averages blocks of `factor` × `factor` pixels (the way a viewer shows a page smaller). */
export function boxDownscale(image: RgbImage, factor: number): RgbImage {
  if (factor <= 1) return image;
  const width = Math.floor(image.width / factor);
  const height = Math.floor(image.height / factor);
  const data = new Uint8Array(width * height * 3);
  const area = factor * factor;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let c = 0; c < 3; c++) {
        let sum = 0;
        for (let j = 0; j < factor; j++) {
          const row = (y * factor + j) * image.width;
          for (let i = 0; i < factor; i++) sum += image.data[(row + x * factor + i) * 3 + c];
        }
        data[(y * width + x) * 3 + c] = Math.round(sum / area);
      }
    }
  }
  return { width, height, data };
}

/** Peak signal-to-noise ratio between two same-size images, in dB (99 when identical, NaN if sizes differ). */
export function psnr(a: RgbImage, b: RgbImage): number {
  if (a.width !== b.width || a.height !== b.height) return NaN;
  let squared = 0;
  for (let i = 0; i < a.data.length; i++) {
    const d = a.data[i] - b.data[i];
    squared += d * d;
  }
  const mse = squared / a.data.length;
  return mse === 0 ? 99 : 10 * Math.log10((255 * 255) / mse);
}

/** Average of all channels, 0–255. */
export function meanLevel(image: RgbImage): number {
  let sum = 0;
  for (let i = 0; i < image.data.length; i++) sum += image.data[i];
  return image.data.length ? sum / image.data.length : 0;
}

/** Reads an uncompressed 24-bit BMP (what Ghostscript's `bmp16m` writes) into RGB. */
export function parseBmp24(bytes: Uint8Array): RgbImage {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 54 || view.getUint16(0, true) !== 0x4d42) throw new Error('not a BMP');
  const offset = view.getUint32(10, true);
  const width = view.getInt32(18, true);
  const rawHeight = view.getInt32(22, true);
  const bitsPerPixel = view.getUint16(28, true);
  if (bitsPerPixel !== 24) throw new Error(`unexpected BMP depth ${bitsPerPixel}`);
  const height = Math.abs(rawHeight);
  const topDown = rawHeight < 0;
  const rowBytes = Math.ceil((width * 3) / 4) * 4;
  const data = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y++) {
    const src = offset + (topDown ? y : height - 1 - y) * rowBytes;
    for (let x = 0; x < width; x++) {
      const s = src + x * 3;
      const d = (y * width + x) * 3;
      data[d] = bytes[s + 2];
      data[d + 1] = bytes[s + 1];
      data[d + 2] = bytes[s];
    }
  }
  return { width, height, data };
}

export interface PageComparison {
  psnr: number;
  meanShift: number;
}

/** Original page vs compressed page, both averaged down to reading size first. */
export function comparePages(original: RgbImage, compressed: RgbImage, factor = 3): PageComparison {
  const a = boxDownscale(original, factor);
  const b = boxDownscale(compressed, factor);
  return { psnr: psnr(a, b), meanShift: Math.abs(meanLevel(a) - meanLevel(b)) };
}

/** True when every sampled page is close enough to its original (a size mismatch counts as broken). */
export function pagesLookIntact(comparisons: readonly PageComparison[]): boolean {
  return (
    comparisons.length > 0 &&
    comparisons.every((c) => Number.isFinite(c.psnr) && c.psnr >= MIN_PAGE_PSNR && c.meanShift <= MAX_MEAN_SHIFT)
  );
}
