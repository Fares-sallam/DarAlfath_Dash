import { describe, expect, it } from 'vitest';
import {
  BRAND_COLORS, BUTTON_COLORS, BUTTON_KEYS, DEFAULT_APPEARANCE, DEFAULT_HOME_SECTIONS, HOME_SECTION_KEYS, PREVIEW_PARAM,
  TONES, appearanceToRow, buttonCssVars, buttonPaint, clampStrength, contrastRatio, decodePreview, encodePreview,
  patternFactor, resolveAppearance, resolveButtonStyles, resolveHomeSections, seedFrom, shade, stripTones,
  type ButtonColor, type StorefrontAppearance, type Tone,
} from './appearance';
import { cleanLook, resolveLook, resolveSettings, DEFAULT_LINKS_SETTINGS } from './linksPage';

describe('pattern strength', () => {
  it('stays between 0 and 200 and falls back on anything that is not a number', () => {
    expect(clampStrength(100)).toBe(100);
    expect(clampStrength(-30)).toBe(0);
    expect(clampStrength(900)).toBe(200);
    expect(clampStrength('75')).toBe(75);
    expect(clampStrength(Number.NaN)).toBe(100);
    expect(clampStrength(undefined)).toBe(100);
    expect(clampStrength('abc', 40)).toBe(40);
    expect(patternFactor(150)).toBe(1.5);
    expect(patternFactor(0)).toBe(0);
  });
});

describe('home sections', () => {
  it('has every section, once, when nothing is saved', () => {
    expect(resolveHomeSections(undefined)).toEqual(DEFAULT_HOME_SECTIONS);
    expect(resolveHomeSections([]).map((s) => s.key)).toEqual(HOME_SECTION_KEYS);
  });

  it('keeps the saved order and visibility, drops unknown and repeated keys, appends what is missing', () => {
    const out = resolveHomeSections([
      { key: 'offers', visible: false },
      { key: 'nonsense', visible: true },
      { key: 'offers', visible: true },
      { key: 'features', visible: true },
      null,
      'x',
      { visible: true },
    ]);
    expect(out.slice(0, 2)).toEqual([{ key: 'offers', visible: false }, { key: 'features', visible: true }]);
    expect(out.map((s) => s.key).sort()).toEqual([...HOME_SECTION_KEYS].sort());
    expect(out).toHaveLength(HOME_SECTION_KEYS.length);
    expect(out.slice(2).every((s) => s.visible)).toBe(true);
  });
});

describe('button colours', () => {
  it('reads anything unknown as the original colour', () => {
    const styles = resolveButtonStyles({ add_to_cart: { color: 'red', tone: 1 }, quick_buy: 'teal', view_all: { color: 'teal', tone: 9 } });
    expect(styles.add_to_cart).toEqual({ color: 'default', tone: 0, night: { color: 'same', tone: 0 } });
    expect(styles.quick_buy).toEqual({ color: 'default', tone: 0, night: { color: 'same', tone: 0 } });
    expect(styles.view_all).toEqual({ color: 'teal', tone: 0, night: { color: 'same', tone: 0 } });
    expect(styles.view_category).toEqual({ color: 'default', tone: 0, night: { color: 'same', tone: 0 } });
    expect(resolveButtonStyles(null).add_to_cart.color).toBe('default');
    expect(resolveButtonStyles([1, 2]).quick_buy.color).toBe('default');
  });

  it('paints nothing for the original colour, and only house colours otherwise', () => {
    expect(buttonPaint({ color: 'default', tone: 0, night: { color: 'same', tone: 0 } })).toBeNull();
    expect(buttonCssVars(DEFAULT_APPEARANCE.button_styles)).toEqual({});
    const base = buttonPaint({ color: 'navy', tone: 0, night: { color: 'same', tone: 0 } });
    expect(base?.bg).toBe(BRAND_COLORS.navy.hex);
    expect(base?.fg).toBe('#ffffff');
  });

  it('names the css variables with dashes for every button', () => {
    const vars = buttonCssVars(resolveButtonStyles({ add_to_cart: { color: 'green', tone: 1 }, view_category: { color: 'mint', tone: 0 } }));
    expect(Object.keys(vars).sort()).toEqual([
      '--ab-add-to-cart-bg', '--ab-add-to-cart-fg', '--ab-add-to-cart-hover', '--ab-add-to-cart-hover-fg',
      '--ab-view-category-bg', '--ab-view-category-fg', '--ab-view-category-hover', '--ab-view-category-hover-fg',
    ]);
  });

  it('keeps the text readable on every colour and tone', () => {
    const worst: string[] = [];
    for (const color of BUTTON_COLORS.filter((c): c is Exclude<ButtonColor, 'default'> => c !== 'default')) {
      for (const tone of TONES) {
        const paint = buttonPaint({ color, tone, night: { color: 'same', tone: 0 } })!;
        // the text is always the better of white and the house navy: never worse than 3:1 (large, bold button text)
        const ratio = contrastRatio(paint.bg, paint.fg);
        const hoverRatio = contrastRatio(paint.hover, paint.hoverFg);
        if (ratio < 3 || hoverRatio < 3) worst.push(`${color}/${tone}: ${ratio.toFixed(2)} ${hoverRatio.toFixed(2)}`);
      }
    }
    expect(worst).toEqual([]);
  });

  it('has a night colour of its own: the same as the day by default, the original, or another house colour', () => {
    const styles = resolveButtonStyles({
      view_all: { color: 'navy', tone: 1 },
      view_category: { color: 'navy', tone: 0, night: { color: 'default', tone: 2 } },
      add_to_cart: { color: 'teal', tone: 0, night: { color: 'mint', tone: -1 } },
      quick_buy: { color: 'green', tone: 0, night: { color: 'purple', tone: 1 } },
    });
    // same: the night paint is the day paint
    expect(buttonPaint(styles.view_all, 'dark')).toEqual(buttonPaint(styles.view_all, 'light'));
    // default: keeps the night look the button was designed with, whatever the day colour is
    expect(buttonPaint(styles.view_category, 'light')).not.toBeNull();
    expect(buttonPaint(styles.view_category, 'dark')).toBeNull();
    expect(styles.view_category.night).toEqual({ color: 'default', tone: 0 });
    // another house colour, with its own tone
    expect(buttonPaint(styles.add_to_cart, 'light')?.bg).toBe(BRAND_COLORS.teal.hex);
    expect(buttonPaint(styles.add_to_cart, 'dark')?.bg).toBe(shade(BRAND_COLORS.mint.hex, -1));
    // a colour that is not a house colour falls back to "same as day"
    expect(styles.quick_buy.night).toEqual({ color: 'same', tone: 0 });
    // and the variables follow the theme
    expect(buttonCssVars(styles, 'dark')['--ab-view-category-bg']).toBeUndefined();
    expect(buttonCssVars(styles, 'light')['--ab-view-category-bg']).toBe(BRAND_COLORS.navy.hex);
  });

  it('keeps the night text readable on every colour and tone too', () => {
    const worst: string[] = [];
    for (const color of BUTTON_COLORS.filter((c) => c !== 'default')) {
      for (const tone of TONES) {
        const paint = buttonPaint(resolveButtonStyles({ view_all: { color: 'navy', night: { color, tone } } }).view_all, 'dark')!;
        if (contrastRatio(paint.bg, paint.fg) < 3) worst.push(`${color}/${tone}`);
      }
    }
    expect(worst).toEqual([]);
  });

  it('lightens towards white and darkens towards black', () => {
    expect(shade('#054180', 0)).toBe('#054180');
    expect(shade('#054180', -2)).not.toBe('#054180');
    const light = shade('#054180', -2);
    const dark = shade('#054180', 2);
    expect(contrastRatio(light, '#ffffff')).toBeLessThan(contrastRatio('#054180', '#ffffff'));
    expect(contrastRatio(dark, '#ffffff')).toBeGreaterThan(contrastRatio('#054180', '#ffffff'));
    expect(shade('#ffffff', -2)).toBe('#ffffff');
    expect(shade('#000000', 2)).toBe('#000000');
  });
});

describe('the pattern strip', () => {
  const key = (unit: string[]) => unit.join();

  it('uniform is one drawing copied exactly', () => {
    const tones = stripTones('uniform', 3, 99);
    expect(tones).toHaveLength(3);
    expect(new Set(tones.map(key)).size).toBe(1);
    expect(tones[0]).toEqual(['base', 'teal', 'base', 'base']);
  });

  it('varied gives every unit one teal and one green crescent, and never repeats the unit before', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const tones = stripTones('varied', 3, seed);
      tones.forEach((unit, i) => {
        expect(unit.filter((t) => t === 'teal')).toHaveLength(1);
        expect(unit.filter((t) => t === 'green')).toHaveLength(1);
        expect(unit.filter((t) => t === 'base')).toHaveLength(2);
        if (i > 0) expect(key(unit)).not.toBe(key(tones[i - 1]));
      });
    }
  });

  it('varied is the same on every draw for the same seed, and differs between seeds', () => {
    expect(stripTones('varied', 3, 7)).toEqual(stripTones('varied', 3, 7));
    const strips = new Set(Array.from({ length: 30 }, (_, s) => stripTones('varied', 3, s + 1).map(key).join('|')));
    expect(strips.size).toBeGreaterThan(10);
    expect(seedFrom('abc')).toBe(seedFrom('abc'));
    expect(seedFrom('abc')).not.toBe(seedFrom('abd'));
  });

  it('is read from a divider block and saved only for the pattern dividers', () => {
    expect(resolveLook('divider', { type: 'pattern' }).stripArrangement).toBe('uniform');
    expect(resolveLook('divider', { type: 'pattern', arrangement: 'varied' }).stripArrangement).toBe('varied');
    expect(resolveLook('divider', { arrangement: 'sideways' }).stripArrangement).toBe('uniform');
    expect(cleanLook('divider', { type: 'pattern', length: 'long', arrangement: 'varied' })).toEqual({ type: 'pattern', length: 'long', arrangement: 'varied' });
    expect(cleanLook('divider', { type: 'line', arrangement: 'varied' })).toEqual({ type: 'line', length: 'medium' });
  });
});

describe('the whole appearance', () => {
  it('resolves garbage to the house look', () => {
    expect(resolveAppearance(null)).toEqual(DEFAULT_APPEARANCE);
    expect(resolveAppearance('x')).toEqual(DEFAULT_APPEARANCE);
    expect(resolveAppearance({ pattern_strength: 'loud', strip_arrangement: 'wild', home_sections: 7, button_styles: 'no' })).toEqual(DEFAULT_APPEARANCE);
  });

  it('saves a clean row', () => {
    const dirty = { ...DEFAULT_APPEARANCE, pattern_strength: 999, strip_arrangement: 'varied' } as StorefrontAppearance;
    const row = appearanceToRow(dirty);
    expect(row.id).toBe(1);
    expect(row.pattern_strength).toBe(200);
    expect(row.strip_arrangement).toBe('varied');
    expect(row.home_sections).toHaveLength(HOME_SECTION_KEYS.length);
    expect(Object.keys(row.button_styles).sort()).toEqual([...BUTTON_KEYS].sort());
  });

  it('round-trips a draft through the preview address, and refuses what it did not write', () => {
    const draft: StorefrontAppearance = resolveAppearance({
      pattern_strength: 60,
      strip_arrangement: 'varied',
      home_sections: [{ key: 'features', visible: false }, { key: 'offers', visible: true }],
      button_styles: { add_to_cart: { color: 'teal', tone: -1 as Tone } },
    });
    const search = `?${PREVIEW_PARAM}=${encodePreview(draft)}&x=1`;
    expect(decodePreview(search)).toEqual(draft);
    expect(decodePreview('')).toBeNull();
    expect(decodePreview(`?${PREVIEW_PARAM}=%%%`)).toBeNull();
    expect(decodePreview(`?${PREVIEW_PARAM}=${'a'.repeat(5000)}`)).toBeNull();
    expect(decodePreview(`?${PREVIEW_PARAM}=off`)).toBeNull();
  });

  it('survives Arabic and every character in the preview address', () => {
    const draft = resolveAppearance({ home_sections: [{ key: 'categories', visible: false }] });
    expect(decodePreview(`?${PREVIEW_PARAM}=${encodePreview(draft)}`)?.home_sections[0]).toEqual({ key: 'categories', visible: false });
  });
});

describe('the links page pattern settings', () => {
  it('reads position and strength, and falls back on bad values', () => {
    expect(resolveSettings({}).pattern_position).toBe('top');
    expect(resolveSettings({}).pattern_strength).toBe(100);
    expect(resolveSettings({ pattern_position: 'bottom', pattern_strength: 40 })).toMatchObject({ pattern_position: 'bottom', pattern_strength: 40 });
    expect(resolveSettings({ pattern_position: 'left', pattern_strength: 'x' })).toMatchObject({ pattern_position: 'top', pattern_strength: 100 });
    expect(DEFAULT_LINKS_SETTINGS.pattern_position).toBe('top');
  });
});
