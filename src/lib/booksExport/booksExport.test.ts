import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { CATALOG_COLUMNS, catalogColumns, catalogFileBase, catalogRows, type ExportBook } from './rows';
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
  it('the standard ones are the nine the owner asked for, in that order', () => {
    expect(catalogColumns().map((c) => c.header)).toEqual(HEADERS);
  });

  it('every other thing about a book is a column to choose, in the catalog\'s order, and a column left out is not there', () => {
    expect(CATALOG_COLUMNS.length).toBeGreaterThan(20);
    expect(new Set(CATALOG_COLUMNS.map((c) => c.key)).size).toBe(CATALOG_COLUMNS.length);
    expect(catalogColumns(['cost', 'sku', 'title', 'nope']).map((c) => c.key)).toEqual(['sku', 'title', 'cost']);
    expect(catalogColumns(new Set<string>())).toEqual([]);
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

describe('the other things about a book', () => {
  const full: ExportBook = {
    title: 'قواعد النحو',
    author: 'محمد القليعي',
    publisher: 'دار الفتح',
    publication_year: 2025,
    page_count: 120,
    description: 'وصف',
    keywords: ['نحو', 'لغة', 'نحو'],
    isbn: '9780123456789',
    cover_url: 'https://x.example/c.png',
    is_active: false,
    created_at: '2026-03-05T10:00:00Z',
    updated_at: '2026-04-06T10:00:00Z',
    categories: { name: 'النحو' },
    product_categories: [{ categories: { name: 'تعليم' } }, { categories: { name: 'تعليم' } }, { categories: { name: 'مراجعة' } }],
    product_series: [],
    electronic_books: { file_format: 'PDF', file_size_mb: '12.5' },
    product_variants: [
      { sku: 'N-1', variant_name: 'مقاس 24*17', variant_type: 'ورقي', weight_kg: 0.5, cost_price: 30, base_price: 120, sale_price: 100, price: 100, sale_channel: 'web', iap_product_id: null },
      { sku: 'N-E', variant_name: 'نسخة إلكترونية', variant_type: 'رقمي', weight_kg: 0, cost_price: 10, base_price: 50, sale_price: null, price: 50, sale_channel: 'app', iap_product_id: 'iap.nahw' },
    ],
  };
  const rows = catalogRows([full], { keepOrder: true });

  it('carries the book\'s own data on every row', () => {
    expect(rows[0]).toMatchObject({
      publisher: 'دار الفتح', year: '2025', pages: 120, keywords: 'نحو، لغة', status: 'مخفي', createdAt: '2026-03-05', updatedAt: '2026-04-06',
      extraCategories: 'تعليم، مراجعة', ebookFormat: 'PDF', ebookSize: 12.5, cover: 'https://x.example/c.png',
    });
    expect(rows[1]).toMatchObject({ publisher: 'دار الفتح', extraCategories: 'تعليم، مراجعة' });
  });

  it('carries each copy\'s own data: its name and type, the price before and after the discount, the discount\'s channel and the in-app id', () => {
    expect(rows[0]).toMatchObject({ copy: 'مقاس 24*17', copyType: 'ورقي', basePrice: 120, sellPrice: 100, saleChannel: 'الموقع فقط', iap: '' });
    expect(rows[1]).toMatchObject({ copy: 'نسخة إلكترونية', copyType: 'رقمي', basePrice: 50, sellPrice: 50, saleChannel: 'التطبيق فقط', iap: 'iap.nahw' });
  });

  it('leaves what it does not know empty', () => {
    const [row] = catalogRows([{ title: 'ب' }]);
    expect(row).toMatchObject({ publisher: '', year: '', pages: null, status: '', createdAt: '', ebookFormat: '', ebookSize: null, saleChannel: '', iap: '', cover: '' });
  });

  it('makes a one-sheet Excel of exactly the columns chosen, in the catalog\'s order', async () => {
    const columns = catalogColumns(['sellPrice', 'title', 'copy', 'publisher']);
    const blob = await buildCatalogExcel(rows, new Date(), columns);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await blob.arrayBuffer());
    expect(wb.worksheets).toHaveLength(1);
    const ws = wb.worksheets[0];
    expect(ws.columnCount).toBe(4);
    expect([1, 2, 3, 4].map((i) => ws.getRow(1).getCell(i).value)).toEqual(['اسم الكتاب', 'النسخة', 'الناشر', 'سعر البيع']);
    expect([1, 2, 3, 4].map((i) => ws.getRow(2).getCell(i).value)).toEqual(['قواعد النحو', 'مقاس 24*17', 'دار الفتح', 100]);
    expect(ws.autoFilter).toBe('A1:D3');
  });

  it('makes an Excel with every column there is', async () => {
    const blob = await buildCatalogExcel(rows, new Date(), CATALOG_COLUMNS);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await blob.arrayBuffer());
    expect(wb.worksheets[0].columnCount).toBe(CATALOG_COLUMNS.length);
    expect(wb.worksheets[0].getRow(1).getCell(CATALOG_COLUMNS.length).value).toBe('رابط الغلاف');
  });

  it('makes a PDF page of the columns chosen, each given a share of the width, all adding up to the page', () => {
    const columns = catalogColumns(['title', 'description', 'cost']);
    const html = buildCatalogHtml(rows, { generatedAt: new Date(), fileTitle: 'x', bookCount: 1, columns });
    expect([...html.matchAll(/<th class="c-[A-Za-z]+">([^<]+)<\/th>/g)].map((m) => m[1])).toEqual(['اسم الكتاب', 'وصف الكتاب', 'سعر التكلفة']);
    const widths = [...html.matchAll(/<col style="width:([\d.]+)%">/g)].map((m) => Number(m[1]));
    expect(widths).toHaveLength(3);
    expect(widths.reduce((a, b) => a + b, 0)).toBeGreaterThan(99.9);
    expect(widths.reduce((a, b) => a + b, 0)).toBeLessThan(100.1);
    expect(html).toContain('30.00');
    expect(html).not.toContain('N-1'); // the SKU was not chosen
  });
});

describe('weights and sizes in the export keep their fractions', () => {
  const items: ExportBook[] = [
    { title: 'أ', product_variants: [{ sku: '1', variant_type: 'ورقي', weight_kg: 0.35 }, { sku: '2', variant_type: 'ورقي', weight_kg: 0.4 }, { sku: '3', variant_type: 'ورقي', weight_kg: 1 }], electronic_books: { file_size_mb: 12.5 } },
  ];
  const rows = catalogRows(items, { keepOrder: true });

  it('stores the weight as a number and shows each as it is (0.35, 0.4, 1, not 0, 0, 1)', async () => {
    // the catalog's order: title, pages, weight, e-book size
    const blob = await buildCatalogExcel(rows, new Date(), catalogColumns(['title', 'weight', 'ebookSize', 'pages']));
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await blob.arrayBuffer());
    const ws = wb.worksheets[0];
    expect([2, 3, 4].map((r) => ws.getRow(r).getCell(3).value)).toEqual([0.35, 0.4, 1]);
    expect([2, 3, 4].map((r) => ws.getRow(r).getCell(3).numFmt)).toEqual(['0.00', '0.0', '0']);
    expect(ws.getRow(2).getCell(4).value).toBe(12.5);
    expect(ws.getRow(2).getCell(4).numFmt).toBe('0.0');
    // a column with only whole numbers shows no decimals
    const only = await buildCatalogExcel(catalogRows([{ title: 'ب', page_count: 120 }]), new Date(), catalogColumns(['title', 'pages']));
    const w2 = new ExcelJS.Workbook();
    await w2.xlsx.load(await only.arrayBuffer());
    expect(w2.worksheets[0].getRow(2).getCell(2).numFmt).toBe('0');
  });
});
