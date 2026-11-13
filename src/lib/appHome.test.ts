import { describe, expect, it } from 'vitest';
import {
  DEFAULT_APP_HOME_SETTINGS, MAX_TEXT_LENGTH, cartProgress, cleanBrandName, cleanText, fillTemplate, formatAmount, sameSettings,
  toSettings, unknownPlaceholders,
} from './appHome';

describe('cleanText', () => {
  it('trims, and turns empty into null (the app then uses its own wording)', () => {
    expect(cleanText('  اطلب بـ {threshold}  ')).toBe('اطلب بـ {threshold}');
    expect(cleanText('   ')).toBeNull();
    expect(cleanText('')).toBeNull();
  });
  it('cuts at the length the app takes', () => {
    expect(cleanText('ا'.repeat(500))).toHaveLength(MAX_TEXT_LENGTH);
  });
});

describe('cleanBrandName', () => {
  it('uses the app default for an empty value and keeps the name on one line', () => {
    expect(cleanBrandName('   ')).toBeNull();
    expect(cleanBrandName('دار الفتح\nللنشر والتوزيع')).toBe('دار الفتح للنشر والتوزيع');
  });
  it('limits the name to what fits the app header', () => {
    expect(cleanBrandName('a'.repeat(100))).toHaveLength(60);
  });
});

describe('unknownPlaceholders', () => {
  it('knows the three words the app fills in', () => {
    expect(unknownPlaceholders('أضفت {added} وباقي {remaining} من {threshold}')).toEqual([]);
  });
  it('finds a typo, once', () => {
    expect(unknownPlaceholders('باقي {remainning} و{remainning} و{added}')).toEqual(['{remainning}']);
  });
  it('ignores plain text', () => {
    expect(unknownPlaceholders('شحن مجاني')).toEqual([]);
  });
});

describe('fillTemplate', () => {
  it('fills what it knows and leaves the rest as written', () => {
    expect(fillTemplate('باقي {remaining} من {threshold} ({x})', { remaining: '353', threshold: '503' })).toBe('باقي 353 من 503 ({x})');
  });
});

describe('toSettings', () => {
  it('a missing row is everything on with the app wording', () => {
    expect(toSettings(null)).toEqual(DEFAULT_APP_HOME_SETTINGS);
    expect(toSettings({})).toEqual(DEFAULT_APP_HOME_SETTINGS);
  });
  it('only an explicit false switches something off', () => {
    const s = toSettings({ show_offers: false, free_shipping_bar_enabled: false, show_new_arrivals: null as unknown as boolean });
    expect(s.show_offers).toBe(false);
    expect(s.free_shipping_bar_enabled).toBe(false);
    expect(s.show_new_arrivals).toBe(true);
    expect(s.show_ebook_library).toBe(true);
  });
});

describe('sameSettings', () => {
  it('compares what the app would show', () => {
    const a = { ...DEFAULT_APP_HOME_SETTINGS };
    expect(sameSettings(a, { ...a })).toBe(true);
    expect(sameSettings(a, { ...a, show_offers: false })).toBe(false);
    expect(sameSettings(a, { ...a, store_departments_title: 'أقسامنا' })).toBe(false);
    expect(sameSettings(a, { ...a, brand_name_ar: 'دار أخرى' })).toBe(false);
  });
});

describe('cartProgress', () => {
  it('shows how much is left', () => {
    expect(cartProgress(503, 150)).toMatchObject({ reached: false, remaining: 353 });
  });
  it('rounds away float noise', () => {
    expect(cartProgress(503, 320.1).remaining).toBe(182.9);
    expect(formatAmount(cartProgress(503, 320.1).remaining)).toBe('182.9');
  });
  it('is reached at the threshold and above, with nothing left', () => {
    expect(cartProgress(503, 503)).toEqual({ reached: true, remaining: 0, fraction: 1 });
    expect(cartProgress(503, 900)).toEqual({ reached: true, remaining: 0, fraction: 1 });
  });
  it('an empty cart is an empty bar', () => {
    expect(cartProgress(500, 0).fraction).toBe(0);
  });
});
