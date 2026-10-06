/**
 * The store product id of a digital book — what the mobile app asks Google
 * Play / the App Store about. It's stored per digital copy in
 * product_variants.iap_product_id (partial UNIQUE index: no two copies share
 * one) and has to match the id registered in Play Console / App Store Connect
 * exactly. Empty = the app doesn't offer in-app purchase for that copy.
 */

export const IAP_PRODUCT_ID_PATTERN = /^[A-Za-z0-9._-]+$/;
export const IAP_PRODUCT_ID_MAX_LENGTH = 255;

export const IAP_DUPLICATE_MESSAGE = 'هذا المعرّف مستخدم بالفعل في كتاب آخر';

/** What gets stored: trimmed, and null when empty or when the copy isn't digital. */
export function normalizeIapProductId(value: string | null | undefined, isDigital: boolean): string | null {
  if (!isDigital) return null;
  const trimmed = (value ?? '').trim();
  return trimmed === '' ? null : trimmed;
}

/** The Arabic message for an invalid id, or null when it's fine (or empty). */
export function iapProductIdError(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim();
  if (trimmed === '') return null;
  if (trimmed.length > IAP_PRODUCT_ID_MAX_LENGTH) return `المعرّف أطول من ${IAP_PRODUCT_ID_MAX_LENGTH} حرف`;
  if (!IAP_PRODUCT_ID_PATTERN.test(trimmed)) {
    return 'المعرّف لازم يكون حروف إنجليزية وأرقام ونقطة وشرطة وشرطة سفلية بس، من غير مسافات';
  }
  return null;
}

/** True when a Postgres error is the unique-index violation on iap_product_id. */
export function isIapDuplicateError(error: { code?: string; message?: string; details?: string } | null | undefined): boolean {
  if (!error || error.code !== '23505') return false;
  return /iap_product_id/.test(`${error.message ?? ''} ${error.details ?? ''}`);
}
