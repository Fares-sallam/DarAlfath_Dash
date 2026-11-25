import { describe, expect, it } from 'vitest';
import { DEFAULT_STOCK_VISIBILITY, mergeStockVisibility, resolveStockVisibility, stockVisibilityChanged } from './stockVisibility';

describe('resolveStockVisibility', () => {
  it('only an explicit false hides the count', () => {
    expect(resolveStockVisibility({ web: false, app: true })).toEqual({ web: false, app: true });
    expect(resolveStockVisibility({ web: true, app: false })).toEqual({ web: true, app: false });
    expect(resolveStockVisibility({ web: false, app: false })).toEqual({ web: false, app: false });
  });
  it('anything missing or odd keeps it shown', () => {
    for (const odd of [undefined, null, 5, 'no', [], {}, { web: 'no' }, { web: 0, app: null }, { app: undefined }]) {
      expect(resolveStockVisibility(odd)).toEqual(DEFAULT_STOCK_VISIBILITY);
    }
  });
});

describe('changes', () => {
  it('knows whether the draft differs from the saved value', () => {
    expect(stockVisibilityChanged({ web: true, app: true }, { web: true, app: true })).toBe(false);
    expect(stockVisibilityChanged({ web: true, app: true }, { web: false, app: true })).toBe(true);
    expect(stockVisibilityChanged({ web: true, app: false }, { web: true, app: true })).toBe(true);
  });
  it('saving writes only the switches that were changed on top of what is in the database now', () => {
    // loaded both shown; the owner turned the website off; meanwhile the app's switch was turned off from the app
    expect(mergeStockVisibility({ web: true, app: false }, { web: true, app: true }, { web: false, app: true })).toEqual({ web: false, app: false });
    // nothing changed by the owner: what is there is kept as it is
    expect(mergeStockVisibility({ web: false, app: true }, { web: true, app: true }, { web: true, app: true })).toEqual({ web: false, app: true });
    // both changed: both are the owner's
    expect(mergeStockVisibility({ web: true, app: true }, { web: true, app: true }, { web: false, app: false })).toEqual({ web: false, app: false });
  });
});
