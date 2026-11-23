import { describe, expect, it } from 'vitest';
import {
  CARD_ELEMENT_KEYS, DEFAULT_COPYRIGHT, DEFAULT_DISPLAY, DEFAULT_FOOTER_COLUMNS, DEFAULT_FOOTER_NOTE, DEFAULT_TRUST, FOOTER_MAX_COLUMNS, FOOTER_MAX_LINKS,
  PAGE_ELEMENT_KEYS, TRUST_MAX_ITEMS, appPrimaryColor, cleanText, copyrightText, discountText, displayToRow, footerGrid, footerLinkKind, isDefaultDisplay, isLowStock,
  isNewBook, resolveDisplay, safeFooterUrl, shown,
} from './displaySettings';

describe('defaults are how things were designed', () => {
  it('nothing saved (or rubbish saved) is the default', () => {
    for (const raw of [null, undefined, {}, [], 'x', 5, { card: 'x', page: [], footer: 7 }]) {
      expect(resolveDisplay(raw)).toEqual(DEFAULT_DISPLAY);
    }
    expect(isDefaultDisplay(DEFAULT_DISPLAY)).toBe(true);
  });

  it('the card and page defaults keep today\'s behaviour on each channel', () => {
    const d = DEFAULT_DISPLAY;
    // the website's card has always had these and never a low-stock badge
    expect(d.card.show.share.web).toBe(true);
    expect(d.card.show.lowStock).toEqual({ web: false, app: true });
    expect(d.card.show.isNew).toEqual({ web: false, app: false });
    // the app has always shown language and ISBN; the website never
    expect(d.page.show.language).toEqual({ web: false, app: true });
    expect(d.page.show.isbn).toEqual({ web: false, app: true });
    // the website has always had a trust row; the app never
    expect(d.page.show.trust).toEqual({ web: true, app: false });
    expect(d.page.trust.map((t) => t.text)).toEqual(['منتج أصلي', 'شحن سريع']);
    expect(d.footer.columns.map((c) => c.title)).toEqual(['روابط سريعة', 'خدمة العملاء']);
    expect(d.footer.columns[0].links).toHaveLength(5);
    expect(d.footer.columns[1].links).toHaveLength(4);
    expect(d.footer.showContact).toBe(true);
  });

  it('every element has a switch for both places', () => {
    for (const key of CARD_ELEMENT_KEYS) expect(Object.keys(DEFAULT_DISPLAY.card.show[key]).sort()).toEqual(['app', 'web']);
    for (const key of PAGE_ELEMENT_KEYS) expect(Object.keys(DEFAULT_DISPLAY.page.show[key]).sort()).toEqual(['app', 'web']);
  });

  it('keeps the app primary color unchanged by default and rejects unknown presets', () => {
    expect(DEFAULT_DISPLAY.appPalette).toEqual({ light: 'default', dark: 'default' });
    expect(appPrimaryColor(resolveDisplay(null).appPalette.light)).toBeNull();
    expect(resolveDisplay({ appPalette: { light: 'navy', dark: 'purple' } }).appPalette)
      .toEqual({ light: 'navy', dark: 'default' });
    expect(appPrimaryColor('navy')).toBe('#054180');
  });
});

describe('reading what was saved', () => {
  it('keeps explicit choices and fills the rest', () => {
    const r = resolveDisplay({ card: { show: { share: { web: false }, isNew: { web: true, app: true } }, newDays: 14, tilt: false } });
    expect(r.card.show.share).toEqual({ web: false, app: false });
    expect(r.card.show.isNew).toEqual({ web: true, app: true });
    expect(r.card.show.rating).toEqual({ web: true, app: true });
    expect(r.card.newDays).toBe(14);
    expect(r.card.tilt).toBe(false);
  });

  it('clamps numbers and whitelists choices', () => {
    const r = resolveDisplay({ card: { newDays: 99999, lowStockAt: 0, discountStyle: 'wild', perRow: { desktop: 9, mobile: 3 } } });
    expect(r.card.newDays).toBe(365);
    expect(r.card.lowStockAt).toBe(1);
    expect(r.card.discountStyle).toBe('percent');
    expect(r.card.perRow).toEqual({ desktop: null, mobile: null });
    expect(resolveDisplay({ card: { perRow: { desktop: 4, mobile: 1 } } }).card.perRow).toEqual({ desktop: 4, mobile: 1 });
    expect(resolveDisplay({ card: { newDays: '7' } }).card.newDays).toBe(7);
  });

  it('trust items: known icons, short text, at most four, no markup', () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ icon: 'gift', text: `ميزة ${i}` }));
    expect(resolveDisplay({ page: { trust: many } }).page.trust).toHaveLength(TRUST_MAX_ITEMS);
    const r = resolveDisplay({ page: { trust: [{ icon: 'nope', text: '<b>x</b>' }, { icon: 'truck', text: '' }, 'junk'] } });
    // the angle brackets are gone, so no tag can be formed; an unknown icon becomes a tick; an empty text drops the badge
    expect(r.page.trust).toEqual([{ icon: 'check', text: 'b x /b' }]);
    // an empty list is allowed: no badges at all
    expect(resolveDisplay({ page: { trust: [] } }).page.trust).toEqual([]);
    expect(resolveDisplay({ page: { trust: 'x' } }).page.trust).toEqual(DEFAULT_TRUST);
  });

  it('the description is optional text', () => {
    expect(resolveDisplay({ page: { description: '  جملة  ' } }).page.description).toBe('جملة');
    expect(resolveDisplay({ page: { description: '   ' } }).page.description).toBeNull();
    expect(resolveDisplay({ page: { description: 'ا'.repeat(900) } }).page.description).toHaveLength(400);
  });
});

describe('the footer', () => {
  it('only safe addresses', () => {
    expect(safeFooterUrl('/books')).toBe('/books');
    expect(safeFooterUrl('/policies#terms')).toBe('/policies#terms');
    expect(safeFooterUrl('https://darolfath.com/links')).toBe('https://darolfath.com/links');
    expect(safeFooterUrl('mailto:info@darolfath.com')).toBe('mailto:info@darolfath.com');
    expect(safeFooterUrl('tel:+201000000000')).toBe('tel:+201000000000');
    for (const bad of ['javascript:alert(1)', 'http://x.com', '//evil.com', 'data:text/html,x', ' ', '', 'books', '/a b', 'https://', '/"onclick', 5, null]) {
      expect(safeFooterUrl(bad)).toBeNull();
    }
    expect(footerLinkKind('/books')).toBe('internal');
    expect(footerLinkKind('https://a.com')).toBe('external');
    expect(footerLinkKind('mailto:a@b.c')).toBe('mail');
    expect(footerLinkKind('tel:+2010')).toBe('tel');
  });

  it('drops bad links and empty columns, and caps the sizes', () => {
    const r = resolveDisplay({
      footer: {
        columns: [
          { title: 'عمود', links: [{ label: 'سليم', url: '/ok' }, { label: 'خطر', url: 'javascript:x' }, { label: '', url: '/x' }] },
          { title: '', links: [] },
          { title: 'كبير', links: Array.from({ length: 20 }, (_, i) => ({ label: `ر${i}`, url: `/p${i}` })) },
          { title: '3', links: [{ label: 'a', url: '/a' }] },
          { title: '4', links: [{ label: 'a', url: '/a' }] },
        ],
      },
    });
    expect(r.footer.columns[0]).toEqual({ title: 'عمود', links: [{ label: 'سليم', url: '/ok' }] });
    expect(r.footer.columns).toHaveLength(FOOTER_MAX_COLUMNS);
    expect(r.footer.columns[1].links).toHaveLength(FOOTER_MAX_LINKS);
  });

  it('a saved empty list of columns is no columns (not the defaults); a missing one is the defaults', () => {
    expect(resolveDisplay({ footer: { columns: [] } }).footer.columns).toEqual([]);
    expect(resolveDisplay({ footer: {} }).footer.columns).toEqual(DEFAULT_FOOTER_COLUMNS);
  });

  it('the bottom lines: missing is the default, empty hides, year token', () => {
    expect(resolveDisplay({ footer: {} }).footer.copyright).toBe(DEFAULT_COPYRIGHT);
    expect(resolveDisplay({ footer: {} }).footer.note).toBe(DEFAULT_FOOTER_NOTE);
    expect(resolveDisplay({ footer: { note: '' } }).footer.note).toBe('');
    expect(resolveDisplay({ footer: { showContact: false } }).footer.showContact).toBe(false);
    expect(copyrightText(DEFAULT_COPYRIGHT, 2027)).toBe('جميع الحقوق محفوظة © 2027 دار الفتح');
    expect(copyrightText('بدون سنة', 2027)).toBe('بدون سنة');
  });

  it('the grid keeps the designed widths', () => {
    expect(footerGrid(DEFAULT_DISPLAY.footer)).toBe('2.2fr 1fr 1fr 1.05fr');
    expect(footerGrid({ ...DEFAULT_DISPLAY.footer, showContact: false })).toBe('2.2fr 1fr 1fr');
    expect(footerGrid({ ...DEFAULT_DISPLAY.footer, columns: [] })).toBe('2.2fr 1.05fr');
  });
});

describe('using it', () => {
  const now = Date.parse('2026-11-22T12:00:00Z');
  it('new within the days, never in the future, never without a date', () => {
    expect(isNewBook('2026-11-10T00:00:00Z', 30, now)).toBe(true);
    expect(isNewBook('2026-09-01T00:00:00Z', 30, now)).toBe(false);
    expect(isNewBook('2026-12-01T00:00:00Z', 30, now)).toBe(false);
    expect(isNewBook(null, 30, now)).toBe(false);
    expect(isNewBook('not a date', 30, now)).toBe(false);
  });

  it('low stock: some left, up to the limit', () => {
    expect(isLowStock(3, 5)).toBe(true);
    expect(isLowStock(5, 5)).toBe(true);
    expect(isLowStock(6, 5)).toBe(false);
    expect(isLowStock(0, 5)).toBe(false);
    expect(isLowStock(null, 5)).toBe(false);
    expect(isLowStock(undefined, 5)).toBe(false);
  });

  it('the discount text', () => {
    expect(discountText('percent', 19.6, 30, 'ج.م')).toBe('20%');
    expect(discountText('amount', 20, 30, 'ج.م')).toBe('وفّر 30 ج.م');
    expect(discountText('amount', 20, 12.5, 'ج.م')).toBe('وفّر 12.5 ج.م');
    expect(discountText('amount', 20, 12.5, '')).toBe('وفّر 12.5');
    expect(discountText('amount', 20, null, 'ج.م')).toBe('20%');
    expect(discountText('amount', 20, 0, 'ج.م')).toBe('20%');
  });

  it('shown reads the channel', () => {
    expect(shown({ web: true, app: false }, 'web')).toBe(true);
    expect(shown({ web: true, app: false }, 'app')).toBe(false);
  });

  it('the row to save is clean and idempotent', () => {
    const dirty = { ...DEFAULT_DISPLAY, card: { ...DEFAULT_DISPLAY.card, newDays: 9999 } };
    const row = displayToRow(dirty);
    expect(row.id).toBe(1);
    expect(row.display.card.newDays).toBe(365);
    expect(displayToRow(row.display)).toEqual(row);
  });

  it('cleanText strips markup characters and collapses space', () => {
    expect(cleanText('  a\n\tb <i> ', 50)).toBe('a b i');
    expect(cleanText(5, 5)).toBe('');
  });
});
