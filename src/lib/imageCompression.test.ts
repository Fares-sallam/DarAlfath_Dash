import { describe, expect, it } from 'vitest';
import { PHOTO_COMPRESSION, fitWithin, isLeftAlone, nameForType, psnr } from './imageCompression';

describe('fitWithin', () => {
  it('scales the longest side down to the limit and keeps the proportions', () => {
    expect(fitWithin(2048, 2048, 1600)).toEqual({ width: 1600, height: 1600 });
    expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 });
  });

  it('never enlarges a smaller photo', () => {
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(1600, 1600, 1600)).toEqual({ width: 1600, height: 1600 });
  });

  it('never collapses a very thin photo to zero', () => {
    expect(fitWithin(6000, 2, 1600)).toEqual({ width: 1600, height: 1 });
  });
});

describe('nameForType', () => {
  it('swaps the extension for the one that matches the new type', () => {
    expect(nameForType('cover.png', 'image/webp')).toBe('cover.webp');
    expect(nameForType('photo.final.JPEG', 'image/jpeg')).toBe('photo.final.jpg');
    expect(nameForType('no-extension', 'image/webp')).toBe('no-extension.webp');
    expect(nameForType('.hidden', 'image/png')).toBe('image.png');
  });
});

describe('isLeftAlone', () => {
  const limit = PHOTO_COMPRESSION.keepIfSmallerThan;

  it('leaves formats it can\'t re-encode safely', () => {
    expect(isLeftAlone('image/gif', true, 10, limit)).toBe(true);
    expect(isLeftAlone('image/svg+xml', false, 10_000_000, limit)).toBe(true);
  });

  it('leaves a photo that already fits and is small, but not a big one or one that is too large in pixels', () => {
    expect(isLeftAlone('image/png', true, limit, limit)).toBe(true);
    expect(isLeftAlone('image/png', true, limit + 1, limit)).toBe(false);
    expect(isLeftAlone('image/jpeg', false, 1_000, limit)).toBe(false);
  });
});

describe('psnr', () => {
  const pixels = (...rgb: number[]) => new Uint8ClampedArray(rgb.flatMap((v) => [v, v, v, 255]));

  it('is 99 for identical pictures, and ignores alpha', () => {
    expect(psnr(pixels(10, 200), pixels(10, 200))).toBe(99);
    expect(psnr(new Uint8ClampedArray([5, 5, 5, 0]), new Uint8ClampedArray([5, 5, 5, 255]))).toBe(99);
  });

  it('drops as the pictures differ more', () => {
    const small = psnr(pixels(100, 100, 100, 100), pixels(101, 101, 101, 101)); // off by 1
    const large = psnr(pixels(100, 100, 100, 100), pixels(110, 110, 110, 110)); // off by 10
    expect(small).toBeCloseTo(48.13, 1);
    expect(large).toBeCloseTo(28.13, 1);
    expect(small).toBeGreaterThan(large);
  });
});
