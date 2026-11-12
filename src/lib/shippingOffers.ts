/* Free-shipping offers (table shipping_offers): the same rules the database function
   current_free_shipping(channel) applies, so the dashboard can say what each channel gets now. */

export type OfferChannel = 'all' | 'web' | 'app';

export interface ShippingOffer {
  id: string;
  title: string;
  min_subtotal: number;
  channel: OfferChannel;
  starts_at: string | null;
  ends_at: string | null;
  is_active: boolean;
  created_at?: string;
}

export const CHANNEL_LABELS: Record<OfferChannel, string> = {
  all: 'الموقع والتطبيق',
  web: 'الموقع فقط',
  app: 'التطبيق فقط',
};

export type OfferState = 'live' | 'scheduled' | 'ended' | 'off';

export function offerState(o: Pick<ShippingOffer, 'is_active' | 'starts_at' | 'ends_at'>, now = new Date()): OfferState {
  if (!o.is_active) return 'off';
  if (o.starts_at && new Date(o.starts_at) > now) return 'scheduled';
  if (o.ends_at && new Date(o.ends_at) <= now) return 'ended';
  return 'live';
}

/** The offer a channel gets right now: the live one with the lowest minimum (null = none). */
export function currentOffer(offers: ShippingOffer[], channel: 'web' | 'app', now = new Date()): ShippingOffer | null {
  return offers
    .filter((o) => (o.channel === 'all' || o.channel === channel) && offerState(o, now) === 'live')
    .sort((a, b) => Number(a.min_subtotal) - Number(b.min_subtotal)
      || (a.ends_at ? new Date(a.ends_at).getTime() : Infinity) - (b.ends_at ? new Date(b.ends_at).getTime() : Infinity))[0] ?? null;
}

/** Why an offer can't be saved as typed (null when it can). */
export function offerFormError(input: { min_subtotal: string; starts_at: string | null; ends_at: string | null }): string | null {
  const min = Number(input.min_subtotal);
  if (input.min_subtotal.trim() === '' || !Number.isFinite(min) || min < 0) return 'اكتب أقل مبلغ للطلب (رقم 0 أو أكبر).';
  if (input.starts_at && input.ends_at && new Date(input.ends_at) <= new Date(input.starts_at)) return 'تاريخ النهاية لازم يكون بعد تاريخ البداية.';
  return null;
}
