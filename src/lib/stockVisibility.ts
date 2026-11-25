// Whether customers see the NUMBER of copies available, as set in «إدارة المخزون»: one switch for the website and one for the app.
// Stored in storefront_appearance.show_stock_count as {"web": bool, "app": bool}; only an explicit false hides the count (anything
// missing or odd keeps it shown, as it has always been). The website and the app read the same value (the app's inventory screen
// writes it too). Pure helpers: no network, no React.

export interface StockVisibility {
  web: boolean;
  app: boolean;
}

export const DEFAULT_STOCK_VISIBILITY: StockVisibility = { web: true, app: true };

/** The column of storefront_appearance (row id = 1) that holds it. */
export const STOCK_VISIBILITY_COLUMN = 'show_stock_count';

export function resolveStockVisibility(raw: unknown): StockVisibility {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return { web: r.web !== false, app: r.app !== false };
}

export function stockVisibilityChanged(saved: StockVisibility, draft: StockVisibility): boolean {
  return saved.web !== draft.web || saved.app !== draft.app;
}

/**
 * What to write when saving: only the switches the owner changed (draft against what was loaded) replace the value that is in the
 * database right now, so a switch someone else flipped in the meantime (the app's inventory screen writes the same column) is not
 * overwritten by a stale copy of it.
 */
export function mergeStockVisibility(latest: StockVisibility, loaded: StockVisibility, draft: StockVisibility): StockVisibility {
  return {
    web: draft.web !== loaded.web ? draft.web : latest.web,
    app: draft.app !== loaded.app ? draft.app : latest.app,
  };
}

export const STOCK_VISIBILITY_LABELS = {
  web: { shown: 'الرقم ظاهر («متوفر 12 نسخة»)', hidden: 'الرقم مخفي (بيظهر «متوفر» أو «نافد»)' },
  app: { shown: 'الرقم ظاهر («12 نسخة»)', hidden: 'الرقم مخفي (بيظهر «متوفر» أو «نافد»)' },
} as const;
