import { describe, expect, it } from 'vitest';
import { currentOffer, offerFormError, offerState, type ShippingOffer } from './shippingOffers';

const now = new Date('2026-11-12T12:00:00Z');
const o = (over: Partial<ShippingOffer>): ShippingOffer => ({
  id: Math.random().toString(36).slice(2), title: 'شحن مجاني', min_subtotal: 500, channel: 'all',
  starts_at: null, ends_at: null, is_active: true, ...over,
});

describe('offerState', () => {
  it('reads on/off and the dates', () => {
    expect(offerState(o({}), now)).toBe('live');
    expect(offerState(o({ is_active: false }), now)).toBe('off');
    expect(offerState(o({ starts_at: '2026-11-13T00:00:00Z' }), now)).toBe('scheduled');
    expect(offerState(o({ ends_at: '2026-11-12T11:00:00Z' }), now)).toBe('ended');
  });
});

describe('currentOffer', () => {
  it('lowest live minimum for the channel wins; other channels, ended, scheduled and off ones do not count', () => {
    const offers = [
      o({ id: 'both', min_subtotal: 503 }),
      o({ id: 'app', min_subtotal: 300, channel: 'app' }),
      o({ id: 'web-ended', min_subtotal: 100, channel: 'web', ends_at: '2026-11-11T00:00:00Z' }),
      o({ id: 'web-later', min_subtotal: 50, channel: 'web', starts_at: '2026-12-01T00:00:00Z' }),
      o({ id: 'off', min_subtotal: 10, is_active: false }),
    ];
    expect(currentOffer(offers, 'web', now)?.id).toBe('both');
    expect(currentOffer(offers, 'app', now)?.id).toBe('app');
    expect(currentOffer([], 'web', now)).toBeNull();
  });
});

describe('offerFormError', () => {
  it('needs a minimum and dates in order', () => {
    expect(offerFormError({ min_subtotal: '', starts_at: null, ends_at: null })).not.toBeNull();
    expect(offerFormError({ min_subtotal: '-5', starts_at: null, ends_at: null })).not.toBeNull();
    expect(offerFormError({ min_subtotal: '500', starts_at: '2026-11-20T00:00:00Z', ends_at: '2026-11-10T00:00:00Z' })).not.toBeNull();
    expect(offerFormError({ min_subtotal: '0', starts_at: null, ends_at: null })).toBeNull();
  });
});
