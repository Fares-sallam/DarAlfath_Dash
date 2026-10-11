/**
 * Shrinks a PDF that is over the ebook size limit, in the browser, without
 * costing it visible quality. The work happens in a worker
 * (pdfCompression.worker.ts) so the form stays usable; the Ghostscript engine
 * (~15 MB) is only fetched when a file actually needs it.
 */
import { EBOOK_MESSAGES, megabytes, type PdfPreset } from './ebookFile';
import type { WorkerMessage } from './pdfCompression.worker';

export type CompressionStage = 'engine' | 'compress' | 'verify';

export interface CompressionProgress {
  stage: CompressionStage;
  /** Which attempt is running (1-based) and the resolution it uses. */
  attempt?: number;
  dpi?: number;
}

export interface CompressionResult {
  file: File;
  originalBytes: number;
  preset: PdfPreset;
}

export class PdfCompressionError extends Error {
  constructor(
    message: string,
    readonly code: 'too-big' | 'check' | 'unreadable' | 'engine' | 'cancelled',
  ) {
    super(message);
    this.name = 'PdfCompressionError';
  }
}

export function describeProgress(progress: CompressionProgress): string {
  if (progress.stage === 'engine') return 'جارٍ تجهيز أداة الضغط وقراءة الملف...';
  if (progress.stage === 'verify') return 'جارٍ التأكد إن الصفحات سليمة وبنفس الجودة...';
  return `جارٍ ضغط الملف (المحاولة ${progress.attempt ?? 1}، دقة ${progress.dpi} dpi)...`;
}

/**
 * Resolves with the smaller file (same name), or rejects with a PdfCompressionError whose
 * message is ready to show. `signal` aborts the work and frees the worker.
 */
export function compressPdf(
  file: File,
  onProgress: (progress: CompressionProgress) => void,
  signal?: AbortSignal,
): Promise<CompressionResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./pdfCompression.worker.ts', import.meta.url), { type: 'module' });
    const finish = () => {
      signal?.removeEventListener('abort', onAbort);
      worker.terminate();
    };
    const onAbort = () => {
      finish();
      reject(new PdfCompressionError(EBOOK_MESSAGES.cancelled, 'cancelled'));
    };
    if (signal?.aborted) return onAbort();
    signal?.addEventListener('abort', onAbort);

    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      const message = event.data;
      if (message.type === 'progress') {
        onProgress({ stage: message.stage, attempt: message.attempt, dpi: message.dpi });
        return;
      }
      finish();
      if (message.type === 'done') {
        resolve({
          file: new File([message.bytes], file.name, { type: 'application/pdf', lastModified: Date.now() }),
          originalBytes: message.originalBytes,
          preset: message.preset,
        });
      } else if (message.reason === 'too-big') {
        reject(new PdfCompressionError(EBOOK_MESSAGES.cannotReachTarget(megabytes(message.smallestBytes ?? 0)), 'too-big'));
      } else if (message.reason === 'check') {
        reject(new PdfCompressionError(EBOOK_MESSAGES.failedCheck, 'check'));
      } else if (message.reason === 'unreadable') {
        reject(new PdfCompressionError(EBOOK_MESSAGES.unreadable, 'unreadable'));
      } else {
        reject(new PdfCompressionError(EBOOK_MESSAGES.engine, 'engine'));
      }
    };
    worker.onerror = () => {
      finish();
      reject(new PdfCompressionError(EBOOK_MESSAGES.engine, 'engine'));
    };
    worker.postMessage({ file });
  });
}
