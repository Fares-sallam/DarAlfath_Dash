/* The promo panel on the app's home screen, under the big banner (tables home_promo_cards and home_promo_settings).
   Pure rules only: what a card's link can be, how a link is built and read back, what is wrong with a card, and the
   matching page in the store for the "quick navigation" button. The app follows ONLY links that are routes inside
   the app (it drops anything else on purpose: a link out to the store would send an iPhone user to a page that sells
   e-books through another payment gateway, which App Review treats as steering). */

export interface PromoCard {
  id: string;
  title: string;
  subtitle: string | null;
  button_label: string | null;
  link_url: string | null;
  image_url: string | null;
  image_url_dark: string | null;
  sort_order: number;
  is_active: boolean;
}

export interface PromoSettings {
  rotate_seconds: number;
  sync_with_banner: boolean;
}

export const DEFAULT_PROMO_SETTINGS: PromoSettings = { rotate_seconds: 5, sync_with_banner: false };
export const MIN_ROTATE_SECONDS = 2;
export const MAX_ROTATE_SECONDS = 60;

export const MAX_TITLE = 80;
export const MAX_SUBTITLE = 160;
export const MAX_BUTTON = 24;

/** Screens of the app a card can open, and the page of the store that shows the same thing (for quick navigation). */
export interface StaticDestination { path: string; label: string; site: string | null }
export const STATIC_DESTINATIONS: StaticDestination[] = [
  { path: '/', label: 'الرئيسية', site: '/' },
  { path: '/search', label: 'كل الكتب (البحث)', site: '/books' },
  { path: '/search?sort=newest', label: 'وصل حديثًا', site: '/books?sort=newest' },
  { path: '/ebooks', label: 'المكتبة الإلكترونية', site: null },
  { path: '/cart', label: 'السلة', site: '/cart' },
  { path: '/wishlist', label: 'المفضلة', site: '/wishlist' },
  { path: '/orders', label: 'طلباتي', site: '/account/orders' },
  { path: '/contact', label: 'تواصل معنا', site: '/contact' },
];

export type ParsedLink =
  | { kind: 'none' }
  | { kind: 'static'; path: string }
  | { kind: 'category'; name: string }
  | { kind: 'series'; id: string; title: string }
  | { kind: 'book'; id: string }
  | { kind: 'custom'; path: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A link the app will follow: a route inside it ("/book/…"), never an address outside it, never "//host". */
export function isInternalLink(link: string | null | undefined): boolean {
  const s = (link ?? '').trim();
  return s.startsWith('/') && !s.startsWith('//');
}

export const categoryLink = (name: string) => `/search?category=${encodeURIComponent(name)}`;
export const seriesLink = (id: string, title: string) => `/search?series=${encodeURIComponent(id)}&title=${encodeURIComponent(title)}`;
export const bookLink = (id: string) => `/book/${encodeURIComponent(id)}`;

/** What a stored link points at, so the editor can show it as a choice instead of raw text. */
export function parseLink(link: string | null | undefined): ParsedLink {
  const s = (link ?? '').trim();
  if (!s) return { kind: 'none' };
  const staticHit = STATIC_DESTINATIONS.find((d) => d.path === s);
  if (staticHit) return { kind: 'static', path: staticHit.path };

  const book = /^\/book\/([^/?#]+)$/.exec(s);
  if (book) return { kind: 'book', id: decodeURIComponent(book[1]) };

  const queryAt = s.indexOf('?');
  if (s.startsWith('/search') && queryAt === '/search'.length) {
    const params = new URLSearchParams(s.slice(queryAt + 1));
    const keys = Array.from(params.keys());
    if (keys.length === 1 && keys[0] === 'category' && params.get('category')) {
      return { kind: 'category', name: params.get('category') as string };
    }
    if (keys.every((k) => k === 'series' || k === 'title') && params.get('series')) {
      return { kind: 'series', id: params.get('series') as string, title: params.get('title') ?? '' };
    }
  }
  return { kind: 'custom', path: s };
}

/** One thing wrong with a card. `blocking` ones stop it being saved; the others are warnings (a draft can still be saved). */
export interface CardProblem { text: string; blocking: boolean }

/** Everything that is wrong with a card as typed (empty = nothing to say). Messages are for the admin. */
export function cardProblems(card: Pick<PromoCard, 'title' | 'subtitle' | 'button_label' | 'link_url' | 'image_url' | 'image_url_dark'>): CardProblem[] {
  const problems: CardProblem[] = [];
  const title = card.title.trim();
  const hasImage = !!(card.image_url || card.image_url_dark);
  if (!title && !hasImage) problems.push({ blocking: false, text: 'اكتب عنوان أو ارفع صورة، وإلا الكارت مش هيظهر في التطبيق.' });
  if (title.length > MAX_TITLE) problems.push({ blocking: true, text: `العنوان أطول من ${MAX_TITLE} حرف.` });
  if ((card.subtitle ?? '').length > MAX_SUBTITLE) problems.push({ blocking: true, text: `النص أطول من ${MAX_SUBTITLE} حرف.` });
  if ((card.button_label ?? '').trim().length > MAX_BUTTON) problems.push({ blocking: true, text: `اسم الزر أطول من ${MAX_BUTTON} حرف.` });
  const link = (card.link_url ?? '').trim();
  if (link && !isInternalLink(link)) {
    problems.push({ blocking: true, text: 'الرابط لازم يكون صفحة جوه التطبيق (يبدأ بـ / ) مش رابط خارجي، والتطبيق بيتجاهل أي رابط خارجي.' });
  }
  if ((card.button_label ?? '').trim() && !link) problems.push({ blocking: false, text: 'الزر من غير وجهة مش هيفتح حاجة. اختار له وجهة.' });
  return problems;
}

/** Why the rotation settings cannot be saved as typed (null when they can). */
export function settingsProblem(seconds: number): string | null {
  if (!Number.isInteger(seconds) || seconds < MIN_ROTATE_SECONDS || seconds > MAX_ROTATE_SECONDS) {
    return `عدد الثواني لازم يكون رقم صحيح من ${MIN_ROTATE_SECONDS} لـ ${MAX_ROTATE_SECONDS}.`;
  }
  return null;
}

/**
 * The page of the store that shows what a link opens, for "open in the store" (null when the store has no such
 * page, e.g. the e-book library). `lookup` finds the store's ids: it filters by category ID, the app by name.
 */
export function storePath(link: string | null | undefined, lookup: { categoryIdByName?: (name: string) => string | undefined } = {}): string | null {
  const parsed = parseLink(link);
  switch (parsed.kind) {
    case 'static': return STATIC_DESTINATIONS.find((d) => d.path === parsed.path)?.site ?? null;
    case 'book': return `/book/${encodeURIComponent(parsed.id)}`;
    case 'series': return `/books?series=${encodeURIComponent(parsed.id)}`;
    case 'category': {
      const id = lookup.categoryIdByName?.(parsed.name);
      return id ? `/books?category=${encodeURIComponent(id)}` : null;
    }
    default: return null;
  }
}

/** The link as a readable Arabic line for the admin ("كتاب …", "تصنيف …"). */
export function describeLink(link: string | null | undefined, names: { book?: string; series?: string } = {}): string {
  const parsed = parseLink(link);
  switch (parsed.kind) {
    case 'none': return 'من غير وجهة';
    case 'static': return STATIC_DESTINATIONS.find((d) => d.path === parsed.path)?.label ?? parsed.path;
    case 'category': return `تصنيف «${parsed.name}»`;
    case 'series': return `سلسلة «${names.series ?? parsed.title}»`;
    case 'book': return `كتاب ${names.book ? `«${names.book}»` : parsed.id.slice(0, 8)}`;
    case 'custom': return parsed.path;
  }
}

/** True when a string looks like a record id, so the book chooser can say "not found" rather than show a bare id. */
export const looksLikeId = (s: string) => UUID.test(s);
