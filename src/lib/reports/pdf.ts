import { escapeHtml } from '@/lib/utils';
import type { ReportDocument, ReportSection } from './types';
import { fmtDateTime, formatCell, isNumericType } from './format';

const esc = escapeHtml;

function sectionHtml(section: ReportSection): string {
  const numeric = section.columns.map((c) => isNumericType(c.type) || c.type === 'date' || c.type === 'datetime');
  const head = section.columns.map((c, i) => `<th${numeric[i] ? ' class="n"' : ''}>${esc(c.header)}</th>`).join('');

  const body = section.rows.length
    ? section.rows
        .map((row) => {
          const cells = row.cells.map((v, i) => {
            const type = section.columns[i].type;
            const text = esc(formatCell(v, type));
            const tone = row.tones[i];
            const inner = tone
              ? `<span class="pill t-${tone}">${text}</span>`
              : type === 'date' || type === 'datetime' ? `<span dir="ltr">${text}</span>` : text;
            return `<td${numeric[i] ? ' class="n"' : ''}>${inner}</td>`;
          });
          return `<tr>${cells.join('')}</tr>`;
        })
        .join('')
    : `<tr><td class="empty" colspan="${section.columns.length}">${esc(section.emptyText)}</td></tr>`;

  const foot = section.totals
    ? `<tfoot><tr>${section.totals
        .map((v, i) => `<td${numeric[i] && typeof v !== 'string' ? ' class="n"' : ''}>${v === null ? '' : esc(formatCell(v, typeof v === 'string' ? 'text' : section.columns[i].type))}</td>`)
        .join('')}</tr></tfoot>`
    : '';

  const count = `${section.rows.length.toLocaleString('en-US')} سجل`;
  return `<section>
    <h2>${esc(section.title)} <small>${count}</small></h2>
    ${section.description ? `<p class="desc">${esc(section.description)}</p>` : ''}
    <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody>${foot}</table>
  </section>`;
}

export function buildReportHtml(doc: ReportDocument, opts: { logoUrl?: string | null; fileTitle: string }): string {
  const generated = fmtDateTime(doc.generatedAt);
  const widest = Math.max(0, ...doc.sections.map((s) => s.columns.length));
  const landscape = doc.landscape || widest > 7;

  const meta = [
    { label: 'الفترة', value: doc.period.label },
    { label: 'النطاق الزمني', value: doc.period.rangeLabel },
    ...doc.meta,
  ]
    .map((m) => `<div><span>${esc(m.label)}</span><b>${esc(m.value)}</b></div>`)
    .join('');

  const kpis = doc.summary.length
    ? `<div class="kpis">${doc.summary
        .map((s) => `<div class="kpi"><div class="v${s.tone ? ` t-${s.tone}` : ''}">${esc(formatCell(s.value, s.type ?? 'text', doc.currencySymbol))}</div><div class="l">${esc(s.label)}</div></div>`)
        .join('')}</div>`
    : '';

  const notes = doc.notes.length
    ? `<ul class="notes">${doc.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>`
    : '';

  const logo = opts.logoUrl ? `<img src="${esc(opts.logoUrl)}" alt="" />` : '';

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
    size: A4 ${landscape ? 'landscape' : 'portrait'};
    margin: 12mm 11mm 15mm;
    @bottom-left { content: "صفحة " counter(page) " من " counter(pages); font: 8.5px Cairo, Tahoma, sans-serif; color: #64748B; }
    @bottom-right { content: "${esc(doc.title)} — دار الفتح"; font: 8.5px Cairo, Tahoma, sans-serif; color: #64748B; }
  }
  :root { --navy:#0B1F4D; --navy2:#16377A; --gold:#C9A227; --ink:#1E293B; --muted:#64748B; --line:#E2E8F0; --zebra:#F6F8FC; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: 'Cairo', Tahoma, Arial, sans-serif; color: var(--ink); font-size: 10px; line-height: 1.55; background: #fff; }
  .head { display: flex; align-items: center; justify-content: space-between; gap: 16px; background: var(--navy); color: #fff; padding: 14px 18px; border-radius: 12px 12px 0 0; }
  .brand { display: flex; align-items: center; gap: 12px; }
  .brand img { width: 46px; height: 46px; border-radius: 10px; background: #fff; object-fit: contain; padding: 3px; }
  .org { font-size: 10.5px; color: #CBD5E1; font-weight: 600; }
  h1 { font-size: 20px; font-weight: 800; line-height: 1.3; }
  .stamp { text-align: left; font-size: 9.5px; color: #CBD5E1; white-space: nowrap; }
  .stamp b { display: block; color: var(--gold); font-size: 10.5px; font-weight: 700; }
  .goldbar { height: 4px; background: var(--gold); border-radius: 0 0 4px 4px; margin-bottom: 12px; }
  .meta { display: grid; grid-template-columns: repeat(${landscape ? 4 : 3}, 1fr); gap: 6px 18px; padding: 10px 14px; border: 1px solid var(--line); border-radius: 10px; margin-bottom: 14px; }
  .meta div { display: flex; flex-direction: column; min-width: 0; }
  .meta span { color: var(--muted); font-size: 9px; }
  .meta b { font-weight: 700; font-size: 10.5px; }
  .kpis { display: grid; grid-template-columns: repeat(${landscape ? 5 : 4}, 1fr); gap: 8px; margin-bottom: 18px; }
  .kpi { border: 1px solid var(--line); border-radius: 10px; padding: 9px 12px; break-inside: avoid; }
  .kpi .v { font-size: 14.5px; font-weight: 800; color: var(--navy); font-variant-numeric: tabular-nums; }
  .kpi .l { color: var(--muted); font-size: 9px; margin-top: 1px; }
  section { margin-bottom: 18px; }
  h2 { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 800; color: var(--navy); margin-bottom: 6px; break-after: avoid; }
  h2::before { content: ''; width: 9px; height: 9px; border-radius: 2px; background: var(--gold); flex-shrink: 0; }
  h2 small { font-size: 9.5px; font-weight: 600; color: var(--muted); }
  .desc { color: var(--muted); font-size: 9.5px; margin: -2px 0 6px; }
  table { width: 100%; border-collapse: collapse; }
  thead { display: table-header-group; }
  tfoot { display: table-row-group; }
  th { background: var(--navy2); color: #fff; font-weight: 700; font-size: 9px; padding: 6px 7px; text-align: right; border-bottom: 2px solid var(--gold); }
  td { padding: 5px 7px; border-bottom: 1px solid var(--line); vertical-align: top; }
  tbody tr:nth-child(even) td { background: var(--zebra); }
  tr { break-inside: avoid; }
  .n { text-align: center; font-variant-numeric: tabular-nums; white-space: nowrap; }
  tfoot td { font-weight: 800; color: var(--navy); background: #EAEFF8; border-top: 1.5px solid var(--navy2); }
  td.empty { text-align: center; color: var(--muted); padding: 14px; }
  .pill { display: inline-block; padding: 0 8px; border-radius: 999px; font-weight: 700; font-size: 9px; }
  .t-good { color: #15803D; } .pill.t-good { background: #DCFCE7; }
  .t-warn { color: #B45309; } .pill.t-warn { background: #FEF3C7; }
  .t-bad { color: #B91C1C; } .pill.t-bad { background: #FEE2E2; }
  .t-info { color: #1D4ED8; } .pill.t-info { background: #DBEAFE; }
  .t-muted { color: #64748B; } .pill.t-muted { background: #F1F5F9; }
  .t-accent { color: #6D28D9; } .pill.t-accent { background: #EDE9FE; }
  .notes { margin: 4px 0 0; padding: 10px 14px 10px 10px; border: 1px dashed var(--line); border-radius: 10px; color: var(--muted); font-size: 9.5px; list-style: none; }
  .notes li::before { content: '• '; color: var(--gold); font-weight: 800; }
  .foot { margin-top: 16px; padding-top: 8px; border-top: 1px solid var(--line); color: var(--muted); font-size: 8.5px; display: flex; justify-content: space-between; }
  @media screen { body { max-width: 1100px; margin: 24px auto; padding: 0 16px; } }
</style>
</head>
<body>
  <header class="head">
    <div class="brand">${logo}<div><div class="org">دار الفتح للنشر والتوزيع</div><h1>${esc(doc.title)}</h1></div></div>
    <div class="stamp"><b>تاريخ التنزيل</b>${esc(generated)}</div>
  </header>
  <div class="goldbar"></div>
  <div class="meta">${meta}</div>
  ${kpis}
  ${doc.sections.map((s) => sectionHtml(s)).join('')}
  ${notes}
  <div class="foot"><span>تقرير آلي من لوحة تحكم دار الفتح</span><span>${esc(generated)}</span></div>
</body>
</html>`;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Prints the report from a hidden iframe (no pop-up to be blocked). The
 * print dialog's "Save as PDF" keeps Arabic text shaped and selectable,
 * which PDF libraries don't do reliably.
 */
export async function printReport(doc: ReportDocument, opts: { logoUrl?: string | null; fileTitle: string }): Promise<void> {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
  document.body.appendChild(iframe);

  const win = iframe.contentWindow;
  const idoc = iframe.contentDocument;
  if (!win || !idoc) {
    iframe.remove();
    throw new Error('تعذر تجهيز صفحة الطباعة');
  }

  idoc.open();
  idoc.write(buildReportHtml(doc, opts));
  idoc.close();

  // Fonts and the logo must be in before printing, or the PDF falls back
  // to a system font / blank logo. Capped so an offline font never hangs.
  const ready = Promise.all([
    idoc.fonts?.ready ?? Promise.resolve(),
    ...Array.from(idoc.images).map((img) =>
      img.complete ? Promise.resolve() : new Promise<void>((res) => { img.onload = img.onerror = () => res(); })
    ),
  ]);
  await Promise.race([ready, wait(4000)]);
  await wait(150);

  // Chrome and Safari suggest the *top* document's title as the PDF name.
  const previousTitle = document.title;
  document.title = opts.fileTitle;
  const cleanup = () => {
    document.title = previousTitle;
    setTimeout(() => iframe.remove(), 1000);
  };
  win.addEventListener('afterprint', cleanup, { once: true });

  win.focus();
  win.print();
  // Browsers whose print() doesn't block never fire afterprint reliably.
  setTimeout(() => {
    if (document.title === opts.fileTitle) cleanup();
  }, 60_000);
}
