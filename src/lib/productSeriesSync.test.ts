import { describe, expect, it } from 'vitest';
import { syncProductSeries } from './productSeriesSync';

// A fake Supabase client: it records every call and answers reads from an in-memory product_series table.
type Row = { product_id: string; series_id: string; sort_order: number };

function fakeClient(rows: Row[]) {
  const calls: { op: string; detail: unknown }[] = [];

  const client = {
    from(table: string) {
      if (table !== 'product_series') throw new Error(`unexpected table ${table}`);
      const filters: Record<string, unknown> = {};
      let mode: 'select' | 'delete' | 'insert' = 'select';
      let cols = '';
      let insertRows: Row[] = [];

      const api: any = {
        select(c: string) { mode = 'select'; cols = c; return api; },
        delete() { mode = 'delete'; return api; },
        insert(r: Row[]) { mode = 'insert'; insertRows = r; return api; },
        eq(col: string, val: unknown) { filters[col] = val; return api; },
        in(col: string, vals: unknown[]) { filters[`${col}:in`] = vals; return api; },
        order() { return api; },
        limit() { return api; },
        then(resolve: (v: { data: unknown; error: null }) => void) {
          if (mode === 'insert') {
            calls.push({ op: 'insert', detail: insertRows });
            rows.push(...insertRows);
            return Promise.resolve({ data: null, error: null }).then(resolve);
          }
          if (mode === 'delete') {
            calls.push({ op: 'delete', detail: { ...filters } });
            const ids = (filters['series_id:in'] as string[]) ?? [];
            for (let i = rows.length - 1; i >= 0; i--) {
              if (rows[i].product_id === filters['product_id'] && ids.includes(rows[i].series_id)) rows.splice(i, 1);
            }
            return Promise.resolve({ data: null, error: null }).then(resolve);
          }
          const matched = rows.filter((r) => Object.entries(filters).every(([k, v]) => k.endsWith(':in') || (r as any)[k] === v));
          const data = cols === 'series_id'
            ? matched.map((r) => ({ series_id: r.series_id }))
            : [...matched].sort((a, b) => b.sort_order - a.sort_order).slice(0, 1).map((r) => ({ sort_order: r.sort_order }));
          calls.push({ op: 'select', detail: { cols, ...filters } });
          return Promise.resolve({ data, error: null }).then(resolve);
        },
      };
      return api;
    },
  };
  return { client: client as any, calls };
}

describe('syncProductSeries', () => {
  it('keeps the position of a series the book stays in, and only adds the new one at the end', async () => {
    const rows: Row[] = [
      { product_id: 'p1', series_id: 's1', sort_order: 4 },
      { product_id: 'p2', series_id: 's2', sort_order: 0 },
      { product_id: 'p3', series_id: 's2', sort_order: 1 },
    ];
    const { client, calls } = fakeClient(rows);

    await syncProductSeries(client, 'p1', ['s1', 's2'], true);

    expect(rows.find((r) => r.product_id === 'p1' && r.series_id === 's1')!.sort_order).toBe(4); // not reset
    expect(rows.find((r) => r.product_id === 'p1' && r.series_id === 's2')!.sort_order).toBe(2); // after p2 (0) and p3 (1)
    expect(calls.some((c) => c.op === 'delete')).toBe(false); // nothing was deleted
  });

  it('removes only the series that were dropped', async () => {
    const rows: Row[] = [
      { product_id: 'p1', series_id: 's1', sort_order: 3 },
      { product_id: 'p1', series_id: 's2', sort_order: 7 },
    ];
    const { client } = fakeClient(rows);

    await syncProductSeries(client, 'p1', ['s2'], true);

    expect(rows).toEqual([{ product_id: 'p1', series_id: 's2', sort_order: 7 }]);
  });

  it('does not touch anything when the series did not change', async () => {
    const rows: Row[] = [{ product_id: 'p1', series_id: 's1', sort_order: 9 }];
    const { client, calls } = fakeClient(rows);

    await syncProductSeries(client, 'p1', ['s1'], true);

    expect(rows).toEqual([{ product_id: 'p1', series_id: 's1', sort_order: 9 }]);
    expect(calls.map((c) => c.op)).toEqual(['select']);
  });

  it('a new book (not an edit) is added at the end of an empty series as 0', async () => {
    const rows: Row[] = [];
    const { client } = fakeClient(rows);

    await syncProductSeries(client, 'p9', ['s1'], false);

    expect(rows).toEqual([{ product_id: 'p9', series_id: 's1', sort_order: 0 }]);
  });

  it('a book with no series wanted removes all its links', async () => {
    const rows: Row[] = [{ product_id: 'p1', series_id: 's1', sort_order: 0 }, { product_id: 'p2', series_id: 's1', sort_order: 1 }];
    const { client } = fakeClient(rows);

    await syncProductSeries(client, 'p1', [], true);

    expect(rows).toEqual([{ product_id: 'p2', series_id: 's1', sort_order: 1 }]);
  });
});
