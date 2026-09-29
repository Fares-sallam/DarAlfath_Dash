import type { Product } from '@/hooks/useBooks';
import { ALL } from './listFilters';

export { ALL };
/** Any book with a digital copy — «رقمي» plus «ورقي ورقمي». */
export const ANY_DIGITAL = 'رقمية';
export const BUNDLES = 'مجموعة';
export const HIDDEN = 'مخفي';

type FilterableBook = Pick<Product, 'type' | 'is_active' | 'is_bundle'>;

/** The books-list «النوع» filter. A bundle is its own kind, whatever its `type` says. */
export function bookMatchesType(p: FilterableBook, filterType: string): boolean {
  if (filterType === ALL) return true;
  if (filterType === BUNDLES) return !!p.is_bundle;
  if (filterType === ANY_DIGITAL) return p.type !== 'ورقي';
  return p.type === filterType;
}

/** The books-list «الحالة» filter: «نشط» or, for anything else, hidden. */
export function bookMatchesStatus(p: FilterableBook, filterActive: string): boolean {
  if (filterActive === ALL) return true;
  return filterActive === 'نشط' ? p.is_active : !p.is_active;
}

export interface BookStatCard {
  key: 'all' | 'active' | 'hidden' | 'digital';
  label: string;
  /** The filter values this card applies when clicked. */
  type: string;
  status: string;
}

/** The four counters above the books list — each is also a shortcut to its filter. */
export const BOOK_STAT_CARDS: BookStatCard[] = [
  { key: 'all', label: 'إجمالي الكتب', type: ALL, status: ALL },
  { key: 'active', label: 'نشط', type: ALL, status: 'نشط' },
  { key: 'hidden', label: 'غير نشط', type: ALL, status: HIDDEN },
  { key: 'digital', label: 'كتب رقمية', type: ANY_DIGITAL, status: ALL },
];

/** Counted with the very same matchers the list uses, so a card's number is exactly the rows its click shows. */
export const countForCard = (books: FilterableBook[], card: BookStatCard) =>
  books.filter((p) => bookMatchesType(p, card.type) && bookMatchesStatus(p, card.status)).length;

/** Filter values after clicking a card: a second click on the same card goes back to everything. */
export function applyStatCard(
  card: BookStatCard,
  current: { type: string; status: string }
): { type: string; status: string } {
  const isOn = current.type === card.type && current.status === card.status;
  return isOn ? { type: ALL, status: ALL } : { type: card.type, status: card.status };
}

/** A human label for the report header, e.g. «النوع: له نسخة رقمية». */
export const typeFilterLabel = (filterType: string) => (filterType === ANY_DIGITAL ? 'له نسخة رقمية' : filterType);
