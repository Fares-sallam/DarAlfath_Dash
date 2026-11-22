import { describe, expect, it } from 'vitest';
import { DEFAULT_APP_CONTROL } from './appControl';
import { DEFAULT_DISPLAY } from './displaySettings';
import {
  APP_PREVIEW_MESSAGE, SITE_PREVIEW_MESSAGE, appRouteFor, buildAppMessage, buildSiteMessage, siteRouteFor, sitePreviewUrl,
} from './livePreview';

const BOOK = '0b1f6f7e-2a3b-4c5d-8e9f-1a2b3c4d5e6f';

describe('the website preview', () => {
  it('each screen is a page of the store; a book page needs a book', () => {
    expect(siteRouteFor('books', null)).toBe('/books');
    expect(siteRouteFor('book', BOOK)).toBe(`/book/${BOOK}`);
    expect(siteRouteFor('book', null)).toBe('/books');
    expect(siteRouteFor('footer', null)).toBe('/');
  });
  it('the message carries the draft, the page, and where to scroll', () => {
    const m = buildSiteMessage(DEFAULT_DISPLAY, 'footer', null);
    expect(m.type).toBe(SITE_PREVIEW_MESSAGE);
    expect(m.display).toBe(DEFAULT_DISPLAY);
    expect(m).toMatchObject({ navigate: '/', scroll: 'footer' });
    expect(buildSiteMessage(DEFAULT_DISPLAY, 'books', null).scroll).toBe('top');
  });
  it('the frame opens with the preview marker the website needs to be framed', () => {
    expect(sitePreviewUrl('/books')).toMatch(/\/books\?preview=display$/);
    expect(sitePreviewUrl('/books?x=1')).toMatch(/\/books\?x=1&preview=display$/);
  });
});

describe('the app preview', () => {
  it('each screen is a page of the app', () => {
    expect(appRouteFor('cards', null)).toBe('/search');
    expect(appRouteFor('book', BOOK)).toBe(`/book/${BOOK}`);
    expect(appRouteFor('book', null)).toBe('/');
    expect(appRouteFor('home', null)).toBe('/');
  });
  it('the message carries the drafts, the notice, the platform, the language and the theme', () => {
    const m = buildAppMessage({ display: DEFAULT_DISPLAY, control: DEFAULT_APP_CONTROL, notice: 'popup', screen: 'home', bookId: null, platform: 'android', language: 'en', dark: true });
    expect(m).toMatchObject({ type: APP_PREVIEW_MESSAGE, notice: 'popup', platform: 'android', language: 'en', dark: true, navigate: '/' });
    expect(m.display).toBe(DEFAULT_DISPLAY);
    expect(buildAppMessage({ screen: 'cards', bookId: null, platform: 'ios', language: 'ar', dark: false })).toMatchObject({ display: null, control: null, notice: null });
  });
});
