import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LINKS_SETTINGS, LINK_PRESETS, ICON_OPTIONS, blockStatus, blockToRow, classifyUrl, cleanLook, endsLabel, groupBlocks,
  isImageUrl, isLive, makeBlock, normalizeUrlInput, resolveBlock, resolveLook, resolveSettings, sortBlocks, validateBlock,
} from './linksPage';

const link = (patch = {}) => makeBlock('link', { id: crypto.randomUUID(), title: 'فيسبوك', url: 'https://facebook.com/x', ...patch });

describe('classifyUrl: the only addresses the page will draw', () => {
  it('accepts https/http, paths inside the store, mailto, tel and anchors', () => {
    expect(classifyUrl('https://wa.me/201010848033')).toEqual({ href: 'https://wa.me/201010848033', kind: 'external' });
    expect(classifyUrl('http://example.com')?.kind).toBe('external');
    expect(classifyUrl('/books?series=abc')).toEqual({ href: '/books?series=abc', kind: 'internal' });
    expect(classifyUrl('/')?.kind).toBe('internal');
    expect(classifyUrl('mailto:store@darolfath.com')?.kind).toBe('mail');
    expect(classifyUrl('mailto:a@b.co?subject=hi')?.kind).toBe('mail');
    expect(classifyUrl('tel:+201010848033')?.kind).toBe('tel');
    expect(classifyUrl('#top')?.kind).toBe('anchor');
    expect(classifyUrl('  https://example.com  ')?.href).toBe('https://example.com');
  });

  it('refuses everything that can run code or leave the store by surprise', () => {
    for (const bad of [
      'javascript:alert(1)', 'JAVASCRIPT:alert(1)', ' javascript:alert(1)', 'data:text/html,<script>1</script>', 'vbscript:x', 'file:///etc/passwd',
      '//evil.com', '/\\evil.com', '\\\\evil.com', 'ftp://x.com', 'https://', 'https://a b.com', 'https://a.com/\nx', 'https://a.com/\u0000',
      'mailto:', 'mailto:not-an-address', 'tel:abc', 'tel:', 'www.facebook.com/x', 'facebook', '',
    ]) {
      expect(classifyUrl(bad), JSON.stringify(bad)).toBeNull();
    }
    expect(classifyUrl(null)).toBeNull();
    expect(classifyUrl(undefined)).toBeNull();
    expect(classifyUrl(`https://a.com/${'x'.repeat(2000)}`)).toBeNull();
  });
});

describe('normalizeUrlInput', () => {
  it('makes a bare address a link and leaves everything else alone', () => {
    expect(normalizeUrlInput('facebook.com/darolfath')).toBe('https://facebook.com/darolfath');
    expect(normalizeUrlInput('www.example.com')).toBe('https://www.example.com');
    expect(normalizeUrlInput('  wa.me/201010848033 ')).toBe('https://wa.me/201010848033');
    expect(normalizeUrlInput('https://x.com')).toBe('https://x.com');
    expect(normalizeUrlInput('/books')).toBe('/books');
    expect(normalizeUrlInput('mailto:a@b.co')).toBe('mailto:a@b.co');
    expect(normalizeUrlInput('tel:+20100')).toBe('tel:+20100');
    expect(normalizeUrlInput('javascript:alert(1)')).toBe('javascript:alert(1)'); // untouched; classifyUrl refuses it
    expect(normalizeUrlInput('')).toBe('');
    expect(normalizeUrlInput('كتاب')).toBe('كتاب');
  });
});

describe('isImageUrl', () => {
  it('wants https', () => {
    expect(isImageUrl('https://x.supabase.co/a.webp')).toBe(true);
    expect(isImageUrl('http://x.com/a.png')).toBe(false);
    expect(isImageUrl('javascript:1')).toBe(false);
    expect(isImageUrl('')).toBe(false);
    expect(isImageUrl(null)).toBe(false);
  });
});

describe('when a block shows', () => {
  const now = new Date('2026-11-11T12:00:00Z');
  it('follows the switch and the dates', () => {
    expect(blockStatus({ is_active: true, starts_at: null, ends_at: null }, now)).toBe('live');
    expect(blockStatus({ is_active: false, starts_at: null, ends_at: null }, now)).toBe('hidden');
    expect(blockStatus({ is_active: true, starts_at: '2026-11-12T00:00:00Z', ends_at: null }, now)).toBe('scheduled');
    expect(blockStatus({ is_active: true, starts_at: null, ends_at: '2026-11-11T11:59:59Z' }, now)).toBe('ended');
    expect(blockStatus({ is_active: true, starts_at: null, ends_at: '2026-11-11T12:00:00Z' }, now)).toBe('ended'); // the end is exclusive, like the database rule
    expect(blockStatus({ is_active: true, starts_at: '2026-11-11T12:00:00Z', ends_at: '2026-11-12T00:00:00Z' }, now)).toBe('live'); // the start is inclusive
    expect(isLive({ is_active: false, starts_at: '2020-01-01T00:00:00Z', ends_at: null }, now)).toBe(false);
  });
});

describe('endsLabel', () => {
  it('says the day in Arabic, in Cairo time, with Western digits', () => {
    // the comma after the weekday is the engine's own Arabic punctuation; it is not what is being checked
    expect(endsLabel('2026-11-19T10:00:00Z')).toMatch(/^ينتهي يوم الخميس،? 19 نوفمبر$/);
    expect(endsLabel('2026-11-19T22:30:00Z')).toMatch(/^ينتهي يوم الجمعة،? 20 نوفمبر$/); // already the next day in Cairo
    expect(endsLabel('not a date')).toBe('');
  });
});

describe('look: a bad or missing value falls back, never breaks', () => {
  it('has the same defaults for every kind', () => {
    expect(resolveLook('link', {})).toMatchObject({ style: 'primary', display: 'button', newTab: null });
    expect(resolveLook('heading', {})).toMatchObject({ align: 'center', size: 'md' });
    expect(resolveLook('divider', {})).toMatchObject({ dividerType: 'pattern', dividerLength: 'medium' });
  });

  it('refuses anything outside the lists', () => {
    const look = resolveLook('link', { style: 'neon', display: 'popup', newTab: 'yes', align: 'left', size: 'huge', type: 'wavy', length: 'epic' });
    expect(look).toMatchObject({ style: 'primary', display: 'button', newTab: null, align: 'center', size: 'md', dividerType: 'pattern', dividerLength: 'medium' });
    expect(resolveLook('link', null).style).toBe('primary');
    expect(resolveLook('link', [1, 2]).style).toBe('primary');
    expect(resolveLook('link', 'x').style).toBe('primary');
  });

  it('only a link can be an icon, and only text can be justified', () => {
    expect(resolveLook('offer', { display: 'icon' }).display).toBe('button');
    expect(resolveLook('text', { align: 'justify' }).align).toBe('justify');
    expect(resolveLook('heading', { align: 'justify' }).align).toBe('center');
  });

  it('saves only the choices a kind has', () => {
    expect(cleanLook('link', { style: 'teal', display: 'icon', size: 'lg', type: 'dashed' })).toEqual({ style: 'teal', display: 'icon' });
    expect(cleanLook('link', { newTab: false })).toEqual({ style: 'primary', display: 'button', newTab: false });
    expect(cleanLook('divider', { type: 'band', length: 'long', style: 'teal' })).toEqual({ type: 'band', length: 'long' });
    expect(cleanLook('heading', { align: 'end', size: 'sm' })).toEqual({ align: 'end', size: 'sm' });
    expect(cleanLook('offer', { style: 'mint', showEnd: true })).toEqual({ style: 'mint', showEnd: true });
    expect(cleanLook('image', { showCaption: true })).toEqual({ showCaption: true });
  });
});

describe('what is saved is read safely', () => {
  it('settings: junk becomes the defaults', () => {
    expect(resolveSettings(null)).toEqual(DEFAULT_LINKS_SETTINGS);
    expect(resolveSettings({ button_shape: 'blob', background: 'video', is_enabled: 'no', title: 5, share_image_url: '  ' })).toEqual(DEFAULT_LINKS_SETTINGS);
    expect(resolveSettings({ button_shape: 'pill', is_enabled: false, title: 'روابط' })).toMatchObject({ button_shape: 'pill', is_enabled: false, title: 'روابط' });
  });

  it('a block without an id is dropped; unknown kinds become links', () => {
    expect(resolveBlock(null)).toBeNull();
    expect(resolveBlock({ kind: 'link' })).toBeNull();
    expect(resolveBlock({ id: 'a', kind: 'script', title: 'x' })?.kind).toBe('link');
    expect(resolveBlock({ id: 'a', kind: 'text', body: 'نص', look: [1] })?.look).toEqual({});
    expect(resolveBlock({ id: 'a', kind: 'link', url: '   ' })?.url).toBeNull();
  });

  it('keeps the order', () => {
    const a = makeBlock('link', { sort_order: 20 });
    const b = makeBlock('link', { sort_order: 10 });
    expect(sortBlocks([a, b]).map((x) => x.sort_order)).toEqual([10, 20]);
  });
});

describe('groupBlocks: links drawn as icons that touch become one row', () => {
  const icon = (id: string) => link({ id, look: { display: 'icon' } });
  const button = (id: string) => link({ id });

  it('joins neighbours and splits at anything else', () => {
    const items = groupBlocks([icon('1'), icon('2'), button('3'), icon('4'), makeBlock('divider', { id: '5' }), icon('6'), icon('7')]);
    expect(items.map((i) => (i.type === 'icons' ? `icons:${i.blocks.map((b) => b.id).join(',')}` : `block:${i.block.id}`))).toEqual([
      'icons:1,2', 'block:3', 'icons:4', 'block:5', 'icons:6,7',
    ]);
  });

  it('is empty for nothing', () => {
    expect(groupBlocks([])).toEqual([]);
  });
});

describe('validateBlock', () => {
  it('only a block that shows has to be right', () => {
    expect(validateBlock(link({ is_active: false, url: 'javascript:alert(1)' }))).toEqual([]);
  });

  it('a link needs a title and a good address', () => {
    expect(validateBlock(link())).toEqual([]);
    expect(validateBlock(link({ title: '' }))).toHaveLength(1);
    expect(validateBlock(link({ url: null }))).toEqual(['الرابط مطلوب']);
    expect(validateBlock(link({ url: 'javascript:alert(1)' }))[0]).toContain('مش صالح');
    expect(validateBlock(link({ url: '/books' }))).toEqual([]);
  });

  it('an offer needs a title; a coupon is plain letters; "ends" needs an end date', () => {
    const offer = (patch = {}) => makeBlock('offer', { title: 'عرض', ...patch });
    expect(validateBlock(offer())).toEqual([]);
    expect(validateBlock(offer({ title: '' }))).toHaveLength(1);
    expect(validateBlock(offer({ coupon_code: 'BAD CODE' }))).toHaveLength(1);
    expect(validateBlock(offer({ coupon_code: 'DARALFATH20' }))).toEqual([]);
    expect(validateBlock(offer({ look: { showEnd: true } }))).toHaveLength(1);
    expect(validateBlock(offer({ look: { showEnd: true }, ends_at: '2030-01-01T00:00:00Z' }))).toEqual([]);
  });

  it('an image needs a picture on https', () => {
    expect(validateBlock(makeBlock('image'))).toEqual(['الصورة مطلوبة']);
    expect(validateBlock(makeBlock('image', { image_url: 'http://x.com/a.png' }))).toHaveLength(1);
    expect(validateBlock(makeBlock('image', { image_url: 'https://x.com/a.png' }))).toEqual([]);
  });

  it('headings and text need their words; a divider needs nothing', () => {
    expect(validateBlock(makeBlock('heading'))).toHaveLength(1);
    expect(validateBlock(makeBlock('heading', { title: 'تابعنا' }))).toEqual([]);
    expect(validateBlock(makeBlock('text', { body: '  ' }))).toHaveLength(1);
    expect(validateBlock(makeBlock('divider'))).toEqual([]);
  });

  it('dates must run forwards', () => {
    expect(validateBlock(link({ starts_at: '2026-02-01T00:00:00Z', ends_at: '2026-01-01T00:00:00Z' }))).toHaveLength(1);
  });
});

describe('blockToRow: what is written to the database', () => {
  it('trims, empties become null, the position is the index, the look is clean', () => {
    const row = blockToRow(
      makeBlock('link', { id: 'abc', title: ' فيسبوك ', body: '  ', url: ' https://facebook.com/x ', icon: '', badge: ' ', look: { style: 'teal', display: 'icon', size: 'lg' } }),
      7,
    );
    expect(row).toMatchObject({ id: 'abc', kind: 'link', sort_order: 7, title: 'فيسبوك', body: '', url: 'https://facebook.com/x', icon: null, badge: null, cta_label: null, image_url: null, coupon_code: null });
    expect(row.look).toEqual({ style: 'teal', display: 'icon' });
  });
});

describe('quick starts and icons', () => {
  const known = new Set(ICON_OPTIONS.map((o) => o.key));
  it('every quick start uses an icon the page can draw, and makes a valid block once it has its address', () => {
    for (const preset of LINK_PRESETS) {
      expect(known.has(preset.patch.icon as string), preset.key).toBe(true);
      const block = makeBlock('link', { ...preset.patch, url: 'https://example.com' });
      expect(validateBlock(block), preset.key).toEqual([]);
    }
  });

  it('icon keys are unique', () => {
    expect(known.size).toBe(ICON_OPTIONS.length);
  });
});
