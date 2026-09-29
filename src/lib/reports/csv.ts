import type { ReportDocument } from './types';
import { csvCell, fmtDateTime } from './format';

const quote = (v: string) => `"${v.replace(/"/g, '""')}"`;
const line = (cells: string[]) => cells.map(quote).join(',');

export function buildCsv(doc: ReportDocument): Blob {
  const lines: string[] = [
    line(['دار الفتح للنشر والتوزيع']),
    line(['التقرير', doc.title]),
    line(['الفترة', `${doc.period.label} — ${doc.period.rangeLabel}`]),
    line(['تاريخ التنزيل', fmtDateTime(doc.generatedAt)]),
    ...doc.meta.map((m) => line([m.label, m.value])),
  ];

  if (doc.summary.length) {
    lines.push('', line(['المؤشرات الرئيسية']));
    for (const s of doc.summary) {
      const unit = s.type === 'money' ? doc.currencySymbol : s.type === 'percent' ? '%' : '';
      lines.push(line([s.label, csvCell(s.value, s.type ?? 'text'), unit]));
    }
  }

  for (const section of doc.sections) {
    lines.push('', line([section.title]));
    lines.push(line(section.columns.map((c) => c.header)));
    if (section.rows.length === 0) lines.push(line([section.emptyText]));
    for (const row of section.rows) {
      lines.push(line(row.cells.map((v, i) => csvCell(v, section.columns[i].type))));
    }
    if (section.totals) {
      lines.push(line(section.totals.map((v, i) => csvCell(v, typeof v === 'string' ? 'text' : section.columns[i].type))));
    }
  }

  if (doc.notes.length) {
    lines.push('', line(['ملاحظات']), ...doc.notes.map((n) => line([n])));
  }

  // BOM + CRLF: Excel opens Arabic UTF-8 correctly only with the BOM.
  return new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
}
