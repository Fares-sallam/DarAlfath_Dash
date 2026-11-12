import { describe, expect, it } from 'vitest';
import { channelPrice } from './saleChannel';

describe('channelPrice', () => {
  const book = { base_price: 100, sale_price: 80 };
  it('a discount for both channels shows everywhere', () => {
    expect(channelPrice({ ...book, sale_channel: 'all' }, 'web')).toBe(80);
    expect(channelPrice({ ...book, sale_channel: 'all' }, 'app')).toBe(80);
    expect(channelPrice(book, 'app')).toBe(80); // no channel saved = both
  });
  it('an app-only discount: the website sells at the old price', () => {
    expect(channelPrice({ ...book, sale_channel: 'app' }, 'app')).toBe(80);
    expect(channelPrice({ ...book, sale_channel: 'app' }, 'web')).toBe(100);
  });
  it('a website-only discount: the app sells at the old price', () => {
    expect(channelPrice({ ...book, sale_channel: 'web' }, 'web')).toBe(80);
    expect(channelPrice({ ...book, sale_channel: 'web' }, 'app')).toBe(100);
  });
  it('no discount (or odd data) never makes the other channel cheaper', () => {
    expect(channelPrice({ base_price: 100, sale_price: 100, sale_channel: 'app' }, 'web')).toBe(100);
    expect(channelPrice({ base_price: 90, sale_price: 100, sale_channel: 'app' }, 'web')).toBe(100);
    expect(channelPrice({ base_price: null, sale_price: 70, sale_channel: 'web' }, 'app')).toBe(70);
  });
});
