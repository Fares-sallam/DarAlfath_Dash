/**
 * Where a coupon works: the website, the mobile app (iPhone and Android alike), or both. The shop's
 * order and coupon functions enforce it, so what is saved here is what a customer can really use.
 */
export type CouponChannel = 'all' | 'web' | 'app';

export const COUPON_CHANNELS: CouponChannel[] = ['all', 'web', 'app'];

export const COUPON_CHANNEL_LABELS: Record<CouponChannel, string> = {
  all: 'الموقع والتطبيق',
  web: 'الموقع فقط',
  app: 'التطبيق فقط',
};

/** What a coupon's channel means for the customer, shown under the choice when it is made. */
export const COUPON_CHANNEL_HINTS: Record<CouponChannel, string> = {
  all: 'يعمل في الموقع وفي تطبيق آيفون وأندرويد.',
  web: 'يعمل في الموقع فقط. لو كتبه عميل في التطبيق يظهر له إنه خاص بالموقع.',
  app: 'يعمل في تطبيق آيفون وأندرويد فقط. لو كتبه عميل في الموقع يظهر له إنه خاص بالتطبيق.',
};

/** A row read before the column existed (or by older code) counts as both. */
export const couponChannel = (c: { channel?: string | null }): CouponChannel =>
  c.channel === 'web' || c.channel === 'app' ? c.channel : 'all';
