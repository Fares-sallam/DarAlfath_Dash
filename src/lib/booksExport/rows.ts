// The books list as a flat table for the export (Excel and PDF): one row per COPY of a book (the SKU, the weight and the
// cost belong to the copy), with the book's own name, author, description, ISBN, series and category beside it. Nine columns,
// in the order the owner asked for (right to left on the sheet).

import { SALE_CHANNEL_LABELS } from '@/lib/saleChannel';

export interface CatalogColumn {
  key:
    | 'sku' | 'title' | 'copy' | 'copyType' | 'author' | 'publisher' | 'year' | 'pages' | 'description' | 'keywords' | 'weight' | 'cost'
    | 'basePrice' | 'sellPrice' | 'isbn' | 'series' | 'category' | 'extraCategories' | 'status' | 'createdAt' | 'updatedAt'
    | 'ebookFormat' | 'ebookSize' | 'saleChannel' | 'iap' | 'cover';
  header: string;
  kind: 'text' | 'number' | 'money';
  /** Excel width in characters */
  width: number;
  /** shown unless the owner turns it off (the nine the owner asked for); the others are there to choose */
  defaultOn: boolean;
  hint?: string;
}

/**
 * Everything about a book (and its copy) the export can carry, in the order it appears. The nine columns the owner asked for
 * are the standard ones, in his order; the rest are buttons to switch on (a column that is off is not in the file at all).
 */
export const CATALOG_COLUMNS: readonly CatalogColumn[] = [
  { key: 'sku', header: 'SKU', kind: 'text', width: 18, defaultOn: true },
  { key: 'title', header: 'اسم الكتاب', kind: 'text', width: 34, defaultOn: true },
  { key: 'copy', header: 'النسخة', kind: 'text', width: 20, defaultOn: false, hint: 'اسم النسخة (ورق عادي، مقاس 24*17، إلكتروني…)' },
  { key: 'copyType', header: 'نوع النسخة', kind: 'text', width: 12, defaultOn: false },
  { key: 'author', header: 'اسم المؤلف', kind: 'text', width: 22, defaultOn: true },
  { key: 'publisher', header: 'الناشر', kind: 'text', width: 20, defaultOn: false },
  { key: 'year', header: 'سنة النشر', kind: 'text', width: 10, defaultOn: false },
  { key: 'pages', header: 'عدد الصفحات', kind: 'number', width: 10, defaultOn: false },
  { key: 'description', header: 'وصف الكتاب', kind: 'text', width: 60, defaultOn: true },
  { key: 'keywords', header: 'الكلمات المفتاحية', kind: 'text', width: 26, defaultOn: false },
  { key: 'weight', header: 'وزن الكتاب', kind: 'number', width: 12, defaultOn: true },
  { key: 'cost', header: 'سعر التكلفة', kind: 'money', width: 14, defaultOn: true },
  { key: 'basePrice', header: 'السعر قبل الخصم', kind: 'money', width: 14, defaultOn: false },
  { key: 'sellPrice', header: 'سعر البيع', kind: 'money', width: 14, defaultOn: false },
  { key: 'isbn', header: 'الترقيم الدولي ISBN', kind: 'text', width: 22, defaultOn: true },
  { key: 'series', header: 'السلسلة', kind: 'text', width: 26, defaultOn: true },
  { key: 'category', header: 'التصنيف', kind: 'text', width: 22, defaultOn: true },
  { key: 'extraCategories', header: 'تصنيفات إضافية', kind: 'text', width: 24, defaultOn: false },
  { key: 'status', header: 'الحالة', kind: 'text', width: 10, defaultOn: false },
  { key: 'createdAt', header: 'تاريخ الإضافة', kind: 'text', width: 14, defaultOn: false },
  { key: 'updatedAt', header: 'تاريخ آخر تعديل', kind: 'text', width: 14, defaultOn: false },
  { key: 'ebookFormat', header: 'صيغة الملف الإلكتروني', kind: 'text', width: 14, defaultOn: false },
  { key: 'ebookSize', header: 'حجم الملف الإلكتروني (MB)', kind: 'number', width: 14, defaultOn: false },
  { key: 'saleChannel', header: 'قناة الخصم', kind: 'text', width: 16, defaultOn: false },
  { key: 'iap', header: 'معرّف الشراء داخل التطبيق', kind: 'text', width: 24, defaultOn: false },
  { key: 'cover', header: 'رابط الغلاف', kind: 'text', width: 40, defaultOn: false },
];

/** The columns for a set of chosen keys, in the catalog's order (all of the standard ones when none is given). */
export function catalogColumns(keys?: ReadonlySet<string> | readonly string[]): CatalogColumn[] {
  if (!keys) return CATALOG_COLUMNS.filter((c) => c.defaultOn);
  const set = new Set(keys);
  return CATALOG_COLUMNS.filter((c) => set.has(c.key));
}

export interface CatalogRow {
  sku: string;
  title: string;
  copy: string;
  copyType: string;
  author: string;
  publisher: string;
  year: string;
  pages: number | null;
  description: string;
  keywords: string;
  /** kilograms (null for an e-book or a copy with no weight set) */
  weight: number | null;
  cost: number | null;
  basePrice: number | null;
  sellPrice: number | null;
  isbn: string;
  /** every series the book is in, joined with «، » */
  series: string;
  category: string;
  extraCategories: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  ebookFormat: string;
  ebookSize: number | null;
  saleChannel: string;
  iap: string;
  cover: string;
}

/** What the export reads from a book (the books list and the export's own query both have this shape). */
export interface ExportBook {
  title: string;
  author?: string | null;
  publisher?: string | null;
  publication_year?: number | string | null;
  page_count?: number | string | null;
  description?: string | null;
  keywords?: string[] | null;
  isbn?: string | null;
  cover_url?: string | null;
  is_active?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
  categories?: { name?: string | null } | null;
  product_categories?: { categories?: { name?: string | null } | null }[] | null;
  product_series?: { book_series?: { name?: string | null } | null }[] | null;
  electronic_books?: { file_format?: string | null; file_size_mb?: number | string | null } | null;
  product_variants?: {
    sku?: string | null;
    variant_name?: string | null;
    variant_type?: string | null;
    weight_kg?: number | string | null;
    cost_price?: number | string | null;
    base_price?: number | string | null;
    sale_price?: number | string | null;
    price?: number | string | null;
    sale_channel?: string | null;
    iap_product_id?: string | null;
  }[] | null;
}

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const finite = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const dateOnly = (v: string | null | undefined): string => {
  const d = v ? new Date(v) : null;
  return d && !Number.isNaN(d.getTime()) ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : '';
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
    const unique = (names: (string | null | undefined)[]) => [...new Set(names.map(text).filter(Boolean))].join('، ');
    const base = {
      title: text(book.title),
      author: text(book.author),
      publisher: text(book.publisher),
      year: book.publication_year ? String(book.publication_year).trim() : '',
      pages: finite(book.page_count),
      description: text(book.description),
      keywords: unique(book.keywords ?? []),
      isbn: text(book.isbn),
      series: unique((book.product_series ?? []).map((s) => s.book_series?.name)),
      category: text(book.categories?.name),
      extraCategories: unique((book.product_categories ?? []).map((c) => c.categories?.name)),
      status: book.is_active === false ? 'مخفي' : book.is_active === true ? 'نشط' : '',
      createdAt: dateOnly(book.created_at),
      updatedAt: dateOnly(book.updated_at),
      ebookFormat: text(book.electronic_books?.file_format),
      ebookSize: finite(book.electronic_books?.file_size_mb),
      cover: text(book.cover_url),
    };
    const copies = [...(book.product_variants ?? [])].sort(
      (a, b) => Number(isDigital(a.variant_type)) - Number(isDigital(b.variant_type)) || text(a.variant_name).localeCompare(text(b.variant_name), 'ar'),
    );
    if (copies.length === 0) {
      rows.push({ ...base, sku: '', copy: '', copyType: '', weight: null, cost: null, basePrice: null, sellPrice: null, saleChannel: '', iap: '' });
      continue;
    }
    for (const copy of copies) {
      const weight = finite(copy.weight_kg);
      const sale = finite(copy.sale_price);
      rows.push({
        ...base,
        sku: text(copy.sku),
        copy: text(copy.variant_name),
        copyType: text(copy.variant_type),
        weight: isDigital(copy.variant_type) || !weight ? null : weight,
        cost: finite(copy.cost_price),
        basePrice: finite(copy.base_price),
        sellPrice: sale ?? finite(copy.price),
        saleChannel: copy.sale_channel ? (SALE_CHANNEL_LABELS[copy.sale_channel as keyof typeof SALE_CHANNEL_LABELS] ?? '') : '',
        iap: text(copy.iap_product_id),
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
