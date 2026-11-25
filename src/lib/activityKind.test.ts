import { describe, expect, it } from 'vitest';
import { ACTIVITY_KINDS, ACTIVITY_KIND_HINT, ACTIVITY_KIND_LABEL, ACTIVITY_REPORT_TITLE, parseActivityKind, withActorProfile } from './activityKind';

describe('parseActivityKind', () => {
  it('only «customer» opens the customers log, everything else is the staff log', () => {
    expect(parseActivityKind('customer')).toBe('customer');
    expect(parseActivityKind('staff')).toBe('staff');
    expect(parseActivityKind(null)).toBe('staff');
    expect(parseActivityKind(undefined)).toBe('staff');
    expect(parseActivityKind('')).toBe('staff');
    expect(parseActivityKind('admin')).toBe('staff');
  });
});

describe('labels', () => {
  it('every kind has a label, a hint and its own report title and file name', () => {
    for (const kind of ACTIVITY_KINDS) {
      expect(ACTIVITY_KIND_LABEL[kind]).toBeTruthy();
      expect(ACTIVITY_KIND_HINT[kind]).toBeTruthy();
      expect(ACTIVITY_REPORT_TITLE[kind].title).toBeTruthy();
    }
    expect(ACTIVITY_REPORT_TITLE.staff.fileBase).not.toBe(ACTIVITY_REPORT_TITLE.customer.fileBase);
  });
});

describe('withActorProfile', () => {
  it('moves the actor columns under profiles', () => {
    const row = withActorProfile({ id: 'a', user_id: 'u1', actor_name: 'سالم', actor_avatar: null, actor_role: 'user' });
    expect(row.profiles).toEqual({ full_name: 'سالم', avatar_url: null, role: 'user' });
    expect('actor_name' in row).toBe(false);
    expect(row.id).toBe('a');
  });
  it('a row with no actor has no profile (shown as «النظام»)', () => {
    expect(withActorProfile({ id: 'a', user_id: null, actor_name: null, actor_avatar: null, actor_role: null }).profiles).toBeNull();
  });
  it('a guest has a name but no account: still an actor, not «النظام»', () => {
    expect(withActorProfile({ id: 'a', user_id: null, actor_name: 'ضيف تجريبي (ضيف)', actor_avatar: null, actor_role: null }).profiles)
      .toEqual({ full_name: 'ضيف تجريبي (ضيف)', avatar_url: null });
  });
  it('an actor with no profile row has none either, and no role is left out', () => {
    expect(withActorProfile({ id: 'a', user_id: 'u1' }).profiles).toBeNull();
    expect(withActorProfile({ id: 'a', user_id: 'u1', actor_name: 'x' }).profiles).toEqual({ full_name: 'x', avatar_url: null });
  });
});
