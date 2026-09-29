import type { Worksheet, Cell, Fill, Borders } from 'exceljs';
import type { CellValue, ColumnType, ReportDocument, ReportSection, Tone } from './types';
import { fmtDateTime, isNumericType, toDate } from './format';

const ORG = 'دار الفتح للنشر والتوزيع';
const FONT = 'Arial';

const C = {
  navy: 'FF0B1F4D',
  navy2: 'FF16377A',
  gold: 'FFC9A227',
  ink: 'FF1E293B',
  muted: 'FF64748B',
  line: 'FFD9DEE8',
  zebra: 'FFF5F7FB',
  band: 'FFEEF2FA',
  total: 'FFE6ECF7',
  white: 'FFFFFFFF',
};

const TONE: Record<Tone, string> = {
  good: 'FF15803D',
  warn: 'FFB45309',
  bad: 'FFB91C1C',
  info: 'FF1D4ED8',
  muted: 'FF64748B',
  accent: 'FF6D28D9',
};

const fill = (argb: string): Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const thin = { style: 'thin' as const, color: { argb: C.line } };
const boxBorder: Partial<Borders> = { top: thin, bottom: thin, left: thin, right: thin };

// Currency stays in the header/label, not the number format: a format
// with Arabic literal text isn't rendered by every spreadsheet app.
function numFmt(type: ColumnType): string | undefined {
  switch (type) {
    case 'number': return '#,##0';
    case 'money': return '#,##0.00';
    case 'percent': return '0.0%';
    case 'date': return 'yyyy/mm/dd';
    case 'datetime': return 'yyyy/mm/dd hh:mm';
    default: return undefined;
  }
}

// ExcelJS stores dates as UTC serials, so a Cairo 00:30 would show as the
// previous day's 21:30. Shift so the sheet shows the local wall time.
const wallClock = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000);

function excelValue(value: CellValue, type: ColumnType): string | number | Date | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return type === 'percent' ? value / 100 : value;
  }
  if (type === 'date' || type === 'datetime' || value instanceof Date) {
    const d = toDate(value);
    return d ? wallClock(d) : String(value);
  }
  return String(value);
}

const textLength = (v: CellValue, type: ColumnType) => {
  if (v === null || v === undefined) return 0;
  if (type === 'datetime') return 16;
  if (type === 'date') return 10;
  if (typeof v === 'number') return Math.round(Math.abs(v)).toLocaleString('en-US').length + (type === 'money' ? 3 : 0);
  return String(v).length;
};

const sheetName = (name: string, used: Set<string>) => {
  const base = name.replace(/[\\/*?:[\]]/g, ' ').trim().slice(0, 28) || 'ورقة';
  let candidate = base;
  for (let i = 2; used.has(candidate); i++) candidate = `${base.slice(0, 26)} ${i}`;
  used.add(candidate);
  return candidate;
};

// '&' starts a header/footer control code in Excel.
const hf = (s: string) => s.replace(/&/g, '&&');

function styleBand(ws: Worksheet, row: number, lastCol: number, text: string, opts: { bg: string; color: string; size: number; bold?: boolean; height: number }) {
  ws.mergeCells(row, 1, row, lastCol);
  const cell = ws.getCell(row, 1);
  cell.value = text;
  cell.font = { name: FONT, size: opts.size, bold: opts.bold ?? true, color: { argb: opts.color } };
  cell.fill = fill(opts.bg);
  cell.alignment = { horizontal: 'right', vertical: 'middle', indent: 1, readingOrder: 'rtl', wrapText: true };
  ws.getRow(row).height = opts.height;
}

function letterhead(ws: Worksheet, doc: ReportDocument, lastCol: number, subtitle: string): number {
  styleBand(ws, 1, lastCol, ORG, { bg: C.navy, color: C.white, size: 11, height: 22 });
  styleBand(ws, 2, lastCol, subtitle, { bg: C.navy, color: C.white, size: 15, height: 30 });
  ws.mergeCells(3, 1, 3, lastCol);
  ws.getCell(3, 1).fill = fill(C.gold);
  ws.getRow(3).height = 4;
  styleBand(ws, 4, lastCol, `الفترة: ${doc.period.label} — ${doc.period.rangeLabel}     |     تاريخ التنزيل: ${fmtDateTime(doc.generatedAt)}`, {
    bg: C.band, color: C.muted, size: 10, bold: false, height: 22,
  });
  return 5;
}

function pageSetup(ws: Worksheet, doc: ReportDocument, landscape: boolean, titleRow?: number) {
  ws.pageSetup = {
    ...ws.pageSetup,
    paperSize: 9,
    orientation: landscape ? 'landscape' : 'portrait',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    horizontalCentered: true,
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.6, header: 0.25, footer: 0.3 },
    ...(titleRow ? { printTitlesRow: `${titleRow}:${titleRow}` } : {}),
  };
  ws.headerFooter.oddFooter = `&L&8${hf(fmtDateTime(doc.generatedAt))}&C&8صفحة &P من &N&R&8${hf(doc.title)}`;
}

function writeSummarySheet(ws: Worksheet, doc: ReportDocument) {
  ws.views = [{ rightToLeft: true, showGridLines: false }];
  ws.columns = [{ width: 34 }, { width: 46 }];
  let r = letterhead(ws, doc, 2, doc.title) + 1;

  const heading = (text: string) => {
    ws.mergeCells(r, 1, r, 2);
    const cell = ws.getCell(r, 1);
    cell.value = text;
    cell.font = { name: FONT, size: 12, bold: true, color: { argb: C.navy } };
    cell.alignment = { horizontal: 'right', readingOrder: 'rtl' };
    cell.border = { bottom: { style: 'medium', color: { argb: C.gold } } };
    ws.getRow(r).height = 22;
    r++;
  };

  const pair = (label: string, value: CellValue, type: ColumnType = 'text', tone?: Tone, zebra = false) => {
    const a = ws.getCell(r, 1);
    const b = ws.getCell(r, 2);
    a.value = label;
    a.font = { name: FONT, size: 11, color: { argb: C.muted } };
    b.value = excelValue(value, type);
    b.font = { name: FONT, size: 11, bold: true, color: { argb: tone ? TONE[tone] : C.ink } };
    const fmt = numFmt(type);
    if (fmt) b.numFmt = fmt;
    for (const cell of [a, b]) {
      cell.border = boxBorder;
      cell.alignment = { horizontal: 'right', vertical: 'middle', indent: 1, readingOrder: 'rtl', wrapText: true };
      if (zebra) cell.fill = fill(C.zebra);
    }
    ws.getRow(r).height = 20;
    r++;
  };

  heading('بيانات التقرير');
  const info: [string, string][] = [
    ['التقرير', doc.title],
    ['الفترة', doc.period.label],
    ['النطاق الزمني', doc.period.rangeLabel],
    ['تاريخ ووقت التنزيل', fmtDateTime(doc.generatedAt)],
    ...doc.meta.map((m) => [m.label, m.value] as [string, string]),
  ];
  info.forEach(([l, v], i) => pair(l, v, 'text', undefined, i % 2 === 1));

  if (doc.summary.length) {
    r++;
    heading('المؤشرات الرئيسية');
    doc.summary.forEach((s, i) =>
      pair(s.type === 'money' ? `${s.label} (${doc.currencySymbol})` : s.label, s.value, s.type ?? 'text', s.tone, i % 2 === 1)
    );
  }

  if (doc.sections.length) {
    r++;
    heading('محتويات الملف');
    doc.sections.forEach((s, i) => pair(`ورقة ${i + 2}`, `${s.title} (${s.rows.length.toLocaleString('en-US')} سجل)`, 'text', undefined, i % 2 === 1));
  }

  if (doc.notes.length) {
    r++;
    heading('ملاحظات');
    for (const note of doc.notes) {
      ws.mergeCells(r, 1, r, 2);
      const cell = ws.getCell(r, 1);
      cell.value = `• ${note}`;
      cell.font = { name: FONT, size: 10, color: { argb: C.muted } };
      cell.alignment = { horizontal: 'right', wrapText: true, readingOrder: 'rtl' };
      ws.getRow(r).height = 30;
      r++;
    }
  }

  pageSetup(ws, doc, false);
}

function writeSectionSheet(ws: Worksheet, doc: ReportDocument, section: ReportSection) {
  const colCount = Math.max(section.columns.length, 2);
  let r = letterhead(ws, doc, colCount, `${doc.title} — ${section.title}`);

  if (section.description) {
    styleBand(ws, r, colCount, section.description, { bg: C.white, color: C.muted, size: 10, bold: false, height: 20 });
    r++;
  }
  r++;

  const headerRow = r;
  const header = ws.getRow(headerRow);
  section.columns.forEach((col, i) => {
    const cell = header.getCell(i + 1);
    cell.value = col.header;
    cell.font = { name: FONT, size: 11, bold: true, color: { argb: C.white } };
    cell.fill = fill(C.navy2);
    cell.border = { ...boxBorder, bottom: { style: 'medium', color: { argb: C.gold } } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true, readingOrder: 'rtl' };
  });
  header.height = 30;
  r++;

  const styleData = (cell: Cell, type: ColumnType, zebra: boolean) => {
    const fmt = numFmt(type);
    if (fmt) cell.numFmt = fmt;
    cell.border = boxBorder;
    cell.alignment = isNumericType(type) || type === 'date' || type === 'datetime'
      ? { horizontal: 'center', vertical: 'middle' }
      : { horizontal: 'right', vertical: 'middle', indent: 1, wrapText: true, readingOrder: 'rtl' };
    if (zebra) cell.fill = fill(C.zebra);
  };

  if (section.rows.length === 0) {
    styleBand(ws, r, colCount, section.emptyText, { bg: C.zebra, color: C.muted, size: 11, bold: false, height: 28 });
    ws.getCell(r, 1).alignment = { horizontal: 'center', vertical: 'middle' };
    r++;
  }

  section.rows.forEach((row, i) => {
    const excelRow = ws.getRow(r);
    row.cells.forEach((value, c) => {
      const type = section.columns[c].type;
      const cell = excelRow.getCell(c + 1);
      cell.value = excelValue(value, type);
      const tone = row.tones[c];
      cell.font = { name: FONT, size: 10, bold: !!tone, color: { argb: tone ? TONE[tone] : C.ink } };
      styleData(cell, type, i % 2 === 1);
    });
    excelRow.height = 20;
    r++;
  });

  if (section.totals) {
    const totalRow = ws.getRow(r);
    section.totals.forEach((value, c) => {
      const type = section.columns[c].type;
      const cell = totalRow.getCell(c + 1);
      cell.value = excelValue(value, typeof value === 'string' ? 'text' : type);
      styleData(cell, typeof value === 'string' ? 'text' : type, false);
      cell.font = { name: FONT, size: 11, bold: true, color: { argb: C.navy } };
      cell.fill = fill(C.total);
      cell.border = { ...boxBorder, top: { style: 'medium', color: { argb: C.navy2 } } };
    });
    totalRow.height = 22;
    r++;
  }

  // Column widths from the widest header/value, within sane bounds.
  section.columns.forEach((col, c) => {
    const widest = Math.max(
      col.header.length + 2,
      ...section.rows.slice(0, 500).map((row) => textLength(row.cells[c], col.type) + 2),
      section.totals ? textLength(section.totals[c], col.type) + 2 : 0
    );
    ws.getColumn(c + 1).width = col.width ?? Math.min(Math.max(widest, 10), 48);
  });

  ws.views = [{ rightToLeft: true, state: 'frozen', ySplit: headerRow, xSplit: 0, showGridLines: false }];
  if (section.rows.length > 0) {
    ws.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: headerRow + section.rows.length, column: section.columns.length } };
  }
  pageSetup(ws, doc, section.columns.length > 6 || !!doc.landscape, headerRow);
}

export async function buildExcel(doc: ReportDocument): Promise<Blob> {
  // Loaded on demand: ExcelJS is large and only needed when someone downloads.
  const mod = await import('exceljs');
  const ExcelJS = ((mod as unknown as { default?: typeof mod }).default ?? mod) as typeof mod;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'لوحة تحكم دار الفتح';
  wb.title = doc.title;
  wb.created = doc.generatedAt;
  wb.views = [{ x: 0, y: 0, width: 20000, height: 12000, firstSheet: 0, activeTab: 0, visibility: 'visible' }];

  const used = new Set<string>();
  writeSummarySheet(wb.addWorksheet(sheetName('الملخص', used)), doc);
  for (const section of doc.sections) {
    writeSectionSheet(wb.addWorksheet(sheetName(section.title, used)), doc, section);
  }

  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
