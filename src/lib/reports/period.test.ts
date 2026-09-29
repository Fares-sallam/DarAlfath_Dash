import { describe, expect, it } from 'vitest';
import { isInPeriod, periodDays, resolvePeriod, validatePeriod } from './period';

// Tue 29 Sep 2026, 14:05 Cairo time (UTC+3).
const now = new Date(2026, 8, 29, 14, 5);
const ymd = (d: Date | null) => d && `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()} ${d.getHours()}:${d.getMinutes()}`;

describe('resolvePeriod', () => {
  it('this month runs from the 1st to the end of today', () => {
    const p = resolvePeriod({ preset: 'thisMonth' }, now);
    expect(ymd(p.from)).toBe('2026-9-1 0:0');
    expect(ymd(p.to)).toBe('2026-9-29 23:59');
    expect(p.label).toBe('هذا الشهر (سبتمبر 2026)');
  });

  it('last month is the whole previous month, across a year boundary too', () => {
    const p = resolvePeriod({ preset: 'lastMonth' }, now);
    expect(ymd(p.from)).toBe('2026-8-1 0:0');
    expect(ymd(p.to)).toBe('2026-8-31 23:59');

    const jan = resolvePeriod({ preset: 'lastMonth' }, new Date(2027, 0, 10));
    expect(ymd(jan.from)).toBe('2026-12-1 0:0');
    expect(ymd(jan.to)).toBe('2026-12-31 23:59');
  });

  it('last 7 days includes today', () => {
    const p = resolvePeriod({ preset: 'last7' }, now);
    expect(ymd(p.from)).toBe('2026-9-23 0:0');
    expect(periodDays(p)).toBe(7);
  });

  it('today and yesterday are single whole days', () => {
    expect(periodDays(resolvePeriod({ preset: 'today' }, now))).toBe(1);
    const y = resolvePeriod({ preset: 'yesterday' }, now);
    expect(ymd(y.from)).toBe('2026-9-28 0:0');
    expect(ymd(y.to)).toBe('2026-9-28 23:59');
  });

  it('a custom range is inclusive of both local days', () => {
    const p = resolvePeriod({ preset: 'custom', from: '2026-09-01', to: '2026-09-15' }, now);
    expect(ymd(p.from)).toBe('2026-9-1 0:0');
    expect(ymd(p.to)).toBe('2026-9-15 23:59');
    expect(p.slug).toBe('من-2026-09-01-إلى-2026-09-15');
    expect(periodDays(p)).toBe(15);
  });

  it('the comprehensive report is open-ended', () => {
    const p = resolvePeriod({ preset: 'all' }, now);
    expect(p.from).toBeNull();
    expect(p.to).toBeNull();
    expect(periodDays(p)).toBeNull();
    expect(p.slug).toBe('شامل');
  });
});

describe('validatePeriod', () => {
  it('accepts presets without dates', () => {
    expect(validatePeriod({ preset: 'thisMonth' }, now)).toBeNull();
  });
  it('rejects a custom range that is incomplete, reversed or in the future', () => {
    expect(validatePeriod({ preset: 'custom', from: '2026-09-01' }, now)).not.toBeNull();
    expect(validatePeriod({ preset: 'custom', from: '2026-09-15', to: '2026-09-01' }, now)).not.toBeNull();
    expect(validatePeriod({ preset: 'custom', from: '2026-10-05', to: '2026-10-06' }, now)).not.toBeNull();
    expect(validatePeriod({ preset: 'custom', from: 'not-a-date', to: '2026-09-01' }, now)).not.toBeNull();
    expect(validatePeriod({ preset: 'custom', from: '2026-09-01', to: '2026-09-01' }, now)).toBeNull();
  });
});

describe('isInPeriod', () => {
  const p = resolvePeriod({ preset: 'custom', from: '2026-09-01', to: '2026-09-15' }, now);
  it('uses Cairo calendar days, not UTC days', () => {
    expect(isInPeriod('2026-08-31T21:00:00Z', p)).toBe(true); // 00:00 on the 1st, Cairo
    expect(isInPeriod('2026-08-31T20:59:00Z', p)).toBe(false); // 23:59 on the 31st
    expect(isInPeriod('2026-09-15T20:59:00Z', p)).toBe(true); // 23:59 on the 15th
    expect(isInPeriod('2026-09-15T21:00:00Z', p)).toBe(false); // 00:00 on the 16th
  });
  it('treats missing or invalid dates as outside a bounded period, and everything as inside the comprehensive one', () => {
    expect(isInPeriod(null, p)).toBe(false);
    expect(isInPeriod('garbage', p)).toBe(false);
    expect(isInPeriod(null, resolvePeriod({ preset: 'all' }, now))).toBe(true);
  });
});
