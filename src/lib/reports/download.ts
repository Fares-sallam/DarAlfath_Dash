import type { ReportDocument } from './types';

const pad = (n: number) => String(n).padStart(2, '0');

const clean = (s: string) =>
  s
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

/** e.g. تقرير-المخزون_شهر-2026-09_تنزيل-2026-09-29-1405 */
export function reportFileBase(doc: ReportDocument): string {
  const d = doc.generatedAt;
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  return `${clean(doc.fileBase)}_${clean(doc.period.slug)}_تنزيل-${stamp}`;
}

export function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Safari starts the download asynchronously; revoking immediately can cancel it.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

type PageResult<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

/**
 * PostgREST caps a response at 1000 rows, so a comprehensive report must
 * page through. The query must have a stable order (created_at + id).
 */
export async function fetchAllPages<T>(page: (from: number, to: number) => PageResult<T>, pageSize = 1000): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < pageSize) return all;
  }
}
