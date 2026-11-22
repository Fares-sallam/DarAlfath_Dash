import { describe, expect, it } from 'vitest';
import {
  DEFAULT_APP_CONTROL, appControlToRow, cleanBuild, cleanStoreUrl, inWindow, isDefaultAppControl, maintenanceActive, maintenanceState, newCampaignId,
  parseBuild, pickText, popupDue, resolveAppControl, safeAppLink, safeImageUrl, storeLinkFor, updateState, type PopupSettings,
} from './appControl';

const NOW = Date.parse('2026-11-22T12:00:00Z');
const popup = (over: Partial<PopupSettings> = {}): PopupSettings => ({ ...DEFAULT_APP_CONTROL.popup, enabled: true, campaign: 'abcd1234', title: 'عرض', ...over });
const ctx = (over = {}) => ({ now: NOW, platform: 'ios', lastShownAt: null as number | null, shownThisLaunch: false, ...over });

describe('nothing saved means nothing is on', () => {
  it('missing, empty or rubbish', () => {
    for (const raw of [null, undefined, {}, [], 'x', 5, { maintenance: 'x', update_policy: [], popup: 7 }]) {
      expect(resolveAppControl(raw)).toEqual(DEFAULT_APP_CONTROL);
    }
    expect(isDefaultAppControl(DEFAULT_APP_CONTROL)).toBe(true);
    const c = DEFAULT_APP_CONTROL;
    expect(maintenanceActive(c.maintenance, NOW)).toBe(false);
    expect(updateState(c.update, 'ios', 1)).toBe('none');
    expect(popupDue(c.popup, ctx())).toBe(false);
  });

  it('only an explicit true switches anything on', () => {
    expect(resolveAppControl({ maintenance: { enabled: 'true' } }).maintenance.enabled).toBe(false);
    expect(resolveAppControl({ maintenance: { enabled: 1 } }).maintenance.enabled).toBe(false);
    expect(resolveAppControl({ maintenance: { enabled: true } }).maintenance.enabled).toBe(true);
    expect(resolveAppControl({ popup: { enabled: 'yes' } }).popup.enabled).toBe(false);
  });
});

describe('maintenance', () => {
  const m = (over = {}) => resolveAppControl({ maintenance: { enabled: true, ...over } }).maintenance;
  it('is on with no window, inside one, and off outside it', () => {
    expect(maintenanceState(m(), NOW)).toBe('active');
    expect(maintenanceState(m({ startsAt: '2026-11-22T10:00:00Z', endsAt: '2026-11-22T14:00:00Z' }), NOW)).toBe('active');
    expect(maintenanceState(m({ startsAt: '2026-11-22T13:00:00Z' }), NOW)).toBe('scheduled');
    expect(maintenanceState(m({ endsAt: '2026-11-22T11:00:00Z' }), NOW)).toBe('ended');
    expect(maintenanceActive(m({ endsAt: '2026-11-22T11:00:00Z' }), NOW)).toBe(false);
    expect(maintenanceState(resolveAppControl({}).maintenance, NOW)).toBe('off');
  });
  it('the window ends exactly at its end time', () => {
    expect(inWindow(null, '2026-11-22T12:00:00Z', NOW)).toBe(false);
    expect(inWindow('2026-11-22T12:00:00Z', null, NOW)).toBe(true);
  });
  it('texts are cleaned: no markup, cut to length, lines kept in the message', () => {
    const r = m({ title: '<b>صيانة</b>', message: 'سطر ١\n\n\n\nسطر ٢', titleEn: 'x'.repeat(500) });
    expect(r.title).toBe('b صيانة /b');
    expect(r.message).toBe('سطر ١\n\nسطر ٢');
    expect(r.titleEn).toHaveLength(80);
  });
  it('picks the English text only when the app is English and one was written', () => {
    expect(pickText('عربي', 'English', 'en')).toBe('English');
    expect(pickText('عربي', '', 'en')).toBe('عربي');
    expect(pickText('عربي', 'English', 'ar')).toBe('عربي');
  });
});

describe('update by build number', () => {
  const u = (over = {}) => resolveAppControl({ update_policy: over }).update;
  it('below the minimum must update, below the recommended may', () => {
    const rule = u({ minBuild: { ios: 12, android: 17 }, recommendedBuild: { ios: 14, android: 19 } });
    expect(updateState(rule, 'ios', 11)).toBe('required');
    expect(updateState(rule, 'ios', 12)).toBe('recommended');
    expect(updateState(rule, 'ios', 14)).toBe('none');
    expect(updateState(rule, 'android', 16)).toBe('required');
    expect(updateState(rule, 'android', 18)).toBe('recommended');
    expect(updateState(rule, 'android', 40)).toBe('none');
  });
  it('a platform with no rule, an unknown platform or an unknown build is never asked', () => {
    const rule = u({ minBuild: { ios: 12 } });
    expect(updateState(rule, 'android', 1)).toBe('none');
    expect(updateState(rule, 'web', 1)).toBe('none');
    expect(updateState(rule, 'ios', null)).toBe('none');
  });
  it('build numbers: whole numbers from 1, otherwise no rule', () => {
    expect(cleanBuild('12')).toBe(12);
    expect(cleanBuild(0)).toBeNull();
    expect(cleanBuild(-3)).toBeNull();
    expect(cleanBuild(2.5)).toBeNull();
    expect(cleanBuild('abc')).toBeNull();
    expect(cleanBuild('')).toBeNull();
    expect(cleanBuild(99_999_999)).toBe(1_000_000);
    expect(parseBuild('12')).toBe(12);
    expect(parseBuild(' 17 ')).toBe(17);
    expect(parseBuild(null)).toBeNull();
    expect(parseBuild('1.0.0')).toBeNull();
    expect(parseBuild(-1)).toBeNull();
  });
  it('the store link: the dashboard\'s https address, else the app\'s own', () => {
    const fallback = { ios: 'https://apps.apple.com/app/id1', android: 'https://play.google.com/store/apps/details?id=x' };
    expect(storeLinkFor(u({ storeUrl: { ios: 'https://example.com/a' } }), 'ios', fallback)).toBe('https://example.com/a');
    expect(storeLinkFor(u({ storeUrl: { ios: 'javascript:alert(1)' } }), 'ios', fallback)).toBe(fallback.ios);
    expect(storeLinkFor(u({}), 'android', fallback)).toBe(fallback.android);
    expect(storeLinkFor(u({}), 'web', fallback)).toBe('');
    expect(cleanStoreUrl('http://x.com')).toBe('');
  });
});

describe('the pop-up', () => {
  it('needs the switch, a campaign and something to say', () => {
    expect(popupDue(popup(), ctx())).toBe(true);
    expect(popupDue(popup({ enabled: false }), ctx())).toBe(false);
    expect(popupDue(popup({ campaign: '' }), ctx())).toBe(false);
    expect(popupDue(popup({ title: '', message: '', imageUrl: null }), ctx())).toBe(false);
    expect(popupDue(popup({ title: '', imageUrl: 'https://x.com/a.png' }), ctx())).toBe(true);
  });
  it('its window and its platform', () => {
    expect(popupDue(popup({ startsAt: '2026-11-23T00:00:00Z' }), ctx())).toBe(false);
    expect(popupDue(popup({ endsAt: '2026-11-22T00:00:00Z' }), ctx())).toBe(false);
    expect(popupDue(popup({ platform: 'android' }), ctx())).toBe(false);
    expect(popupDue(popup({ platform: 'ios' }), ctx())).toBe(true);
  });
  it('once: never again after it was shown; daily: after a day; launch: once per opening of the app', () => {
    expect(popupDue(popup({ frequency: 'once' }), ctx({ lastShownAt: NOW - 1000 }))).toBe(false);
    expect(popupDue(popup({ frequency: 'daily' }), ctx({ lastShownAt: NOW - 3_600_000 }))).toBe(false);
    expect(popupDue(popup({ frequency: 'daily' }), ctx({ lastShownAt: NOW - 90_000_000 }))).toBe(true);
    expect(popupDue(popup({ frequency: 'launch' }), ctx({ lastShownAt: NOW - 1000 }))).toBe(true);
    expect(popupDue(popup({ frequency: 'launch' }), ctx({ shownThisLaunch: true }))).toBe(false);
  });
  it('a new campaign id is a new showing, and ids are well formed', () => {
    const a = newCampaignId(NOW, () => 0.1);
    const b = newCampaignId(NOW + 1000, () => 0.1);
    expect(a).not.toBe(b);
    expect(resolveAppControl({ popup: { campaign: a } }).popup.campaign).toBe(a);
    expect(resolveAppControl({ popup: { campaign: 'x' } }).popup.campaign).toBe('');
    expect(resolveAppControl({ popup: { campaign: 'a b c d' } }).popup.campaign).toBe('');
  });
});

describe('addresses are whitelisted', () => {
  it('the pop-up link: a page in the app or https, nothing else', () => {
    expect(safeAppLink('/book/123')).toBe('/book/123');
    expect(safeAppLink('/(tabs)/orders')).toBe('/(tabs)/orders');
    expect(safeAppLink('https://darolfath.com/store')).toBe('https://darolfath.com/store');
    for (const bad of ['javascript:alert(1)', 'http://x.com', '//evil.com', 'data:text/html,x', 'book/1', '/a b', '', null, 5]) expect(safeAppLink(bad)).toBeNull();
  });
  it('the picture: https only', () => {
    expect(safeImageUrl('https://x.supabase.co/a.png')).toBe('https://x.supabase.co/a.png');
    for (const bad of ['http://x.com/a.png', 'javascript:x', '/local.png', '']) expect(safeImageUrl(bad)).toBeNull();
  });
});

describe('the row to save', () => {
  it('is clean and saving it again changes nothing', () => {
    const dirty = resolveAppControl({ popup: { enabled: true, campaign: 'abcd1234', title: ' عرض ', frequency: 'weird', linkUrl: 'javascript:x' } });
    const row = appControlToRow(dirty);
    expect(row.id).toBe(1);
    expect(row.popup.frequency).toBe('once');
    expect(row.popup.linkUrl).toBeNull();
    expect(row.popup.title).toBe('عرض');
    expect(appControlToRow(resolveAppControl({ maintenance: row.maintenance, update_policy: row.update_policy, popup: row.popup }))).toEqual(row);
  });
});
