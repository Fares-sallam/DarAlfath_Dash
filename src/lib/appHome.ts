/* The app's own strips (table app_home_settings, one row with id = 1): the free-shipping bar at the bottom of the
   cart and the sections of the app's home screen. The app reads this row and falls back to "everything on, default
   wording" when it is missing, so these defaults are exactly what the app does before anything is saved. */

export interface AppHomeSettings {
  brand_name_ar: string | null;
  brand_name_en: string | null;
  free_shipping_bar_enabled: boolean;
  free_shipping_progress_text: string | null;
  free_shipping_done_text: string | null;
  show_store_departments: boolean;
  store_departments_title: string | null;
  show_new_arrivals: boolean;
  show_offers: boolean;
  show_ebook_library: boolean;
}

export const DEFAULT_APP_HOME_SETTINGS: AppHomeSettings = {
  brand_name_ar: null,
  brand_name_en: null,
  free_shipping_bar_enabled: true,
  free_shipping_progress_text: null,
  free_shipping_done_text: null,
  show_store_departments: true,
  store_departments_title: null,
  show_new_arrivals: true,
  show_offers: true,
  show_ebook_library: true,
};

/** The app's own wording (what it shows when a text is left empty). */
export const DEFAULT_PROGRESS_TEXT = 'اطلب بـ {threshold} ج.م أو أكثر واحصل على شحن مجاني';
export const DEFAULT_DONE_TEXT = 'مبروك! طلبك يشمل شحنًا مجانيًا';
export const DEFAULT_DEPARTMENTS_TITLE = 'أقسام المتجر';
export const DEFAULT_BRAND_NAME_AR = 'دار الفتح للنشر والتوزيع';
export const DEFAULT_BRAND_NAME_EN = 'Dar Al-Fath Publishing & Distribution';
export const MAX_BRAND_NAME_LENGTH = 60;

/** The longest wording the app takes (it cuts anything longer). */
export const MAX_TEXT_LENGTH = 200;

/** The words the app fills in inside the free-shipping wording. */
export const PLACEHOLDERS = [
  { token: '{added}', label: 'اللي في السلة' },
  { token: '{remaining}', label: 'الباقي' },
  { token: '{threshold}', label: 'أقل مبلغ للشحن المجاني' },
] as const;

/** One typed wording as it is stored: trimmed, at most MAX_TEXT_LENGTH, empty = null (the app's default). */
export function cleanText(value: string): string | null {
  const s = value.trim().slice(0, MAX_TEXT_LENGTH);
  return s.length > 0 ? s : null;
}

export function cleanBrandName(value: string): string | null {
  const name = value.replace(/[\r\n]+/g, ' ').trim().slice(0, MAX_BRAND_NAME_LENGTH);
  return name || null;
}

/** The {words} in a wording that the app does not know (a typo would show up as written, braces and all). */
export function unknownPlaceholders(text: string): string[] {
  const known = new Set<string>(PLACEHOLDERS.map((p) => p.token));
  const found = text.match(/\{[^{}\s]*\}/g) ?? [];
  return Array.from(new Set(found.filter((token) => !known.has(token))));
}

/** The same filling-in the app does, so the preview shows what a customer will read. */
export function fillTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => (key in values ? values[key] : whole));
}

/** A row from the database (or nothing) as settings, with the defaults filling any gap. Only an explicit false switches off. */
export function toSettings(row: Partial<AppHomeSettings> | null | undefined): AppHomeSettings {
  if (!row) return { ...DEFAULT_APP_HOME_SETTINGS };
  const on = (v: unknown) => v !== false;
  return {
    brand_name_ar: row.brand_name_ar ?? null,
    brand_name_en: row.brand_name_en ?? null,
    free_shipping_bar_enabled: on(row.free_shipping_bar_enabled),
    free_shipping_progress_text: row.free_shipping_progress_text ?? null,
    free_shipping_done_text: row.free_shipping_done_text ?? null,
    show_store_departments: on(row.show_store_departments),
    store_departments_title: row.store_departments_title ?? null,
    show_new_arrivals: on(row.show_new_arrivals),
    show_offers: on(row.show_offers),
    show_ebook_library: on(row.show_ebook_library),
  };
}

/** True when the two sets of settings would look the same in the app. */
export function sameSettings(a: AppHomeSettings, b: AppHomeSettings): boolean {
  return (Object.keys(DEFAULT_APP_HOME_SETTINGS) as (keyof AppHomeSettings)[]).every((k) => (a[k] ?? null) === (b[k] ?? null));
}

/** Where a cart stands against the offer — the same numbers the app's bar shows (see the app's services/freeShipping.ts). */
export function cartProgress(threshold: number, added: number) {
  const reached = added >= threshold;
  return {
    reached,
    // Two places: 503 - 320.1 is 182.89999999999998 in floating point.
    remaining: reached ? 0 : Math.round((threshold - added) * 100) / 100,
    fraction: reached ? 1 : Math.min(1, Math.max(0, added / threshold)),
  };
}

/** An amount without a pointless ".00" or float noise. */
export function formatAmount(n: number): string {
  return String(Math.round(n * 100) / 100);
}
