// The invoice of one order: a clean A4 page (the shop's header, the customer and address, every line with its book, edition, type,
// quantity and price, the totals with and without shipping) that opens the browser's print window straight away, where «Save as PDF»
// gives the file (the same way the dashboard's reports are made: Arabic stays shaped and selectable). The builder is pure.
import type { Order, OrderItem } from '@/hooks/useOrders';
import { fmtDateTime } from '@/lib/reports/format';
import { printHtml } from '@/lib/reports/pdf';
import { escapeHtml } from '@/lib/utils';

const esc = escapeHtml;

export interface InvoiceLine {
  no: number;
  title: string;
  /** the edition's name (for example «غلاف فاخر»), when the book has one */
  edition: string;
  /** «ورقي» or «رقمي» */
  kind: string;
  qty: number;
  /** the price of one copy before its discount */
  unit: number;
  /** the discount on one copy */
  discount: number;
  /** quantity × (price − discount) */
  total: number;
  /** a set's books, one line each («عنوان × 3») */
  components: string[];
}

export interface InvoiceFigures {
  lines: InvoiceLine[];
  /** the lines added up */
  itemsTotal: number;
  /** what a coupon took off the order */
  orderDiscount: number;
  shipping: number;
  /** the order's total without the shipping */
  totalWithoutShipping: number;
  /** the order's total as the customer pays it */
  totalWithShipping: number;
}

const num = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const lineOf = (item: OrderItem, index: number): InvoiceLine => {
  const unit = num(item.price_per_item);
  const discount = num(item.discount_per_item);
  const qty = num(item.quantity);
  return {
    no: index + 1,
    title: item.products?.title?.trim() || 'منتج محذوف',
    edition: item.product_variants?.variant_name?.trim() ?? '',
    kind: item.is_digital ? 'رقمي' : 'ورقي',
    qty,
    unit,
    discount,
    total: (unit - discount) * qty,
    components: (item.order_item_components ?? []).map((c) => `${c.title}${c.variant_name ? ` (${c.variant_name})` : ''} × ${num(c.quantity)}`),
  };
};

/** The numbers on the invoice, worked out from the order the same way the order window shows them. */
export function invoiceFigures(order: Pick<Order, 'order_items' | 'shipping_cost' | 'discount_amount' | 'total_price'>): InvoiceFigures {
  const lines = (order.order_items ?? []).map(lineOf);
  const shipping = num(order.shipping_cost);
  const totalWithShipping = num(order.total_price);
  return {
    lines,
    itemsTotal: lines.reduce((sum, l) => sum + l.total, 0),
    orderDiscount: num(order.discount_amount),
    shipping,
    totalWithoutShipping: totalWithShipping - shipping,
    totalWithShipping,
  };
}

/** The customer's address as one readable line. */
export function addressLine(address: Order['shipping_address']): string {
  if (!address) return '';
  const parts = [
    address.governorate, address.city, address.street,
    address.building ? `عمارة ${address.building}` : '', address.floor ? `دور ${address.floor}` : '', address.apartment ? `شقة ${address.apartment}` : '',
  ];
  return parts.map((p) => (p ?? '').toString().trim()).filter(Boolean).join('، ');
}

const money = (value: number, currency: string) =>
  `${value.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: Number.isInteger(value) ? 0 : 2 })} ${currency}`;

const PAYMENT_STATUS_TONE: Record<string, string> = { 'مدفوع': 'good', 'معلق': 'warn', 'فشل': 'bad', 'مسترد': 'muted' };

export interface InvoiceOptions {
  /** where the shop's logo is served from (the dashboard's own copy by default) */
  logoUrl?: string;
}

export function buildInvoiceHtml(order: Order, options: InvoiceOptions = {}): string {
  const f = invoiceFigures(order);
  const currency = order.countries?.currency_symbol ?? 'ج.م';
  const address = order.shipping_address ?? null;
  const customerName = address?.name?.trim() || order.profiles?.full_name?.trim() || 'عميل';
  const phone = address?.phone?.trim() || order.profiles?.phone?.trim() || '';
  const email = address?.email?.trim() || '';
  const date = fmtDateTime(new Date(order.created_at));
  const logo = options.logoUrl ?? '/branding/logo-horizontal.svg';
  const paymentName = order.payment_methods?.method_name ?? '';
  const paymentTone = PAYMENT_STATUS_TONE[order.payment_status] ?? 'muted';

  const rows = f.lines.length
    ? f.lines.map((l) => `<tr>
        <td class="n">${l.no}</td>
        <td class="item"><b>${esc(l.title)}</b>${l.edition ? `<span class="sub">الطبعة: ${esc(l.edition)}</span>` : ''}${l.components.length ? `<span class="sub">يحتوي: ${esc(l.components.join('، '))}</span>` : ''}</td>
        <td class="n">${esc(l.kind)}</td>
        <td class="n">${l.qty}</td>
        <td class="n">${esc(money(l.unit, currency))}</td>
        <td class="n">${l.discount > 0 ? esc(money(l.discount, currency)) : '—'}</td>
        <td class="n strong">${esc(money(l.total, currency))}</td>
      </tr>`).join('')
    : `<tr><td class="empty" colspan="7">مفيش أصناف في الطلب ده</td></tr>`;

  const trow = (cls: string, label: string, value: string) => `<div class="trow${cls ? ` ${cls}` : ''}"><span>${label}</span><b>${value}</b></div>`;
  const totalRows = [
    trow('', 'إجمالي الأصناف', esc(money(f.itemsTotal, currency))),
    f.orderDiscount > 0 ? trow('minus', `خصم الكوبون${order.coupons?.code ? ` (${esc(order.coupons.code)})` : ''}`, `- ${esc(money(f.orderDiscount, currency))}`) : '',
    trow('sub-total', 'الإجمالي بدون الشحن', esc(money(f.totalWithoutShipping, currency))),
    trow('', 'الشحن', f.shipping > 0 ? esc(money(f.shipping, currency)) : 'مجاني'),
    trow('grand', 'الإجمالي بالشحن', esc(money(f.totalWithShipping, currency))),
  ].join('');

  const title = `فاتورة ${order.id}`;
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8" />
<title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet" />
<style>
  @page { size: A4 portrait; margin: 12mm 12mm 14mm; }
  :root { --navy:#0B1F4D; --navy2:#16377A; --gold:#C9A227; --ink:#1E293B; --muted:#64748B; --line:#E2E8F0; --zebra:#F6F8FC; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: 'Cairo', Tahoma, Arial, sans-serif; color: var(--ink); font-size: 11px; line-height: 1.6; background: #fff; }
  .head { display: flex; align-items: center; justify-content: space-between; gap: 16px; background: var(--navy); color: #fff; padding: 14px 18px; border-radius: 12px 12px 0 0; }
  .brand { display: flex; align-items: center; gap: 12px; }
  .brand img { height: 46px; max-width: 190px; object-fit: contain; background: #fff; border-radius: 10px; padding: 4px 8px; }
  .org { font-size: 11px; color: #CBD5E1; font-weight: 600; }
  h1 { font-size: 24px; font-weight: 800; line-height: 1.2; letter-spacing: .5px; }
  .stamp { text-align: left; font-size: 10px; color: #CBD5E1; }
  .stamp b { display: block; color: var(--gold); font-size: 12px; font-weight: 800; direction: ltr; unicode-bidi: plaintext; }
  .goldbar { height: 4px; background: var(--gold); border-radius: 0 0 4px 4px; margin-bottom: 14px; }
  .cards { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px; }
  .card { border: 1px solid var(--line); border-radius: 10px; padding: 10px 14px; break-inside: avoid; }
  .card h2 { font-size: 11.5px; font-weight: 800; color: var(--navy); margin-bottom: 6px; display: flex; align-items: center; gap: 7px; }
  .card h2::before { content: ''; width: 8px; height: 8px; border-radius: 2px; background: var(--gold); }
  .kv { display: flex; gap: 8px; padding: 2px 0; }
  .kv span { color: var(--muted); min-width: 74px; font-size: 10px; }
  .kv b { font-weight: 700; flex: 1; word-break: break-word; }
  .ltr { direction: ltr; unicode-bidi: plaintext; display: inline-block; }
  .pill { display: inline-block; padding: 0 9px; border-radius: 999px; font-weight: 700; font-size: 10px; }
  .pill.good { color: #15803D; background: #DCFCE7; } .pill.warn { color: #B45309; background: #FEF3C7; }
  .pill.bad { color: #B91C1C; background: #FEE2E2; } .pill.muted { color: #64748B; background: #F1F5F9; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
  thead { display: table-header-group; }
  th { background: var(--navy2); color: #fff; font-weight: 700; font-size: 10px; padding: 7px 8px; text-align: right; border-bottom: 2px solid var(--gold); }
  th.n { text-align: center; }
  td { padding: 7px 8px; border-bottom: 1px solid var(--line); vertical-align: top; }
  tbody tr:nth-child(even) td { background: var(--zebra); }
  tr { break-inside: avoid; }
  td.n { text-align: center; font-variant-numeric: tabular-nums; white-space: nowrap; }
  td.strong { font-weight: 800; color: var(--navy); }
  td.item b { font-weight: 700; display: block; }
  td.item .sub { display: block; color: var(--muted); font-size: 9.5px; }
  td.empty { text-align: center; color: var(--muted); padding: 16px; }
  .totals { margin-right: auto; width: 56%; border: 1px solid var(--line); border-radius: 10px; overflow: hidden; break-inside: avoid; }
  .trow { display: flex; justify-content: space-between; padding: 7px 14px; border-bottom: 1px solid var(--line); font-size: 11.5px; }
  .trow span { color: var(--muted); } .trow b { font-weight: 700; font-variant-numeric: tabular-nums; }
  .trow.minus b { color: #B91C1C; }
  .trow.sub-total { background: var(--zebra); } .trow.sub-total span { color: var(--ink); font-weight: 700; }
  .trow.grand { background: var(--navy); border-bottom: 0; padding: 10px 14px; }
  .trow.grand span, .trow.grand b { color: #fff; font-size: 14px; font-weight: 800; }
  .notes { margin-top: 12px; padding: 9px 14px; border: 1px dashed var(--line); border-radius: 10px; color: var(--muted); font-size: 10px; break-inside: avoid; }
  .foot { margin-top: 18px; padding-top: 9px; border-top: 1px solid var(--line); color: var(--muted); font-size: 10px; display: flex; justify-content: space-between; }
  .thanks { text-align: center; margin-top: 16px; font-weight: 800; color: var(--navy); font-size: 12px; }
  @media screen { body { max-width: 900px; margin: 24px auto; padding: 0 16px; } }
</style>
</head>
<body>
  <header class="head">
    <div class="brand"><img src="${esc(logo)}" alt="" /><div><div class="org">دار الفتح للنشر والتوزيع</div><h1>فاتورة</h1></div></div>
    <div class="stamp"><span>رقم الفاتورة</span><b>${esc(order.id)}</b><span>${esc(date)}</span></div>
  </header>
  <div class="goldbar"></div>

  <div class="cards">
    <div class="card">
      <h2>بيانات العميل</h2>
      <div class="kv"><span>الاسم</span><b>${esc(customerName)}</b></div>
      ${phone ? `<div class="kv"><span>رقم الهاتف</span><b><span class="ltr">${esc(phone)}</span></b></div>` : ''}
      ${email ? `<div class="kv"><span>البريد</span><b><span class="ltr">${esc(email)}</span></b></div>` : ''}
      ${addressLine(address) ? `<div class="kv"><span>العنوان</span><b>${esc(addressLine(address))}${address?.country ? `، ${esc(address.country)}` : ''}</b></div>` : ''}
      ${address?.notes?.trim() ? `<div class="kv"><span>ملاحظات</span><b>${esc(address.notes)}</b></div>` : ''}
    </div>
    <div class="card">
      <h2>بيانات الطلب</h2>
      <div class="kv"><span>حالة الطلب</span><b>${esc(order.status)}</b></div>
      <div class="kv"><span>الدفع</span><b>${esc(paymentName || '—')} <span class="pill ${paymentTone}">${esc(order.payment_status)}</span></b></div>
      ${order.shipping_companies?.company_name ? `<div class="kv"><span>شركة الشحن</span><b>${esc(order.shipping_companies.company_name)}</b></div>` : ''}
      ${order.tracking_number ? `<div class="kv"><span>رقم التتبع</span><b><span class="ltr">${esc(order.tracking_number)}</span></b></div>` : ''}
    </div>
  </div>

  <table>
    <thead><tr>
      <th class="n">#</th><th>الصنف</th><th class="n">النوع</th><th class="n">العدد</th><th class="n">سعر الوحدة</th><th class="n">الخصم</th><th class="n">الإجمالي</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="totals">${totalRows}</div>

  ${order.notes?.trim() ? `<div class="notes"><b>ملاحظات الطلب:</b> ${esc(order.notes)}</div>` : ''}
  <div class="thanks">شكرًا لثقتكم في دار الفتح</div>
  <div class="foot"><span>فاتورة آلية من لوحة تحكم دار الفتح</span><span>${esc(date)}</span></div>
</body>
</html>`;
}

/** Opens the print window with the invoice (choose «Save as PDF» there for the file). */
export async function printInvoice(order: Order, options: InvoiceOptions = {}): Promise<void> {
  await printHtml(buildInvoiceHtml(order, options), `فاتورة-${order.id}`);
}
