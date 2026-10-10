/**
 * Shrinks a photo in the browser before it is uploaded.
 *
 * Covers and product photos were stored as they came: 2048px squares of a
 * few hundred KB each, shown at ~220–340px. Every visitor downloaded them
 * from storage, and that bandwidth is what Supabase meters. Quality comes
 * first: 1600px is the largest size a photo is ever shown at (the zoomed
 * view on a retina laptop), so nothing is shown softer than before, and the
 * encoder is checked against the picture it was given — if a photo has fine
 * detail and the first pass lost any that you could see, it is re-encoded at
 * a higher quality until it doesn't. The original is not kept.
 *
 * Anything that can't be handled safely goes up unchanged: other formats
 * (GIF, SVG), a photo that is already small, or one where re-encoding
 * wouldn't make it smaller.
 */

export interface CompressOptions {
  /** Longest side, in pixels. Photos smaller than this are never enlarged. */
  maxSize?: number;
  /** Encoder quality to start from, 0–1. */
  quality?: number;
  /**
   * The least similarity to the resized picture (PSNR, in dB) the result may
   * have. Above ~40 dB the eye can't tell them apart; below it the quality is
   * raised and the photo encoded again.
   */
  minPsnr?: number;
  /** A photo already within maxSize and at most this many bytes is left alone. */
  keepIfSmallerThan?: number;
}

/** What covers and product photos use. */
export const PHOTO_COMPRESSION: Required<CompressOptions> = {
  maxSize: 1600,
  quality: 0.88,
  minPsnr: 40,
  keepIfSmallerThan: 250 * 1024,
};

/** Highest quality the guard will go to (the last steps cost size for no visible gain). */
const MAX_QUALITY = 0.97;
const QUALITY_STEP = 0.05;
const MAX_ATTEMPTS = 3;

const COMPRESSIBLE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** Size after scaling so the longest side is at most `max` (never enlarges). */
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= max) return { width, height };
  const scale = max / longest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** The file name with the extension that matches its new type. */
export function nameForType(name: string, type: string): string {
  const base = name.replace(/\.[^./\\]+$/, '') || 'image';
  const ext = type === 'image/webp' ? 'webp' : type === 'image/jpeg' ? 'jpg' : 'png';
  return `${base}.${ext}`;
}

/** Should the file go up as it is, without being decoded and re-encoded? */
export function isLeftAlone(type: string, alreadyFits: boolean, bytes: number, keepIfSmallerThan: number): boolean {
  if (!COMPRESSIBLE_TYPES.includes(type)) return true;
  return alreadyFits && bytes <= keepIfSmallerThan;
}

/** Peak signal-to-noise ratio of two RGBA pixel buffers (alpha ignored), in dB; 99 when identical. */
export function psnr(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let squared = 0;
  let count = 0;
  for (let i = 0; i < a.length; i += 4) {
    for (let channel = 0; channel < 3; channel++) {
      const diff = a[i + channel] - b[i + channel];
      squared += diff * diff;
      count += 1;
    }
  }
  if (count === 0 || squared === 0) return 99;
  return 10 * Math.log10((255 * 255) / (squared / count));
}

const encode = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

export async function compressImage(file: File, options: CompressOptions = {}): Promise<File> {
  const { maxSize, quality, minPsnr, keepIfSmallerThan } = { ...PHOTO_COMPRESSION, ...options };
  // Formats it can't re-encode safely (GIF, SVG...) go up as they are.
  if (isLeftAlone(file.type, false, file.size, keepIfSmallerThan)) return file;

  try {
    // 'from-image' applies the photo's EXIF rotation, so a phone photo isn't saved sideways.
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const { width, height } = fitWithin(bitmap.width, bitmap.height, maxSize);
    const alreadyFits = width === bitmap.width && height === bitmap.height;
    if (isLeftAlone(file.type, alreadyFits, file.size, keepIfSmallerThan)) {
      bitmap.close();
      return file;
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) {
      bitmap.close();
      return file;
    }
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, width, height);
    const reference = context.getImageData(0, 0, width, height).data;

    // First pass at the starting quality; if it differs visibly from the
    // resized picture, step the quality up and encode again (at most a few times).
    let blob: Blob | null = null;
    let level = quality;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      blob = await encode(canvas, 'image/webp', level);
      if (!blob || blob.type !== 'image/webp') break;
      const check = document.createElement('canvas');
      check.width = width;
      check.height = height;
      const checkContext = check.getContext('2d');
      if (!checkContext) break;
      const decoded = await createImageBitmap(blob);
      checkContext.drawImage(decoded, 0, 0);
      decoded.close();
      if (psnr(reference, checkContext.getImageData(0, 0, width, height).data) >= minPsnr || level >= MAX_QUALITY) break;
      level = Math.min(MAX_QUALITY, level + QUALITY_STEP);
    }
    if (!blob || blob.type !== 'image/webp') {
      // A browser that can't write WebP hands back a PNG: use JPEG instead,
      // on white (JPEG has no transparency, which would otherwise turn black).
      context.globalCompositeOperation = 'destination-over';
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, width, height);
      blob = await encode(canvas, 'image/jpeg', quality);
    }
    bitmap.close();

    if (!blob || blob.size >= file.size) return file;
    return new File([blob], nameForType(file.name, blob.type), { type: blob.type, lastModified: Date.now() });
  } catch {
    // Couldn't decode it here (corrupt, or a format the browser can't draw): upload the original.
    return file;
  }
}
