// The books list as a flat table for the export (Excel and PDF): one row per COPY of a book (the SKU, the weight and the
// cost belong to the copy), with the book's own name, author, description, ISBN, series and category beside it. Nine columns,
// in the order the owner asked for (right to left on the sheet).

export interface CatalogColumn {
  key: 'sku' | 'title' | 'author' | 'description' | 'weight' | 'cost' | 'isbn' | 'series' | 'category';
  header: string;
  kind: 'text' | 'number' | 'money';
  /** Excel width in characters */
  width: number;
}

export const CATALOG_COLUMNS: readonly CatalogColumn[] = [
  { key: 'sku', header: 'SKU', kind: 'text', width: 18 },
  { key: 'title', header: 'اسم الكتاب', kind: 'text', width: 34 },
  { key: 'author', header: 'اسم المؤلف', kind: 'text', width: 22 },
  { key: 'description', header: 'وصف الكتاب', kind: 'text', width: 60 },
  { key: 'weight', header: 'وزن الكتاب', kind: 'number', width: 12 },
  { key: 'cost', header: 'سعر التكلفة', kind: 'money', width: 14 },
  { key: 'isbn', header: 'الترقيم الدولي ISBN', kind: 'text', width: 22 },
  { key: 'series', header: 'السلسلة', kind: 'text', width: 26 },
  { key: 'category', header: 'التصنيف', kind: 'text', width: 22 },
];

export interface CatalogRow {
  sku: string;
  title: string;
  author: string;
  description: string;
  /** kilograms (null for an e-book or a copy with no weight set) */
  weight: number | null;
  cost: number | null;
  isbn: string;
  /** every series the book is in, joined with «، » */
  series: string;
  category: string;
}

/** What the export reads from a book (the books list and the export's own query both have this shape). */
export interface ExportBook {
  title: string;
  author?: string | null;
  description?: string | null;
  isbn?: string | null;
  categories?: { name?: string | null } | null;
  product_series?: { book_series?: { name?: string | null } | null }[] | null;
  product_variants?: {
    sku?: string | null;
    variant_name?: string | null;
    variant_type?: string | null;
    weight_kg?: number | string | null;
    cost_price?: number | string | null;
  }[] | null;
}

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const finite = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const titleKey = (s: string) => s.replace(/[أإآٱ]/g, 'ا').replace(/[ً-ْ]/g, '').replace(/ى/g, 'ي');
const isDigital = (type: string | null | undefined) => (type ?? '').trim() === 'رقمي';

/**
 * The rows to export. A book with several copies gives a row for each (paper before e-book, then by the copy's name); a
 * book with no copy still gets one row (empty SKU) so no book goes missing. `keepOrder` keeps the books in the order given
 * (the list as the owner sees it); otherwise they are sorted by title.
 */
export function catalogRows(books: readonly ExportBook[], opts: { keepOrder?: boolean } = {}): CatalogRow[] {
  const ordered = opts.keepOrder ? [...books] : [...books].sort((a, b) => titleKey(text(a.title)).localeCompare(titleKey(text(b.title)), 'ar'));
  const rows: CatalogRow[] = [];
  for (const book of ordered) {
    const series = [...new Set((book.product_series ?? []).map((s) => text(s.book_series?.name)).filter(Boolean))].join('، ');
    const base = {
      title: text(book.title),
      author: text(book.author),
      description: text(book.description),
      isbn: text(book.isbn),
      series,
      category: text(book.categories?.name),
    };
    const copies = [...(book.product_variants ?? [])].sort(
      (a, b) => Number(isDigital(a.variant_type)) - Number(isDigital(b.variant_type)) || text(a.variant_name).localeCompare(text(b.variant_name), 'ar'),
    );
    if (copies.length === 0) {
      rows.push({ ...base, sku: '', weight: null, cost: null });
      continue;
    }
    for (const copy of copies) {
      const weight = finite(copy.weight_kg);
      rows.push({
        ...base,
        sku: text(copy.sku),
        weight: isDigital(copy.variant_type) || !weight ? null : weight,
        cost: finite(copy.cost_price),
      });
    }
  }
  return rows;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** e.g. قائمة-الكتب_2026-11-22-1405 (no extension) */
export function catalogFileBase(at: Date): string {
  return `قائمة-الكتب_${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}-${pad(at.getHours())}${pad(at.getMinutes())}`;
}
