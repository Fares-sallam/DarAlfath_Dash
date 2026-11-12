import { describe, expect, it } from 'vitest';
import {
  MAX_BUTTON, MAX_TITLE, bookLink, cardProblems, categoryLink, describeLink, isInternalLink, parseLink, seriesLink,
  settingsProblem, storePath,
} from './promoCards';

const BOOK = '7a00133f-84cb-42fb-93e0-0d660a730cf5';
const base = { title: 'عرض', subtitle: null, button_label: null, link_url: null, image_url: null, image_url_dark: null };

describe('isInternalLink', () => {
  it('accepts routes inside the app only', () => {
    expect(isInternalLink('/search')).toBe(true);
    expect(isInternalLink('  /cart ')).toBe(true);
    expect(isInternalLink('https://example.com/x')).toBe(false);
    expect(isInternalLink('//evil.example')).toBe(false);
    expect(isInternalLink('book/1')).toBe(false);
    expect(isInternalLink('')).toBe(false);
    expect(isInternalLink(null)).toBe(false);
  });
});

describe('links round-trip', () => {
  it('a book', () => {
    expect(bookLink(BOOK)).toBe(`/book/${BOOK}`);
    expect(parseLink(bookLink(BOOK))).toEqual({ kind: 'book', id: BOOK });
  });
  it('a category (by name, as the app filters by name), with Arabic and spaces', () => {
    const link = categoryLink('الأنشطة والمتابعة');
    expect(link.startsWith('/search?category=')).toBe(true);
    expect(parseLink(link)).toEqual({ kind: 'category', name: 'الأنشطة والمتابعة' });
  });
  it('a series, with its name as the page title', () => {
    const link = seriesLink('06b305bf-7659-48bb-99a8-585b5b40a3df', 'سلسلة الفتح الرباني');
    expect(parseLink(link)).toEqual({ kind: 'series', id: '06b305bf-7659-48bb-99a8-585b5b40a3df', title: 'سلسلة الفتح الرباني' });
  });
  it('the fixed screens are recognised', () => {
    expect(parseLink('/ebooks')).toEqual({ kind: 'static', path: '/ebooks' });
    expect(parseLink('/search?sort=newest')).toEqual({ kind: 'static', path: '/search?sort=newest' });
  });
  it('anything else is custom, empty is none', () => {
    expect(parseLink('/search?type=digital&sort=price_asc')).toEqual({ kind: 'custom', path: '/search?type=digital&sort=price_asc' });
    expect(parseLink('/notifications')).toEqual({ kind: 'custom', path: '/notifications' });
    expect(parseLink('  ')).toEqual({ kind: 'none' });
    expect(parseLink(null)).toEqual({ kind: 'none' });
  });
});

describe('cardProblems', () => {
  it('a titled card with nothing else is fine', () => {
    expect(cardProblems(base)).toEqual([]);
  });
  it('needs a title or a picture (a warning)', () => {
    expect(cardProblems({ ...base, title: '  ' })).toEqual([expect.objectContaining({ blocking: false })]);
    expect(cardProblems({ ...base, title: '', image_url_dark: 'https://x/y.png' })).toEqual([]);
  });
  it('a button needs somewhere to go (a warning: a draft can still be saved)', () => {
    expect(cardProblems({ ...base, button_label: 'تسوق الآن' })).toEqual([expect.objectContaining({ blocking: false })]);
    expect(cardProblems({ ...base, button_label: 'تسوق الآن', link_url: '/search' })).toEqual([]);
  });
  it('refuses a link out of the app, which the app would drop', () => {
    const p = cardProblems({ ...base, link_url: 'https://dar-alfath-client.vercel.app/books' });
    expect(p).toHaveLength(1);
    expect(p[0].text).toContain('خارجي');
    expect(p[0].blocking).toBe(true);
  });
  it('keeps texts within the limits the card is drawn for', () => {
    expect(cardProblems({ ...base, title: 'ا'.repeat(MAX_TITLE + 1) })).toEqual([expect.objectContaining({ blocking: true })]);
    expect(cardProblems({ ...base, button_label: 'ا'.repeat(MAX_BUTTON + 1), link_url: '/search' })).toEqual([expect.objectContaining({ blocking: true })]);
  });
});

describe('settingsProblem', () => {
  it('2 to 60 whole seconds', () => {
    expect(settingsProblem(5)).toBeNull();
    expect(settingsProblem(2)).toBeNull();
    expect(settingsProblem(60)).toBeNull();
    expect(settingsProblem(1)).not.toBeNull();
    expect(settingsProblem(61)).not.toBeNull();
    expect(settingsProblem(2.5)).not.toBeNull();
    expect(settingsProblem(NaN)).not.toBeNull();
  });
});

describe('storePath (quick navigation)', () => {
  const lookup = { categoryIdByName: (n: string) => (n === 'الحساب' ? 'cat-1' : undefined) };
  it('maps what the store has', () => {
    expect(storePath('/search', lookup)).toBe('/books');
    expect(storePath(`/book/${BOOK}`, lookup)).toBe(`/book/${BOOK}`);
    expect(storePath(seriesLink('s-1', 'س'), lookup)).toBe('/books?series=s-1');
    expect(storePath(categoryLink('الحساب'), lookup)).toBe('/books?category=cat-1');
  });
  it('is null where the store has no such page', () => {
    expect(storePath('/ebooks', lookup)).toBeNull();
    expect(storePath(categoryLink('غير موجود'), lookup)).toBeNull();
    expect(storePath(null, lookup)).toBeNull();
    expect(storePath('/notifications', lookup)).toBeNull();
  });
});

describe('describeLink', () => {
  it('reads a link back in Arabic', () => {
    expect(describeLink(null)).toBe('من غير وجهة');
    expect(describeLink('/cart')).toBe('السلة');
    expect(describeLink(categoryLink('الحساب'))).toBe('تصنيف «الحساب»');
    expect(describeLink(bookLink(BOOK), { book: 'النحو بين يديك' })).toBe('كتاب «النحو بين يديك»');
    expect(describeLink(seriesLink('s', 'سلسلة س'))).toBe('سلسلة «سلسلة س»');
  });
});
