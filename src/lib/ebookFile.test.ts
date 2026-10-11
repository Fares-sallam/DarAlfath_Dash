import { describe, expect, it } from 'vitest';
import {
  EBOOK_MAX_BYTES,
  EBOOK_TARGET_BYTES,
  PDF_PRESETS,
  checkEbookFile,
  megabytes,
  nextPresetIndex,
  pickSamplePages,
  predictSize,
} from './ebookFile';

const MB = 1024 * 1024;

describe('checkEbookFile', () => {
  it('lets a file up to the limit through as it is', () => {
    expect(checkEbookFile({ name: 'a.pdf', size: 12 * MB })).toEqual({ kind: 'ok' });
    expect(checkEbookFile({ name: 'a.pdf', size: EBOOK_MAX_BYTES })).toEqual({ kind: 'ok' });
  });

  it('asks for a PDF over the limit to be shrunk, by type or by extension', () => {
    expect(checkEbookFile({ name: 'a.pdf', size: 120 * MB })).toEqual({ kind: 'compress' });
    expect(checkEbookFile({ name: 'book', size: 120 * MB, type: 'application/pdf' })).toEqual({ kind: 'compress' });
    expect(checkEbookFile({ name: 'BOOK.PDF', size: EBOOK_MAX_BYTES + 1 })).toEqual({ kind: 'compress' });
  });

  it('refuses other formats over the limit, which cannot be shrunk here', () => {
    expect(checkEbookFile({ name: 'a.epub', size: 80 * MB })).toEqual({ kind: 'too-big' });
    expect(checkEbookFile({ name: 'a.mobi', size: 80 * MB })).toEqual({ kind: 'too-big' });
  });
});

describe('presets', () => {
  it('go from best to leanest and never below 200 dpi', () => {
    for (let i = 1; i < PDF_PRESETS.length; i++) {
      expect(PDF_PRESETS[i].dpi).toBeLessThan(PDF_PRESETS[i - 1].dpi);
      expect(PDF_PRESETS[i].qfactor).toBeGreaterThanOrEqual(PDF_PRESETS[i - 1].qfactor);
    }
    expect(Math.min(...PDF_PRESETS.map((p) => p.dpi))).toBeGreaterThanOrEqual(200);
    // QFactor 0.2 is about JPEG quality 87 — the loosest the pictures are ever encoded.
    expect(Math.max(...PDF_PRESETS.map((p) => p.qfactor))).toBeLessThanOrEqual(0.2);
  });

  it('aim a little under the limit', () => {
    expect(EBOOK_TARGET_BYTES).toBeLessThan(EBOOK_MAX_BYTES);
  });
});

describe('predictSize', () => {
  it('goes with the square of the resolution', () => {
    const half = predictSize(100 * MB, { dpi: 300, qfactor: 0.1 }, { dpi: 150, qfactor: 0.1 });
    expect(half).toBeCloseTo(25 * MB);
  });
});

describe('nextPresetIndex', () => {
  const target = EBOOK_TARGET_BYTES;

  it('skips presets that are clearly too big and lands on the first plausible one', () => {
    // 300 dpi came out at 88 MB (the measured case): 270 → ~71 is clearly too big, 250 → ~61 is within slack.
    const index = nextPresetIndex(PDF_PRESETS, 0, 88 * MB, target);
    expect(PDF_PRESETS[index].dpi).toBe(250);
    // 250 dpi then measured 59 MB: 235 → ~52 is worth a try (it came out at 46 MB for real).
    expect(PDF_PRESETS[nextPresetIndex(PDF_PRESETS, index, 59.1 * MB, target)].dpi).toBe(235);
  });

  it('takes the very next preset when it is predicted to fit', () => {
    expect(nextPresetIndex(PDF_PRESETS, 0, 52 * MB, target)).toBe(1);
  });

  it('falls back to the leanest preset when nothing is predicted to fit', () => {
    expect(nextPresetIndex(PDF_PRESETS, 0, 600 * MB, target)).toBe(PDF_PRESETS.length - 1);
  });

  it('returns -1 once the leanest preset has been tried', () => {
    expect(nextPresetIndex(PDF_PRESETS, PDF_PRESETS.length - 1, 80 * MB, target)).toBe(-1);
  });
});

describe('pickSamplePages', () => {
  it('takes the first, middle and last page without repeats', () => {
    expect(pickSamplePages(48)).toEqual([1, 24, 48]);
    expect(pickSamplePages(2)).toEqual([1, 2]);
    expect(pickSamplePages(1)).toEqual([1]);
    expect(pickSamplePages(0)).toEqual([]);
  });
});

describe('megabytes', () => {
  it('shows one decimal', () => {
    expect(megabytes(120.6 * MB)).toBe('120.6');
    expect(megabytes(0)).toBe('0.0');
  });
});
