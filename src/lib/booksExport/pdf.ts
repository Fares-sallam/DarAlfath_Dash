import { escapeHtml as esc } from '@/lib/utils';
import { fmtDateTime } from '@/lib/reports/format';
import { CATALOG_COLUMNS, type CatalogRow } from './rows';

const num = new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 });
const money = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function cell(row: CatalogRow, key: (typeof CATALOG_COLUMNS)[number]['key']): string {
  const v = row[key];
  if (v === null || v === '') return '<span class="none">—</span>';
  if (key === 'weight') return num.format(v as number);
  if (key === 'cost') return money.format(v as number);
  if (key === 'sku' || key === 'isbn') return `<span dir="ltr">${esc(v)}</span>`;
  return esc(v);
}

/**
 * The same nine columns as the sheet, as a page for printing (A4 landscape, the header row repeated on every page). Printed
 * from the print dialog with «حفظ كـ PDF», which keeps the Arabic shaped and selectable.
 */
export function buildCatalogHtml(rows: readonly CatalogRow[], opts: { generatedAt: Date; fileTitle: string; bookCount: number; logoUrl?: string | null; scopeLabel?: string }): string {
  const generated = fmtDateTime(opts.generatedAt);
  const head = CATALOG_COLUMNS.map((c) => `<th class="c-${c.key}">${esc(c.header)}</th>`).join('');
  const body = rows.length
    ? rows.map((r) => `<tr>${CATALOG_COLUMNS.map((c) => `<td class="c-${c.key}${c.kind !== 'text' ? ' n' : ''}">${cell(r, c.key)}</td>`).join('')}</tr>`).join('')
    : `<tr><td class="empty" colspan="${CATALOG_COLUMNS.length}">لا توجد كتب</td></tr>`;
  const logo = opts.logoUrl ? `<img src="${esc(opts.logoUrl)}" alt="" />` : '';
  const scope = opts.scopeLabel ? ` · ${esc(opts.scopeLabel)}` : '';

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8" />
<title>${esc(opts.fileTitle)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet" />
<style>
  @page {
    size: A4 landscape;
    margin: 11mm 10mm 14mm;
    @bottom-left { content: "صفحة " counter(page) " من " counter(pages); font: 8.5px Cairo, Tahoma, sans-serif; color: #64748B; }
    @bottom-right { content: "قائمة الكتب — دار الفتح"; font: 8.5px Cairo, Tahoma, sans-serif; color: #64748B; }
  }
  :root { --navy:#0B1F4D; --navy2:#16377A; --gold:#C9A227; --ink:#1E293B; --muted:#64748B; --line:#E2E8F0; --zebra:#F6F8FC; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: 'Cairo', Tahoma, Arial, sans-serif; color: var(--ink); font-size: 8.6px; line-height: 1.5; background: #fff; }
  .head { display: flex; align-items: center; justify-content: space-between; gap: 14px; background: var(--navy); color: #fff; padding: 10px 16px; border-radius: 10px 10px 0 0; }
  .brand { display: flex; align-items: center; gap: 10px; }
  .brand img { width: 38px; height: 38px; border-radius: 8px; background: #fff; object-fit: contain; padding: 3px; }
  .org { font-size: 9.5px; color: #CBD5E1; font-weight: 600; }
  h1 { font-size: 17px; font-weight: 800; line-height: 1.3; }
  .stamp { text-align: left; font-size: 9px; color: #CBD5E1; white-space: nowrap; }
  .stamp b { display: block; color: var(--gold); font-size: 10px; font-weight: 700; }
  .goldbar { height: 3px; background: var(--gold); border-radius: 0 0 4px 4px; margin-bottom: 8px; }
  .count { color: var(--muted); font-size: 9px; margin-bottom: 6px; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  thead { display: table-header-group; }
  th { background: var(--navy2); color: #fff; font-weight: 700; font-size: 8.6px; padding: 5px 5px; text-align: center; border-bottom: 2px solid var(--gold); }
  td { padding: 4px 5px; border-bottom: 1px solid var(--line); vertical-align: top; text-align: right; overflow-wrap: anywhere; }
  tbody tr:nth-child(even) td { background: var(--zebra); }
  tr { break-inside: avoid; }
  td.n { text-align: center; white-space: nowrap; font-variant-numeric: tabular-nums; }
  td.c-sku, td.c-isbn { text-align: center; font-variant-numeric: tabular-nums; }
  .none { color: #94A3B8; }
  td.empty { text-align: center; color: var(--muted); padding: 14px; }
  .c-sku { width: 9%; } .c-title { width: 14%; } .c-author { width: 9%; } .c-description { width: 28%; }
  .c-weight { width: 5%; } .c-cost { width: 6%; } .c-isbn { width: 10%; } .c-series { width: 10%; } .c-category { width: 9%; }
  .foot { margin-top: 10px; padding-top: 6px; border-top: 1px solid var(--line); color: var(--muted); font-size: 8px; display: flex; justify-content: space-between; }
  @media screen { body { max-width: 1200px; margin: 24px auto; padding: 0 16px; } }
</style>
</head>
<body>
  <header class="head">
    <div class="brand">${logo}<div><div class="org">دار الفتح للنشر والتوزيع</div><h1>قائمة الكتب</h1></div></div>
    <div class="stamp"><b>تاريخ التنزيل</b>${esc(generated)}</div>
  </header>
  <div class="goldbar"></div>
  <p class="count">${rows.length.toLocaleString('en-US')} سطر (${opts.bookCount.toLocaleString('en-US')} كتاب)${scope} — صف لكل نسخة من الكتاب</p>
  <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
  <div class="foot"><span>الوزن بالكيلوجرام</span><span>${esc(generated)}</span></div>
</body>
</html>`;
}
