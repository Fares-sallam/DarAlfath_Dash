import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { CATALOG_COLUMNS, catalogFileBase, catalogRows, type ExportBook } from './rows';
import { CATALOG_SHEET, buildCatalogExcel } from './excel';
import { buildCatalogHtml } from './pdf';

const HEADERS = ['SKU', 'اسم الكتاب', 'اسم المؤلف', 'وصف الكتاب', 'وزن الكتاب', 'سعر التكلفة', 'الترقيم الدولي ISBN', 'السلسلة', 'التصنيف'];

const books: ExportBook[] = [
  {
    title: ' قواعد النحو ',
    author: 'محمد القليعي',
    description: 'شرح مبسّط\nللقواعد',
    isbn: '9780123456789',
    categories: { name: 'النحو' },
    product_series: [{ book_series: { name: 'سلسلة اللغة العربية' } }, { book_series: { name: 'سلسلة اللغة العربية' } }, { book_series: { name: 'سلسلة الفتح' } }],
    product_variants: [
      { sku: 'NAHW-E', variant_name: 'نسخة إلكترونية', variant_type: 'رقمي', weight_kg: 0.2, cost_price: '12.5' },
      { sku: 'NAHW-P', variant_name: 'ورق عادي', variant_type: 'ورقي', weight_kg: '0.35', cost_price: 30 },
    ],
  },
  {
    title: 'أساسيات الإملاء',
    author: null,
    description: null,
    isbn: '00123',
    categories: null,
    product_series: [],
    product_variants: [{ sku: null, variant_name: 'ورق', variant_type: 'ورقي', weight_kg: 0, cost_price: 0 }],
  },
  { title: 'كتاب بلا نسخ', author: 'مؤلف', product_variants: [] },
  { title: 'ابن الكتاب <script>x</script>', author: 'ب & ج', product_variants: [{ sku: 'X-1', variant_type: 'ورقي', weight_kg: 1.25, cost_price: null }] },
];

describe('the columns', () => {
  it('are the nine the owner asked for, in that order', () => {
    expect(CATALOG_COLUMNS.map((c) => c.header)).toEqual(HEADERS);
  });
});

describe('catalogRows', () => {
  const rows = catalogRows(books, { keepOrder: true });

  it('gives a row for each copy, the paper copy before the e-book, and one row for a book with no copy', () => {
    expect(rows.map((r) => r.sku)).toEqual(['NAHW-P', 'NAHW-E', '', '', 'X-1']);
    expect(rows.map((r) => r.title)).toEqual(['قواعد النحو', 'قواعد النحو', 'أساسيات الإملاء', 'كتاب بلا نسخ', 'ابن الكتاب <script>x</script>']);
  });

  it('puts the book\'s own data on every copy and joins its series without repeats', () => {
    expect(rows[0]).toMatchObject({ author: 'محمد القليعي', description: 'شرح مبسّط\nللقواعد', isbn: '9780123456789', category: 'النحو', series: 'سلسلة اللغة العربية، سلسلة الفتح' });
    expect(rows[1]).toMatchObject({ isbn: '9780123456789', series: 'سلسلة اللغة العربية، سلسلة الفتح' });
    expect(rows[2]).toMatchObject({ author: '', description: '', category: '', series: '' });
  });

  it('keeps the weight of a paper copy only, and the cost as a number (a missing one stays empty)', () => {
    expect(rows[0]).toMatchObject({ weight: 0.35, cost: 30 });
    expect(rows[1]).toMatchObject({ weight: null, cost: 12.5 }); // an e-book weighs nothing
    expect(rows[2]).toMatchObject({ weight: null, cost: 0 }); // no weight set; a cost of 0 is shown as it is
    expect(rows[3]).toMatchObject({ weight: null, cost: null });
    expect(rows[4]).toMatchObject({ weight: 1.25, cost: null });
  });

  it('sorts by title unless the order given is kept', () => {
    const sorted = catalogRows(books);
    expect(sorted.map((r) => r.title)).toEqual(['ابن الكتاب <script>x</script>', 'أساسيات الإملاء', 'قواعد النحو', 'قواعد النحو', 'كتاب بلا نسخ']);
    expect(catalogRows([])).toEqual([]);
  });

  it('names the file with the date and time', () => {
    expect(catalogFileBase(new Date(2026, 10, 22, 14, 5))).toBe('قائمة-الكتب_2026-11-22-1405');
  });
});

describe('the Excel file', () => {
  const rows = catalogRows(books, { keepOrder: true });

  const load = async () => {
    const blob = await buildCatalogExcel(rows, new Date(2026, 10, 22, 14, 5));
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await blob.arrayBuffer());
    return wb;
  };

  it('is one workbook with ONE sheet, the nine headers on the first row and a row for each line', async () => {
    const wb = await load();
    expect(wb.worksheets).toHaveLength(1);
    const ws = wb.worksheets[0];
    expect(ws.name).toBe(CATALOG_SHEET);
    expect(ws.rowCount).toBe(rows.length + 1);
    expect(ws.columnCount).toBe(9);
    expect(HEADERS.map((_, i) => ws.getRow(1).getCell(i + 1).value)).toEqual(HEADERS);
    expect(ws.getRow(2).getCell(2).value).toBe('قواعد النحو');
    expect(ws.getRow(2).getCell(1).value).toBe('NAHW-P');
    expect(ws.getRow(2).getCell(8).value).toBe('سلسلة اللغة العربية، سلسلة الفتح');
    expect(ws.getRow(2).getCell(9).value).toBe('النحو');
  });

  it('keeps SKU and ISBN as text (leading zeros stay), the weight and the cost as numbers, and missing values empty', async () => {
    const ws = (await load()).worksheets[0];
    expect(ws.getRow(4).getCell(7).value).toBe('00123');
    expect(ws.getRow(2).getCell(7).value).toBe('9780123456789');
    expect(typeof ws.getRow(2).getCell(5).value).toBe('number');
    expect(ws.getRow(2).getCell(5).value).toBe(0.35);
    expect(ws.getRow(2).getCell(6).value).toBe(30);
    expect(ws.getRow(4).getCell(1).value).toBeNull(); // no SKU
    expect(ws.getRow(3).getCell(5).value).toBeNull(); // the e-book has no weight
    expect(ws.getRow(5).getCell(6).value).toBeNull(); // no cost
  });

  it('is right to left, with the header frozen and filterable, and no merged cells', async () => {
    const ws = (await load()).worksheets[0];
    expect(ws.views[0]).toMatchObject({ rightToLeft: true, state: 'frozen', ySplit: 1 });
    expect(ws.autoFilter).toBe(`A1:I${rows.length + 1}`);
    expect(Object.keys((ws as unknown as { _merges: Record<string, unknown> })._merges ?? {})).toHaveLength(0);
  });

  it('is still a valid one-sheet file with no books', async () => {
    const blob = await buildCatalogExcel([], new Date());
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await blob.arrayBuffer());
    expect(wb.worksheets).toHaveLength(1);
    expect(wb.worksheets[0].rowCount).toBe(1);
  });
});

describe('the PDF page', () => {
  const rows = catalogRows(books, { keepOrder: true });
  const html = buildCatalogHtml(rows, { generatedAt: new Date(2026, 10, 22, 14, 5), fileTitle: 'قائمة', bookCount: 4, logoUrl: 'https://x.example/logo.png' });

  it('has the same nine columns in the same order, and a row for each line', () => {
    const head = [...html.matchAll(/<th class="c-[a-z]+">([^<]+)<\/th>/g)].map((m) => m[1]);
    expect(head).toEqual(HEADERS);
    expect([...html.matchAll(/<tr><td/g)]).toHaveLength(rows.length);
    expect(html).toContain('NAHW-P');
    expect(html).toContain('9780123456789');
    expect(html).toContain('0.35');
    expect(html).toContain('30.00');
  });

  it('is A4 landscape, right to left, repeats the header row and counts the lines and the books', () => {
    expect(html).toContain('size: A4 landscape');
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('thead { display: table-header-group; }');
    expect(html).toContain('5 سطر (4 كتاب)');
    expect(html).toContain('الوزن بالكيلوجرام');
  });

  it('escapes what the books contain, and shows a dash where a value is missing', () => {
    expect(html).not.toContain('<script>x</script>');
    expect(html).toContain('&lt;script&gt;x&lt;/script&gt;');
    expect(html).toContain('ب &amp; ج');
    expect(html).toContain('<span class="none">—</span>');
  });

  it('says so when there is nothing to list', () => {
    expect(buildCatalogHtml([], { generatedAt: new Date(), fileTitle: 'x', bookCount: 0 })).toContain('لا توجد كتب');
  });
});
