/* The app's operating switches, as the dashboard («التحكم في التطبيق») sets them and the app reads them: a maintenance screen,
 * a forced / recommended update by build number, and a promotional pop-up.
 *
 * This file is shared: the dashboard and the app keep a byte-identical copy (it imports nothing), so a choice made in the
 * dashboard is understood the same way where it is acted on. Everything read from the database goes through the whitelists
 * below, so a bad or missing value can only ever mean "nothing is switched on", never a blocked app or a script address.
 * With nothing saved, nothing is on.
 *
 * Only builds of the app that contain this code read it: an app already installed from before it existed is not affected.
 */

// ── What is saved ────────────────────────────────────────────────────────────

export interface MaintenanceSettings {
  enabled: boolean;
  title: string;
  message: string;
  titleEn: string;
  messageEn: string;
  /** Optional window: the screen shows from `startsAt` until `endsAt` (either may be empty). */
  startsAt: string | null;
  endsAt: string | null;
}

export interface PlatformBuilds {
  ios: number | null;
  android: number | null;
}

export interface UpdateSettings {
  /** Latest build the owner has verified as available in each public store. Not trusted as an automatic store lookup. */
  publishedBuild: PlatformBuilds;
  /** Builds below this must update (a screen they cannot pass). null = no rule. */
  minBuild: PlatformBuilds;
  /** Builds below this are offered an update they can put off. null = no rule. */
  recommendedBuild: PlatformBuilds;
  message: string;
  messageEn: string;
  /** Where «تحديث» goes; empty = the store page the app itself knows. */
  storeUrl: { ios: string; android: string };
}

export const POPUP_FREQUENCIES = ['once', 'daily', 'launch'] as const;
export type PopupFrequency = (typeof POPUP_FREQUENCIES)[number];
export const POPUP_FREQUENCY_LABEL: Record<PopupFrequency, string> = {
  once: 'مرة واحدة لكل مستخدم',
  daily: 'مرة كل يوم',
  launch: 'كل مرة يفتح فيها التطبيق',
};

export const POPUP_PLATFORMS = ['all', 'ios', 'android'] as const;
export type PopupPlatform = (typeof POPUP_PLATFORMS)[number];
export const POPUP_PLATFORM_LABEL: Record<PopupPlatform, string> = { all: 'الاتنين', ios: 'آيفون بس', android: 'أندرويد بس' };

export interface PopupSettings {
  enabled: boolean;
  /** Which showing this is: whoever has already seen (and closed) a campaign is not shown it again, until this changes. */
  campaign: string;
  title: string;
  message: string;
  titleEn: string;
  messageEn: string;
  imageUrl: string | null;
  buttonLabel: string;
  buttonLabelEn: string;
  /** A page inside the app (starts with «/») or an https address; null = the pop-up only has a close button. */
  linkUrl: string | null;
  startsAt: string | null;
  endsAt: string | null;
  frequency: PopupFrequency;
  platform: PopupPlatform;
}

export interface AppControl {
  maintenance: MaintenanceSettings;
  update: UpdateSettings;
  popup: PopupSettings;
}

// ── Defaults ─────────────────────────────────────────────────────────────────

export const DEFAULT_MAINTENANCE_TITLE = 'التطبيق تحت الصيانة';
export const DEFAULT_MAINTENANCE_TITLE_EN = 'Under maintenance';
export const DEFAULT_MAINTENANCE_MESSAGE = 'بنجهّز تحسينات للتطبيق. هنرجع قريبًا إن شاء الله.';
export const DEFAULT_MAINTENANCE_MESSAGE_EN = 'We are making improvements. We will be back soon.';
export const DEFAULT_UPDATE_MESSAGE = 'فيه نسخة أحدث من التطبيق. حدّث دلوقتي عشان تكمّل.';
export const DEFAULT_UPDATE_MESSAGE_EN = 'A newer version of the app is available. Please update to continue.';

export const DEFAULT_APP_CONTROL: AppControl = {
  maintenance: { enabled: false, title: '', message: '', titleEn: '', messageEn: '', startsAt: null, endsAt: null },
  update: {
    publishedBuild: { ios: null, android: null },
    minBuild: { ios: null, android: null },
    recommendedBuild: { ios: null, android: null },
    message: '',
    messageEn: '',
    storeUrl: { ios: '', android: '' },
  },
  popup: {
    enabled: false,
    campaign: '',
    title: '',
    message: '',
    titleEn: '',
    messageEn: '',
    imageUrl: null,
    buttonLabel: '',
    buttonLabelEn: '',
    linkUrl: null,
    startsAt: null,
    endsAt: null,
    frequency: 'once',
    platform: 'all',
  },
};

export const APP_CONTROL_COLUMNS = 'maintenance, update_policy, popup';

export const TITLE_MAX = 80;
export const MESSAGE_MAX = 400;
export const BUTTON_MAX = 30;
export const URL_MAX = 300;
export const BUILD_MAX = 1_000_000;

// ── Reading what was saved ───────────────────────────────────────────────────

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Text with no markup or control characters, trimmed, one line of spaces, cut to a length. */
export function cleanText(raw: unknown, max: number, keepLines = false): string {
  if (typeof raw !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  const stripped = raw.replace(keepLines ? /[\u0000-\u0009\u000b-\u001f\u007f<>]/g : /[\u0000-\u001f\u007f<>]/g, ' ');
  const collapsed = keepLines ? stripped.replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n') : stripped.replace(/\s+/g, ' ');
  return collapsed.trim().slice(0, max);
}

/** A time (ISO), or null when it is not one. */
export function cleanTime(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

/** A build number (a whole number from 1), or null when empty or not one. */
export function cleanBuild(raw: unknown): number | null {
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN;
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) return null;
  return Math.min(BUILD_MAX, n);
}

/** An https address for a store page, or '' when it is not one. */
export function cleanStoreUrl(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const url = raw.trim();
  if (url.length === 0 || url.length > URL_MAX || /[\s<>"'`\\]/.test(url)) return '';
  return /^https:\/\/[^/?#]+/i.test(url) ? url : '';
}

/** Where a pop-up button may go: a page inside the app («/…») or an https address; null for anything else. */
export function safeAppLink(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const url = raw.trim();
  if (url.length === 0 || url.length > URL_MAX || /[\s<>"'`\\]/.test(url)) return null;
  if (url.startsWith('/') && !url.startsWith('//')) return url;
  return /^https:\/\/[^/?#]+/i.test(url) ? url : null;
}

/** A picture's https address, or null. */
export function safeImageUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const url = raw.trim();
  if (url.length === 0 || url.length > 500 || /[\s<>"'`\\]/.test(url)) return null;
  return /^https:\/\/[^/?#]+/i.test(url) ? url : null;
}

const CAMPAIGN = /^[A-Za-z0-9_-]{4,40}$/;

function pickBuilds(raw: unknown): PlatformBuilds {
  const r = isObject(raw) ? raw : {};
  return { ios: cleanBuild(r.ios), android: cleanBuild(r.android) };
}

/** What is saved, made complete and safe: anything missing or odd means «not switched on». */
export function resolveAppControl(raw: unknown): AppControl {
  const r = isObject(raw) ? raw : {};
  const m = isObject(r.maintenance) ? r.maintenance : {};
  const u = isObject(r.update_policy) ? r.update_policy : isObject(r.update) ? r.update : {};
  const p = isObject(r.popup) ? r.popup : {};
  const store = isObject(u.storeUrl) ? u.storeUrl : {};

  return {
    maintenance: {
      enabled: m.enabled === true,
      title: cleanText(m.title, TITLE_MAX),
      message: cleanText(m.message, MESSAGE_MAX, true),
      titleEn: cleanText(m.titleEn, TITLE_MAX),
      messageEn: cleanText(m.messageEn, MESSAGE_MAX, true),
      startsAt: cleanTime(m.startsAt),
      endsAt: cleanTime(m.endsAt),
    },
    update: {
      publishedBuild: pickBuilds(u.publishedBuild),
      minBuild: pickBuilds(u.minBuild),
      recommendedBuild: pickBuilds(u.recommendedBuild),
      message: cleanText(u.message, MESSAGE_MAX, true),
      messageEn: cleanText(u.messageEn, MESSAGE_MAX, true),
      storeUrl: { ios: cleanStoreUrl(store.ios), android: cleanStoreUrl(store.android) },
    },
    popup: {
      enabled: p.enabled === true,
      campaign: typeof p.campaign === 'string' && CAMPAIGN.test(p.campaign) ? p.campaign : '',
      title: cleanText(p.title, TITLE_MAX),
      message: cleanText(p.message, MESSAGE_MAX, true),
      titleEn: cleanText(p.titleEn, TITLE_MAX),
      messageEn: cleanText(p.messageEn, MESSAGE_MAX, true),
      imageUrl: safeImageUrl(p.imageUrl),
      buttonLabel: cleanText(p.buttonLabel, BUTTON_MAX),
      buttonLabelEn: cleanText(p.buttonLabelEn, BUTTON_MAX),
      linkUrl: safeAppLink(p.linkUrl),
      startsAt: cleanTime(p.startsAt),
      endsAt: cleanTime(p.endsAt),
      frequency: (POPUP_FREQUENCIES as readonly string[]).includes(p.frequency as string) ? (p.frequency as PopupFrequency) : 'once',
      platform: (POPUP_PLATFORMS as readonly string[]).includes(p.platform as string) ? (p.platform as PopupPlatform) : 'all',
    },
  };
}

/** The row to save: the same shape, already resolved, so what reaches the database is always clean. */
export function appControlToRow(control: AppControl) {
  const clean = resolveAppControl({ maintenance: control.maintenance, update_policy: control.update, popup: control.popup });
  return { id: 1, maintenance: clean.maintenance, update_policy: clean.update, popup: clean.popup };
}

export const isDefaultAppControl = (control: AppControl): boolean =>
  JSON.stringify(resolveAppControl({ maintenance: control.maintenance, update_policy: control.update, popup: control.popup })) === JSON.stringify(DEFAULT_APP_CONTROL);

// ── Deciding what the app does ───────────────────────────────────────────────

export type AppPlatform = 'ios' | 'android' | 'web' | string;

/** The text in the reader's language: the English one when the app is in English and one was written, else the Arabic one. */
export const pickText = (ar: string, en: string, language: 'ar' | 'en'): string => (language === 'en' && en ? en : ar);

/** Is the window open now (an empty side is open). */
export function inWindow(startsAt: string | null, endsAt: string | null, now: number): boolean {
  const from = startsAt ? Date.parse(startsAt) : null;
  const until = endsAt ? Date.parse(endsAt) : null;
  if (from !== null && Number.isFinite(from) && now < from) return false;
  if (until !== null && Number.isFinite(until) && now >= until) return false;
  return true;
}

export type MaintenanceState = 'off' | 'scheduled' | 'active' | 'ended';

/** Where the maintenance switch stands: off, switched on but not yet in its window, showing now, or past its window. */
export function maintenanceState(m: MaintenanceSettings, now: number): MaintenanceState {
  if (!m.enabled) return 'off';
  if (inWindow(m.startsAt, m.endsAt, now)) return 'active';
  const from = m.startsAt ? Date.parse(m.startsAt) : null;
  return from !== null && Number.isFinite(from) && now < from ? 'scheduled' : 'ended';
}

export const maintenanceActive = (m: MaintenanceSettings, now: number): boolean => maintenanceState(m, now) === 'active';

/** The build number the phone reports («12», 12) as a number, or null when it cannot be told (never blocks anyone). */
export function parseBuild(raw: unknown): number | null {
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw.trim()) : NaN;
  return Number.isFinite(n) && Number.isInteger(n) && n >= 0 ? n : null;
}

export type UpdateState = 'required' | 'recommended' | 'none';

/** What the update rules say for this phone. An unknown platform or build is never asked to update. */
export function updateState(update: UpdateSettings, platform: AppPlatform, build: number | null): UpdateState {
  if ((platform !== 'ios' && platform !== 'android') || build === null) return 'none';
  const min = update.minBuild[platform];
  if (min !== null && build < min) return 'required';
  const recommended = update.recommendedBuild[platform];
  if (recommended !== null && build < recommended) return 'recommended';
  return 'none';
}

/** Where «تحديث» goes: the address written in the dashboard, else the one the app knows for its own store page. */
export function storeLinkFor(update: UpdateSettings, platform: AppPlatform, fallback: { ios: string; android: string }): string {
  if (platform !== 'ios' && platform !== 'android') return '';
  return update.storeUrl[platform] || fallback[platform];
}

export interface PopupContext {
  now: number;
  platform: AppPlatform;
  /** When this campaign was last shown on this phone (ms), or null if never. */
  lastShownAt: number | null;
  /** Has a pop-up already been shown since the app was opened. */
  shownThisLaunch: boolean;
}

/** Whether the pop-up is to be shown now: switched on, something to say, in its window, for this phone, and not seen too lately. */
export function popupDue(p: PopupSettings, ctx: PopupContext): boolean {
  if (!p.enabled || !p.campaign) return false;
  if (!p.title && !p.message && !p.imageUrl) return false;
  if (!inWindow(p.startsAt, p.endsAt, ctx.now)) return false;
  if (p.platform !== 'all' && p.platform !== ctx.platform) return false;
  if (p.frequency === 'once') return ctx.lastShownAt === null;
  if (p.frequency === 'daily') return ctx.lastShownAt === null || ctx.now - ctx.lastShownAt >= 86_400_000;
  return !ctx.shownThisLaunch;
}

/** A fresh campaign id for «عرضها من جديد لكل المستخدمين». */
export function newCampaignId(now: number = Date.now(), random: () => number = Math.random): string {
  return `c${now.toString(36)}${Math.floor(random() * 36 ** 4).toString(36).padStart(4, '0')}`;
}
