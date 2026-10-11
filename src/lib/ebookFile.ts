/**
 * Size rules for ebook files.
 *
 * The private `ebooks` bucket refuses anything over 50 MB. A scanned book is
 * often more than twice that, so a PDF above the limit is shrunk in the
 * browser (see pdfCompression.ts) before it goes up. The presets below are
 * what keeps that from costing quality: none of them is lower than 200 dpi
 * with a high JPEG quality and no colour subsampling, which is the usual
 * "no visible loss" setting for scanned text, and the search stops at the
 * best-looking one that fits. If even the leanest preset is too big, the file
 * is refused — it is never squeezed further.
 */

/** The `ebooks` bucket's own limit. */
export const EBOOK_MAX_BYTES = 50 * 1024 * 1024;

/** A little under the limit, so the file never lands right on it. */
export const EBOOK_TARGET_BYTES = Math.floor(EBOOK_MAX_BYTES * 0.98);

export interface PdfPreset {
  /** Pictures sharper than this are scaled down to it (pixels per inch). */
  dpi: number;
  /** JPEG QFactor for the pictures: lower is better (0.1 is ≈ quality 92, 0.2 is ≈ 87). */
  qfactor: number;
}

/** Best-looking first. Never below 200 dpi. */
export const PDF_PRESETS: readonly PdfPreset[] = [
  { dpi: 300, qfactor: 0.1 },
  { dpi: 270, qfactor: 0.1 },
  { dpi: 250, qfactor: 0.12 },
  { dpi: 235, qfactor: 0.12 },
  { dpi: 220, qfactor: 0.15 },
  { dpi: 200, qfactor: 0.2 },
];

export type EbookCheck =
  /** Fits as it is. */
  | { kind: 'ok' }
  /** A PDF over the limit: shrink it first. */
  | { kind: 'compress' }
  /** Over the limit and not something that can be shrunk here (EPUB, MOBI). */
  | { kind: 'too-big' };

export function isPdf(file: { name: string; type?: string }): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
}

export function checkEbookFile(file: { name: string; size: number; type?: string }): EbookCheck {
  if (file.size <= EBOOK_MAX_BYTES) return { kind: 'ok' };
  return isPdf(file) ? { kind: 'compress' } : { kind: 'too-big' };
}

/** "120.6" — megabytes with one decimal, as the form shows sizes. */
export function megabytes(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
}

/**
 * Roughly how big the file would be at `to`, given that it came out at
 * `measuredBytes` with `from`. Picture area (so size) goes with dpi squared.
 * The leaner presets also use a looser QFactor, which only makes the result
 * smaller, so this leans a little high. It is only used to skip presets that
 * are clearly too big, never to accept one: every result is measured.
 */
export function predictSize(measuredBytes: number, from: PdfPreset, to: PdfPreset): number {
  return measuredBytes * (to.dpi / from.dpi) ** 2;
}

/**
 * The next preset worth trying after `fromIndex` produced `measuredBytes`:
 * the first leaner one whose predicted size isn't hopelessly over the target
 * (each try on a 100 MB+ file takes a while, so clear misses are skipped).
 * -1 when none is left.
 */
export function nextPresetIndex(
  presets: readonly PdfPreset[],
  fromIndex: number,
  measuredBytes: number,
  targetBytes: number,
  slack = 1.25,
): number {
  for (let i = fromIndex + 1; i < presets.length; i++) {
    if (predictSize(measuredBytes, presets[fromIndex], presets[i]) <= targetBytes * slack) return i;
  }
  // Nothing is predicted to fit: still try the leanest one, it is the last chance.
  return fromIndex < presets.length - 1 ? presets.length - 1 : -1;
}

/** First, middle and last page (1-based), without repeats — enough to catch a broken result. */
export function pickSamplePages(pageCount: number): number[] {
  if (pageCount <= 0) return [];
  return [...new Set([1, Math.ceil(pageCount / 2), pageCount])];
}

/** Arabic text for the progress panel and the toasts. */
export const EBOOK_MESSAGES = {
  tooBigFormat: (size: string) =>
    `الملف ${size} م.ب وأكبر من الحد المسموح (50 م.ب). الضغط التلقائي متاح لملفات PDF بس، قلّل حجم الملف وارفعه تاني.`,
  cannotReachTarget: (smallest: string) =>
    `مقدرناش نوصّل حجم الملف لـ 50 م.ب من غير ما الجودة تتأثر (أصغر نتيجة كانت ${smallest} م.ب). قسّم الكتاب لجزأين أو ارفع نسخة أخف.`,
  failedCheck:
    'الملف المضغوط ماعداش فحص السلامة (عدد الصفحات أو شكلها اختلف عن الأصل) فمش هنرفعه. جرّب ملف تاني أو صغّره من برنامج تاني.',
  unreadable: 'تعذّرت قراءة ملف الـ PDF (ممكن يكون تالف أو محمي بكلمة مرور).',
  engine: 'تعذّر تشغيل أداة الضغط على الملف ده.',
  cancelled: 'اتلغى ضغط الملف.',
  uploadTooBig: (size: string) => `الملف ${size} م.ب وأكبر من الحد المسموح للرفع (50 م.ب).`,
} as const;
