/// <reference lib="webworker" />
/**
 * Does the heavy part of shrinking a PDF, off the page's main thread.
 *
 * Ghostscript (compiled to WebAssembly) rewrites the file at one preset after
 * another, best-looking first, until the result fits; a few pages of the
 * result are then rendered next to the same pages of the original to make
 * sure nothing broke. Ghostscript is © Artifex Software, licensed AGPL-3.0
 * (via @bentopdf/gs-wasm); see the README.
 */
import {
  EBOOK_TARGET_BYTES,
  PDF_PRESETS,
  nextPresetIndex,
  pickSamplePages,
  type PdfPreset,
} from './ebookFile';
import { comparePages, pagesLookIntact, parseBmp24, type RgbImage } from './pdfQuality';

export interface CompressRequest {
  file: File;
}

export type WorkerMessage =
  | { type: 'progress'; stage: 'engine' | 'compress' | 'verify'; attempt?: number; dpi?: number }
  | {
      type: 'done';
      bytes: Uint8Array;
      preset: PdfPreset;
      originalBytes: number;
      pages: number;
      attempts: { preset: PdfPreset; bytes: number }[];
    }
  | { type: 'failed'; reason: 'too-big' | 'check' | 'unreadable' | 'engine'; smallestBytes?: number };

interface GsModule {
  FS: { writeFile(path: string, data: Uint8Array): void; readFile(path: string): Uint8Array };
  callMain(args: string[]): number;
}
type GsFactory = (options: Record<string, unknown>) => Promise<GsModule>;

// The package only exports its loader, so the engine files are referenced by path; Vite serves
// them as they are in development and copies them next to the bundle in the build.
const gsScriptUrl = new URL('../../node_modules/@bentopdf/gs-wasm/assets/gs.js', import.meta.url).href;
const gsWasmUrl = new URL('../../node_modules/@bentopdf/gs-wasm/assets/gs.wasm', import.meta.url).href;

let factory: Promise<GsFactory> | null = null;
const loadFactory = () =>
  (factory ??= import(/* @vite-ignore */ gsScriptUrl).then((m) => m.default as GsFactory));

/** One Ghostscript run in a fresh instance (its memory is released afterwards): files in, files out. */
async function runGs(args: string[], inputs: Record<string, Uint8Array>, outputs: string[]) {
  const load = await loadFactory();
  const log: string[] = [];
  const gs = await load({
    locateFile: (path: string) => (path.endsWith('.wasm') ? gsWasmUrl : path),
    print: (line: string) => log.push(line),
    printErr: (line: string) => log.push(line),
  });
  for (const [name, bytes] of Object.entries(inputs)) gs.FS.writeFile(name, bytes);
  let code = 1;
  try {
    code = gs.callMain(args);
  } catch {
    // an exit status thrown by the runtime is a failed run, same as a non-zero code
  }
  const files: Record<string, Uint8Array> = {};
  for (const name of outputs) {
    try {
      files[name] = gs.FS.readFile(name);
    } catch {
      // not produced
    }
  }
  return { code, files, log: log.join('\n') };
}

async function countPages(pdf: Uint8Array): Promise<number> {
  const { log } = await runGs(
    ['-dNODISPLAY', '-dQUIET', '-dBATCH', '-dNOPAUSE', '--permit-file-read=in.pdf', '-c', '(in.pdf) (r) file runpdfbegin pdfpagecount = quit'],
    { 'in.pdf': pdf },
    [],
  );
  const n = parseInt(log.trim().split('\n').pop() ?? '', 10);
  return Number.isFinite(n) ? n : 0;
}

/** Renders the given pages (1-based) at 300 dpi, in one run. */
async function renderPages(pdf: Uint8Array, pages: number[]): Promise<RgbImage[]> {
  const outputs = pages.map((_, i) => `p${i + 1}.bmp`);
  const { files } = await runGs(
    ['-sDEVICE=bmp16m', '-dNOPAUSE', '-dBATCH', '-dQUIET', '-dSAFER', '-r300', '-dTextAlphaBits=4', '-dGraphicsAlphaBits=4',
      `-sPageList=${pages.join(',')}`, '-sOutputFile=p%d.bmp', 'in.pdf'],
    { 'in.pdf': pdf },
    outputs,
  );
  return outputs.map((name) => {
    if (!files[name]) throw new Error('page did not render');
    return parseBmp24(files[name]);
  });
}

function compressArgs({ dpi, qfactor }: PdfPreset): string[] {
  const dict = `<< /QFactor ${qfactor} /Blend 1 /ColorTransform 1 /HSamples [1 1 1 1] /VSamples [1 1 1 1] >>`;
  return [
    '-sDEVICE=pdfwrite', '-dCompatibilityLevel=1.5', '-dNOPAUSE', '-dBATCH', '-dQUIET', '-dSAFER',
    // Pictures are decoded and rewritten, never copied through: that is what lets them be smaller.
    '-dPassThroughJPEGImages=false',
    // Colour and grey pictures sharper than the preset are scaled down to it; black-and-white scans are left alone.
    '-dDownsampleColorImages=true', '-dDownsampleGrayImages=true', '-dDownsampleMonoImages=false',
    '-dColorImageDownsampleType=/Bicubic', '-dGrayImageDownsampleType=/Bicubic',
    `-dColorImageResolution=${dpi}`, `-dGrayImageResolution=${dpi}`,
    '-dColorImageDownsampleThreshold=1.05', '-dGrayImageDownsampleThreshold=1.05',
    '-dAutoFilterColorImages=false', '-dAutoFilterGrayImages=false',
    '-dColorImageFilter=/DCTEncode', '-dGrayImageFilter=/DCTEncode',
    '-dDetectDuplicateImages=true', '-dCompressFonts=true', '-dSubsetFonts=true',
    '-sOutputFile=out.pdf',
    '-c', `<< /ColorImageDict ${dict} /GrayImageDict ${dict} >> setdistillerparams`,
    '-f', 'in.pdf',
  ];
}

const post = (message: WorkerMessage, transfer: Transferable[] = []) => self.postMessage(message, transfer);

async function compress(file: File) {
  post({ type: 'progress', stage: 'engine' });
  const original = new Uint8Array(await file.arrayBuffer());

  const pageCount = await countPages(original);
  if (pageCount < 1) return post({ type: 'failed', reason: 'unreadable' });
  const samples = pickSamplePages(pageCount);
  let originalPages: RgbImage[];
  try {
    originalPages = await renderPages(original, samples);
  } catch {
    return post({ type: 'failed', reason: 'unreadable' });
  }

  const attempts: { preset: PdfPreset; bytes: number }[] = [];
  let index = 0;
  while (index !== -1) {
    const preset = PDF_PRESETS[index];
    post({ type: 'progress', stage: 'compress', attempt: attempts.length + 1, dpi: preset.dpi });
    const { files } = await runGs(compressArgs(preset), { 'in.pdf': original }, ['out.pdf']);
    const out = files['out.pdf'];
    if (!out || out.length === 0) return post({ type: 'failed', reason: 'engine' });
    attempts.push({ preset, bytes: out.length });

    if (out.length <= EBOOK_TARGET_BYTES) {
      post({ type: 'progress', stage: 'verify' });
      const samePages = (await countPages(out)) === pageCount;
      let intact = false;
      if (samePages) {
        try {
          const compressedPages = await renderPages(out, samples);
          intact = pagesLookIntact(compressedPages.map((page, i) => comparePages(originalPages[i], page)));
        } catch {
          intact = false;
        }
      }
      if (!intact) return post({ type: 'failed', reason: 'check' });
      return post(
        { type: 'done', bytes: out, preset, originalBytes: original.length, pages: pageCount, attempts },
        [out.buffer],
      );
    }
    index = nextPresetIndex(PDF_PRESETS, index, out.length, EBOOK_TARGET_BYTES);
  }
  return post({ type: 'failed', reason: 'too-big', smallestBytes: Math.min(...attempts.map((a) => a.bytes)) });
}

self.onmessage = (event: MessageEvent<CompressRequest>) => {
  compress(event.data.file).catch(() => post({ type: 'failed', reason: 'engine' }));
};
