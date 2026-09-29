import { describe, expect, it } from 'vitest';
import {
  ALL,
  BOOK_STAT_CARDS,
  applyStatCard,
  bookMatchesStatus,
  bookMatchesType,
  countForCard,
  typeFilterLabel,
} from './bookFilters';

type B = Parameters<typeof bookMatchesType>[0];
const books: B[] = [
  { type: 'ورقي', is_active: true },
  { type: 'ورقي', is_active: true },
  { type: 'رقمي', is_active: true },
  { type: 'ورقي ورقمي', is_active: false },
  { type: 'ورقي', is_active: false, is_bundle: true },
];
const card = (key: string) => BOOK_STAT_CARDS.find((c) => c.key === key)!;

describe('bookMatchesType', () => {
  it('matches a single kind, «any digital» (digital + paper-and-digital), and bundles', () => {
    expect(books.filter((b) => bookMatchesType(b, ALL))).toHaveLength(5);
    expect(books.filter((b) => bookMatchesType(b, 'رقمي'))).toHaveLength(1);
    expect(books.filter((b) => bookMatchesType(b, 'رقمية'))).toHaveLength(2);
    expect(books.filter((b) => bookMatchesType(b, 'مجموعة'))).toHaveLength(1);
  });
});

describe('bookMatchesStatus', () => {
  it('splits active from hidden', () => {
    expect(books.filter((b) => bookMatchesStatus(b, 'نشط'))).toHaveLength(3);
    expect(books.filter((b) => bookMatchesStatus(b, 'مخفي'))).toHaveLength(2);
    expect(books.filter((b) => bookMatchesStatus(b, ALL))).toHaveLength(5);
  });
});

describe('stat cards', () => {
  it('each card counts exactly the rows the list shows after clicking it', () => {
    for (const c of BOOK_STAT_CARDS) {
      const shown = books.filter((b) => bookMatchesType(b, c.type) && bookMatchesStatus(b, c.status));
      expect(countForCard(books, c)).toBe(shown.length);
    }
    expect(BOOK_STAT_CARDS.map((c) => countForCard(books, c))).toEqual([5, 3, 2, 2]);
  });

  it('a click sets the card’s own filters and drops the other card’s', () => {
    expect(applyStatCard(card('active'), { type: 'رقمية', status: ALL })).toEqual({ type: ALL, status: 'نشط' });
    expect(applyStatCard(card('digital'), { type: ALL, status: 'نشط' })).toEqual({ type: 'رقمية', status: ALL });
    expect(applyStatCard(card('hidden'), { type: ALL, status: ALL })).toEqual({ type: ALL, status: 'مخفي' });
  });

  it('clicking the selected card again clears it, and «إجمالي» always means everything', () => {
    expect(applyStatCard(card('hidden'), { type: ALL, status: 'مخفي' })).toEqual({ type: ALL, status: ALL });
    expect(applyStatCard(card('all'), { type: 'رقمي', status: 'نشط' })).toEqual({ type: ALL, status: ALL });
  });
});

describe('typeFilterLabel', () => {
  it('spells out the digital shortcut for the report header and leaves other kinds alone', () => {
    expect(typeFilterLabel('رقمية')).toBe('له نسخة رقمية');
    expect(typeFilterLabel('ورقي')).toBe('ورقي');
  });
});
