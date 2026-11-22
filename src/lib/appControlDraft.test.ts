import { describe, expect, it } from 'vitest';
import { DEFAULT_APP_CONTROL, resolveAppControl, type AppControl } from './appControl';
import { appControlProblems, raisesMinimum, withCampaign } from './appControlDraft';

const draft = (over: Partial<{ maintenance: object; update: object; popup: object }> = {}): AppControl => ({
  maintenance: { ...DEFAULT_APP_CONTROL.maintenance, ...(over.maintenance ?? {}) },
  update: { ...DEFAULT_APP_CONTROL.update, ...(over.update ?? {}) },
  popup: { ...DEFAULT_APP_CONTROL.popup, ...(over.popup ?? {}) },
});

describe('appControlProblems', () => {
  it('nothing switched on has none', () => {
    expect(appControlProblems(DEFAULT_APP_CONTROL)).toEqual([]);
  });

  it('windows must end after they start', () => {
    expect(appControlProblems(draft({ maintenance: { startsAt: '2026-11-22T12:00:00Z', endsAt: '2026-11-22T10:00:00Z' } }))[0]).toContain('الصيانة');
    expect(appControlProblems(draft({ popup: { startsAt: '2026-11-22T12:00:00Z', endsAt: '2026-11-22T12:00:00Z' } }))[0]).toContain('النافذة');
    expect(appControlProblems(draft({ maintenance: { startsAt: '2026-11-22T10:00:00Z', endsAt: '2026-11-22T12:00:00Z' } }))).toEqual([]);
  });

  it('a switched-on pop-up needs something to say, and its addresses must be safe', () => {
    expect(appControlProblems(draft({ popup: { enabled: true } }))[0]).toContain('اكتب عنوان');
    expect(appControlProblems(draft({ popup: { enabled: true, title: 'عرض' } }))).toEqual([]);
    expect(appControlProblems(draft({ popup: { title: 'عرض', linkUrl: 'javascript:alert(1)' } }))[0]).toContain('الرابط');
    expect(appControlProblems(draft({ popup: { title: 'عرض', linkUrl: '/book/1' } }))).toEqual([]);
    expect(appControlProblems(draft({ popup: { title: 'عرض', imageUrl: 'http://x.com/a.png' } }))[0]).toContain('https');
  });

  it('store addresses and build numbers', () => {
    expect(appControlProblems(draft({ update: { storeUrl: { ios: 'http://x', android: '' } } }))[0]).toContain('iOS');
    expect(appControlProblems(draft({ update: { minBuild: { ios: 12, android: null }, recommendedBuild: { ios: 10, android: null } } }))[0]).toContain('مقترح');
    expect(appControlProblems(draft({ update: { minBuild: { ios: 12, android: null }, recommendedBuild: { ios: 14, android: null } } }))).toEqual([]);
  });
});

describe('withCampaign', () => {
  it('gives a switched-on pop-up with no campaign one, and leaves the rest alone', () => {
    const on = withCampaign({ ...DEFAULT_APP_CONTROL.popup, enabled: true, title: 'x' }, 1_700_000_000_000, () => 0.5);
    expect(on.campaign).toMatch(/^c[a-z0-9]+$/);
    expect(resolveAppControl({ popup: on }).popup.campaign).toBe(on.campaign);
    expect(withCampaign({ ...DEFAULT_APP_CONTROL.popup, enabled: false })).toEqual(DEFAULT_APP_CONTROL.popup);
    expect(withCampaign({ ...DEFAULT_APP_CONTROL.popup, enabled: true, campaign: 'keepme1' }).campaign).toBe('keepme1');
  });
});

describe('raisesMinimum', () => {
  it('names the platforms where the minimum goes up or appears', () => {
    const saved = draft({ update: { minBuild: { ios: 10, android: null } } });
    expect(raisesMinimum(saved, saved)).toEqual([]);
    expect(raisesMinimum(saved, draft({ update: { minBuild: { ios: 12, android: null } } }))).toEqual([{ platform: 'ios', label: 'iOS', build: 12 }]);
    expect(raisesMinimum(saved, draft({ update: { minBuild: { ios: 10, android: 17 } } }))).toEqual([{ platform: 'android', label: 'أندرويد', build: 17 }]);
    expect(raisesMinimum(saved, draft({ update: { minBuild: { ios: 8, android: null } } }))).toEqual([]);
    expect(raisesMinimum(saved, draft())).toEqual([]);
  });
});
