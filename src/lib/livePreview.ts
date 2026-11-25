/**
 * The dashboard's live previews: the real website, and a web copy of the real app, each shown in a frame and fed the draft that
 * is being edited (before it is saved). The two pages that are framed answer only this dashboard, and nothing they receive is
 * ever written anywhere.
 *
 * The messages are plain objects; the website and the app each read them through their own whitelists.
 */
import type { AppControl } from '@/lib/appControl';
import type { StorefrontAppearance } from '@/lib/appearance';
import type { DisplaySettings } from '@/lib/displaySettings';
import { STOREFRONT_URL } from '@/lib/storefront';

// ── The website ──────────────────────────────────────────────────────────────

export const SITE_PREVIEW_MESSAGE = 'daralfath:display-preview';
export const SITE_PREVIEW_READY = 'daralfath:display-preview-ready';

export const siteOrigin = (() => {
  try { return new URL(STOREFRONT_URL).origin; } catch { return ''; }
})();

/** Where the website's preview frame opens (`?preview=display` is what lets the website be framed by this dashboard). */
export const sitePreviewUrl = (path: string): string => `${STOREFRONT_URL}${path}${path.includes('?') ? '&' : '?'}preview=display`;

export type SiteScreen = 'home' | 'books' | 'book' | 'footer' | 'account';

export interface SitePreviewMessage {
  type: typeof SITE_PREVIEW_MESSAGE;
  display: DisplaySettings;
  navigate: string;
  scroll: 'footer' | 'top';
}

/** The page of the website each screen shows (a book's page needs a real book's id). */
export function siteRouteFor(screen: SiteScreen, bookId: string | null): string {
  if (screen === 'book' && bookId) return `/book/${bookId}`;
  if (screen === 'footer' || screen === 'home') return '/';
  if (screen === 'account') return '/account';
  return '/books';
}

export function buildSiteMessage(display: DisplaySettings, screen: SiteScreen, bookId: string | null): SitePreviewMessage {
  return { type: SITE_PREVIEW_MESSAGE, display, navigate: siteRouteFor(screen, bookId), scroll: screen === 'footer' ? 'footer' : 'top' };
}

export interface DepartmentsPreviewMessage {
  type: typeof SITE_PREVIEW_MESSAGE;
  departments: { ids: string[]; images: Record<string, string | null> };
  navigate: '/';
  scroll: 'departments';
}

/** The «أقسام المتجر» cards being edited, on the home page scrolled to them. */
export function buildDepartmentsMessage(draft: { ids: string[]; images: Record<string, string | null> }): DepartmentsPreviewMessage {
  return { type: SITE_PREVIEW_MESSAGE, departments: draft, navigate: '/', scroll: 'departments' };
}

export interface StockPreviewMessage {
  type: typeof SITE_PREVIEW_MESSAGE;
  stockCount: { web: boolean; app: boolean };
  navigate: string;
  scroll: 'top';
}

/** A book's page with the «show the number of copies» switches being edited (its editions say «متوفر 12 نسخة» or just «متوفر»). */
export function buildStockMessage(visibility: { web: boolean; app: boolean }, bookId: string | null): StockPreviewMessage {
  return { type: SITE_PREVIEW_MESSAGE, stockCount: { web: visibility.web, app: visibility.app }, navigate: bookId ? `/book/${bookId}` : '/books', scroll: 'top' };
}

export interface NodePagePreviewMessage {
  type: typeof SITE_PREVIEW_MESSAGE;
  nodePage: { id: string; fields: Record<string, unknown> };
  navigate: string;
  scroll: 'top';
}

/** A node's own page (a series' or a section's) with the picture / video, text and look being edited. */
export function buildNodePageMessage(nodeId: string, nodeType: string, fields: Record<string, unknown>): NodePagePreviewMessage {
  return {
    type: SITE_PREVIEW_MESSAGE,
    nodePage: { id: nodeId, fields },
    navigate: nodeType === 'series' ? `/books?series=${nodeId}` : `/books?node=${nodeId}`,
    scroll: 'top',
  };
}

export interface LookPreviewMessage {
  type: typeof SITE_PREVIEW_MESSAGE;
  appearance: StorefrontAppearance;
  theme: 'light' | 'dark';
  navigate: string;
  scroll: 'top';
}

/** The look being edited (pattern, strips, button colours), on a page of the store, in the day or the night look. */
export function buildLookMessage(appearance: StorefrontAppearance, theme: 'light' | 'dark', screen: SiteScreen, bookId: string | null): LookPreviewMessage {
  return { type: SITE_PREVIEW_MESSAGE, appearance, theme, navigate: siteRouteFor(screen, bookId), scroll: 'top' };
}

// ── The app ──────────────────────────────────────────────────────────────────

export const APP_PREVIEW_MESSAGE = 'daralfath:app-preview';
export const APP_PREVIEW_READY = 'daralfath:app-preview-ready';

/** Where the app's web copy is published (its own Vercel project; it can be framed only by this dashboard). */
export const APP_PREVIEW_URL = (
  (import.meta.env.VITE_APP_PREVIEW_URL as string | undefined)?.trim() || 'https://dar-alfath-app-preview.vercel.app'
).replace(/\/+$/, '');

export const appOrigin = (() => {
  try { return new URL(APP_PREVIEW_URL).origin; } catch { return ''; }
})();

export type AppScreen = 'cards' | 'book' | 'home';
export type AppNotice = 'maintenance' | 'update-required' | 'update-offer' | 'popup';
export type AppPlatform = 'ios' | 'android';

export interface AppPreviewMessage {
  type: typeof APP_PREVIEW_MESSAGE;
  display: DisplaySettings | null;
  control: AppControl | null;
  notice: AppNotice | null;
  platform: AppPlatform;
  language: 'ar' | 'en';
  dark: boolean;
  navigate: string;
}

/** The page of the app each screen shows (a book's page needs a real book's id). */
export function appRouteFor(screen: AppScreen, bookId: string | null): string {
  if (screen === 'book' && bookId) return `/book/${bookId}`;
  if (screen === 'cards') return '/search';
  return '/';
}

export interface AppPreviewInput {
  display?: DisplaySettings | null;
  control?: AppControl | null;
  notice?: AppNotice | null;
  screen: AppScreen;
  bookId: string | null;
  platform: AppPlatform;
  language: 'ar' | 'en';
  dark: boolean;
}

export function buildAppMessage(input: AppPreviewInput): AppPreviewMessage {
  return {
    type: APP_PREVIEW_MESSAGE,
    display: input.display ?? null,
    control: input.control ?? null,
    notice: input.notice ?? null,
    platform: input.platform,
    language: input.language,
    dark: input.dark,
    navigate: appRouteFor(input.screen, input.bookId),
  };
}
