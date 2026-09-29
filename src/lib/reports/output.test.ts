import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { makeSection, share, type ReportDocument } from './types';
import { csvCell, formatCell } from './format';
import { resolvePeriod } from './period';
import { buildCsv } from './csv';
import { buildExcel } from './excel';
import { buildReportHtml } from './pdf';
import { reportFileBase } from './download';

type Row = { id: string; at: string; units: number; total: number; pct: number; stock: number | string; status: string };

const rows: Row[] = [
  { id: 'ORD-20260901-521400', at: '2026-09-01T06:15:00Z', units: 2, total: 250, pct: 12.5, stock: Number.POSITIVE_INFINITY, status: 'تم التوصيل' },
  { id: 'ORD-20260902-521401', at: '2026-09-02T07:15:00Z', units: 3, total: 267.5, pct: 40, stock: 'غير محدود', status: 'ملغي' },
];

const section = makeSection('سجل الطلبات', [
  { header: 'رقم الطلب', value: (r: Row) => r.id },
  { header: 'التاريخ', type: 'datetime', value: (r) => r.at },
  { header: 'النسخ', type: 'number', total: 'sum', value: (r) => r.units },
  { header: 'الإجمالي (ج.م)', type: 'money', total: 'sum', value: (r) => r.total },
  { header: 'نسبة', type: 'percent', value: (r) => r.pct },
  { header: 'المتاح', type: 'number', total: 'sum', value: (r) => r.stock },
  { header: 'الحالة', value: (r) => r.status, tone: (r) => (r.status === 'ملغي' ? 'bad' : 'good') },
], rows);

const now = new Date(2026, 8, 29, 14, 5);
const doc: ReportDocument = {
  title: 'تقرير الطلبات',
  fileBase: 'تقرير-الطلبات',
  period: resolvePeriod({ preset: 'thisMonth' }, now),
  generatedAt: now,
  currencySymbol: 'ج.م',
  meta: [{ label: 'الدولة', value: 'مصر' }],
  summary: [
    { label: 'إجمالي الطلبات', value: 2, type: 'number' },
    { label: 'الإيرادات', value: 517.5, type: 'money' },
  ],
  sections: [section, makeSection('قسم فارغ', [{ header: 'البند', value: (r: Row) => r.id }], [], { emptyText: 'لا توجد بيانات' })],
  notes: ['ملاحظة <b>بعلامات</b> & رموز'],
};

describe('makeSection', () => {
  it('sums only numeric cells and labels the first non-total column', () => {
    expect(section.totals).toEqual(['الإجمالي (2)', null, 5, 517.5, null, 0, null]);
  });
  it('never lets Infinity reach a cell', () => {
    expect(section.rows[0].cells[5]).toBeNull();
    expect(section.rows[1].cells[5]).toBe('غير محدود');
  });
  it('keeps each cell’s tone and skips totals for an empty table', () => {
    expect(section.rows[1].tones[6]).toBe('bad');
    expect(doc.sections[1].totals).toBeNull();
  });
  it('share() is safe with a zero total', () => {
    expect(share(1, 0)).toBe(0);
    expect(share(1, 4)).toBe(25);
  });
});

describe('cell formatting', () => {
  it('formats money with two decimals and the currency, percent with one', () => {
    expect(formatCell(1250, 'money', 'ج.م')).toBe('1,250.00 ج.م');
    expect(formatCell(12.345, 'percent')).toBe('12.3%');
    expect(formatCell(null, 'number')).toBe('—');
    expect(formatCell(Number.NaN, 'number')).toBe('—');
  });
  it('shows dates in local (Cairo) time, day first', () => {
    expect(formatCell('2026-09-01T06:15:00Z', 'datetime')).toBe('01/09/2026 09:15');
    expect(formatCell('2026-08-31T21:30:00Z', 'date')).toBe('01/09/2026');
  });
  it('keeps CSV values machine-readable', () => {
    expect(csvCell(1234.567, 'money')).toBe('1234.57');
    expect(csvCell('2026-09-01T06:15:00Z', 'datetime')).toBe('2026-09-01 09:15');
    expect(csvCell(Number.POSITIVE_INFINITY, 'number')).toBe('');
  });
});

describe('file name', () => {
  it('carries the period and the download date and time, with no unsafe characters', () => {
    const base = reportFileBase(doc);
    expect(base).toBe('تقرير-الطلبات_شهر-2026-09_تنزيل-2026-09-29-1405');
    expect(base).not.toMatch(/[\\/:*?"<>|\s]/);
  });
});

describe('CSV', () => {
  it('starts with a UTF-8 BOM so Excel reads Arabic, and includes every part of the report', async () => {
    const bytes = new Uint8Array(await buildCsv(doc).arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain('"تقرير الطلبات"');
    expect(text).toContain('"تاريخ التنزيل"');
    expect(text).toContain('"ORD-20260901-521400"');
    expect(text).toContain('"لا توجد بيانات"');
    expect(text).not.toMatch(/Infinity|NaN/);
  });
});

describe('Excel', () => {
  it('builds a summary sheet plus one right-to-left sheet per table', async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await (await buildExcel(doc)).arrayBuffer());
    expect(wb.worksheets.map((w) => w.name)).toEqual(['الملخص', 'سجل الطلبات', 'قسم فارغ']);

    const ws = wb.worksheets[1];
    const view = ws.views[0] as { rightToLeft?: boolean; state?: string; ySplit?: number };
    expect(view.rightToLeft).toBe(true);
    expect(view.state).toBe('frozen');

    const header = ws.getRow(view.ySplit!);
    expect(header.getCell(1).value).toBe('رقم الطلب');

    const first = ws.getRow(header.number + 1);
    expect(first.getCell(1).value).toBe('ORD-20260901-521400');
    const when = first.getCell(2).value as Date;
    expect([when.getUTCHours(), when.getUTCMinutes()]).toEqual([9, 15]); // Cairo wall clock
    expect(first.getCell(4).numFmt).toBe('#,##0.00');
    expect(first.getCell(5).value).toBe(0.125);
    expect(first.getCell(5).numFmt).toBe('0.0%');

    const totals = ws.getRow(header.number + 3);
    expect(totals.getCell(1).value).toBe('الإجمالي (2)');
    expect(totals.getCell(4).value).toBe(517.5);
    expect(ws.autoFilter).toBeTruthy();
    expect(String(ws.headerFooter.oddFooter)).toContain('&P');
  });

  it('shows the currency in the label of money figures on the summary sheet', async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await (await buildExcel(doc)).arrayBuffer());
    const labels: string[] = [];
    wb.worksheets[0].eachRow((row) => labels.push(String(row.getCell(1).value)));
    expect(labels).toContain('الإيرادات (ج.م)');
  });
});

describe('PDF page', () => {
  const html = buildReportHtml(doc, { logoUrl: null, fileTitle: reportFileBase(doc) });
  it('escapes report text and never prints Infinity/NaN', () => {
    expect(html).not.toContain('<b>بعلامات</b>');
    expect(html).toContain('&lt;b&gt;بعلامات&lt;/b&gt;');
    expect(html).not.toMatch(/Infinity|NaN/);
  });
  it('repeats table headers on each page and prints the totals only once', () => {
    expect(html).toContain('thead { display: table-header-group; }');
    expect(html).toContain('tfoot { display: table-row-group; }');
    expect(html).toContain('counter(pages)');
  });
});
