import type { Fill, Borders } from 'exceljs';
import { catalogColumns, type CatalogColumn, type CatalogRow } from './rows';

const FONT = 'Arial';
const C = { navy: 'FF16377A', gold: 'FFC9A227', ink: 'FF1E293B', line: 'FFD9DEE8', zebra: 'FFF5F7FB', white: 'FFFFFFFF' };
const fill = (argb: string): Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const thin = { style: 'thin' as const, color: { argb: C.line } };
const box: Partial<Borders> = { top: thin, bottom: thin, left: thin, right: thin };

export const CATALOG_SHEET = 'الكتب';

/**
 * The books as ONE workbook with ONE sheet: the chosen columns (the owner's nine unless he picked others) as a plain table from the first row (no title bands or merged
 * cells, so it filters, sorts and imports cleanly), right to left, the header frozen and filterable. SKU and ISBN are kept
 * as text (a spreadsheet would turn a long number into 9.78E+12 and drop leading zeros).
 */
export async function buildCatalogExcel(rows: readonly CatalogRow[], generatedAt: Date, columns: readonly CatalogColumn[] = catalogColumns()): Promise<Blob> {
  // Loaded on demand: ExcelJS is large and only needed when someone downloads.
  const mod = await import('exceljs');
  const ExcelJS = ((mod as unknown as { default?: typeof mod }).default ?? mod) as typeof mod;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'لوحة تحكم دار الفتح';
  wb.title = 'قائمة الكتب';
  wb.created = generatedAt;
  const ws = wb.addWorksheet(CATALOG_SHEET, {
    views: [{ rightToLeft: true, state: 'frozen', ySplit: 1, showGridLines: false }],
  });

  ws.columns = columns.map((c) => ({ key: c.key, width: c.width }));

  const header = ws.getRow(1);
  columns.forEach((col, i) => {
    const cell = header.getCell(i + 1);
    cell.value = col.header;
    cell.font = { name: FONT, size: 11, bold: true, color: { argb: C.white } };
    cell.fill = fill(C.navy);
    cell.border = { ...box, bottom: { style: 'medium', color: { argb: C.gold } } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true, readingOrder: 'rtl' };
  });
  header.height = 28;

  rows.forEach((row, i) => {
    const excelRow = ws.getRow(i + 2);
    columns.forEach((col, c) => {
      const cell = excelRow.getCell(c + 1);
      const value = row[col.key];
      cell.value = value === null || value === '' ? null : value;
      cell.font = { name: FONT, size: 10, color: { argb: C.ink } };
      cell.border = box;
      if (col.kind === 'text') {
        cell.numFmt = '@';
        cell.alignment = { horizontal: 'right', vertical: 'top', wrapText: true, readingOrder: 'rtl' };
      } else {
        cell.numFmt = col.kind === 'money' ? '#,##0.00' : '0.0##';
        cell.alignment = { horizontal: 'center', vertical: 'top' };
      }
      if (i % 2 === 1) cell.fill = fill(C.zebra);
    });
  });

  if (rows.length > 0) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: rows.length + 1, column: columns.length } };

  ws.pageSetup = {
    paperSize: 9,
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    horizontalCentered: true,
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.6, header: 0.25, footer: 0.3 },
    printTitlesRow: '1:1',
  };
  ws.headerFooter.oddFooter = '&C&8صفحة &P من &N';

  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
