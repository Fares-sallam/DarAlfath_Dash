import { describe, expect, it } from 'vitest';
import {
  MAX_MEAN_SHIFT,
  MIN_PAGE_PSNR,
  boxDownscale,
  comparePages,
  meanLevel,
  pagesLookIntact,
  parseBmp24,
  psnr,
  type RgbImage,
} from './pdfQuality';

function image(width: number, height: number, pixel: (x: number, y: number) => [number, number, number]): RgbImage {
  const data = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) data.set(pixel(x, y), (y * width + x) * 3);
  }
  return { width, height, data };
}

/** Dark "text" stripes on light paper. */
const page = (shift = 0) => image(60, 60, (x, y) => ((y + shift) % 10 < 3 ? [30, 30, 30] : [230, 225, 210]));

describe('boxDownscale', () => {
  it('averages blocks', () => {
    const half = boxDownscale(image(4, 2, (x) => (x < 2 ? [0, 0, 0] : [200, 100, 50])), 2);
    expect(half.width).toBe(2);
    expect(half.height).toBe(1);
    expect(Array.from(half.data)).toEqual([0, 0, 0, 200, 100, 50]);
  });

  it('leaves the image alone at factor 1', () => {
    const a = page();
    expect(boxDownscale(a, 1)).toBe(a);
  });
});

describe('psnr', () => {
  it('is 99 for identical images and NaN when the sizes differ', () => {
    expect(psnr(page(), page())).toBe(99);
    expect(psnr(page(), image(10, 10, () => [0, 0, 0]))).toBeNaN();
  });

  it('drops as the images drift apart', () => {
    const slight = image(60, 60, (x, y) => (y % 10 < 3 ? [34, 30, 30] : [230, 225, 210]));
    const wrong = image(60, 60, () => [120, 120, 120]);
    expect(psnr(page(), slight)).toBeGreaterThan(psnr(page(), wrong));
    expect(psnr(page(), slight)).toBeGreaterThan(MIN_PAGE_PSNR);
  });
});

describe('pagesLookIntact', () => {
  it('accepts a page that is the same, or nearly', () => {
    expect(pagesLookIntact([comparePages(page(), page())])).toBe(true);
    const grain = image(60, 60, (x, y) => (y % 10 < 3 ? [30 + (x % 3), 30, 30] : [230, 225 - (x % 2), 210]));
    expect(pagesLookIntact([comparePages(page(), grain, 2)])).toBe(true);
  });

  it('rejects a blank page, a different colour, and a size mismatch', () => {
    expect(pagesLookIntact([comparePages(page(), image(60, 60, () => [255, 255, 255]))])).toBe(false);
    expect(pagesLookIntact([comparePages(page(), image(60, 60, (x, y) => (y % 10 < 3 ? [30, 30, 30] : [200, 195, 180])))])).toBe(false);
    expect(pagesLookIntact([comparePages(page(), image(30, 30, () => [0, 0, 0]))])).toBe(false);
  });

  it('rejects when any single page is broken, and when there is nothing to compare', () => {
    expect(pagesLookIntact([comparePages(page(), page()), comparePages(page(), image(60, 60, () => [0, 0, 0]))])).toBe(false);
    expect(pagesLookIntact([])).toBe(false);
  });

  it('is strict about brightness drifting', () => {
    const a = image(20, 20, () => [100, 100, 100]);
    const b = image(20, 20, () => [100 + MAX_MEAN_SHIFT + 2, 100 + MAX_MEAN_SHIFT + 2, 100 + MAX_MEAN_SHIFT + 2]);
    expect(meanLevel(b) - meanLevel(a)).toBeGreaterThan(MAX_MEAN_SHIFT);
    expect(pagesLookIntact([comparePages(a, b, 1)])).toBe(false);
  });
});

describe('parseBmp24', () => {
  /** Builds a bottom-up 24-bit BMP (BGR, rows padded to 4 bytes), the way Ghostscript writes them. */
  function bmp(width: number, height: number, rgb: (x: number, y: number) => [number, number, number]) {
    const rowBytes = Math.ceil((width * 3) / 4) * 4;
    const out = new Uint8Array(54 + rowBytes * height);
    const view = new DataView(out.buffer);
    out[0] = 0x42;
    out[1] = 0x4d;
    view.setUint32(2, out.length, true);
    view.setUint32(10, 54, true);
    view.setUint32(14, 40, true);
    view.setInt32(18, width, true);
    view.setInt32(22, height, true);
    view.setUint16(26, 1, true);
    view.setUint16(28, 24, true);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const [r, g, b] = rgb(x, y);
        const at = 54 + (height - 1 - y) * rowBytes + x * 3;
        out[at] = b;
        out[at + 1] = g;
        out[at + 2] = r;
      }
    }
    return out;
  }

  it('reads pixels back in RGB, top row first, ignoring row padding', () => {
    const parsed = parseBmp24(bmp(3, 2, (x, y) => [x * 40, y * 100, 7]));
    expect(parsed.width).toBe(3);
    expect(parsed.height).toBe(2);
    expect(Array.from(parsed.data.slice(0, 6))).toEqual([0, 0, 7, 40, 0, 7]);
    expect(Array.from(parsed.data.slice(9, 12))).toEqual([0, 100, 7]);
  });

  it('refuses anything that is not a 24-bit BMP', () => {
    expect(() => parseBmp24(new Uint8Array(100))).toThrow('not a BMP');
    const eight = bmp(2, 2, () => [0, 0, 0]);
    new DataView(eight.buffer).setUint16(28, 8, true);
    expect(() => parseBmp24(eight)).toThrow('depth');
  });
});
