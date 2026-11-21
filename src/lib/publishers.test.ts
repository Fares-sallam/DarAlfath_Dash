import { describe, expect, it } from 'vitest';
import { cleanPublisherName, findPublisher, publisherKey, publisherOptions } from './publishers';

describe('publisher names', () => {
  it('cleans spaces', () => {
    expect(cleanPublisherName('  دار   الفتح ')).toBe('دار الفتح');
  });
  it('gives one key to every spelling of a name', () => {
    expect(publisherKey('دَار  الفتح')).toBe(publisherKey('دار الفتح'));
    expect(publisherKey('مكتبة الأسرة')).toBe(publisherKey('مكتبه الاسره'));
    expect(publisherKey('إيمان')).toBe(publisherKey('ايمان'));
    expect(publisherKey('الهدى')).toBe(publisherKey('الهدي'));
    expect(publisherKey('Dar  ALFATH')).toBe('dar alfath');
    expect(publisherKey('دار الفتح')).not.toBe(publisherKey('دار النور'));
  });
  it('lists each name once, in Arabic order, and keeps a name the book already has', () => {
    expect(publisherOptions(['دار النور', 'دار الفتح', 'دَار الفتح'], '')).toEqual(['دار الفتح', 'دار النور']);
    expect(publisherOptions(['دار الفتح'], 'مكتبة قديمة')).toEqual(['مكتبة قديمة', 'دار الفتح']);
    expect(publisherOptions(['دار الفتح'], 'دار  الفتح')).toEqual(['دار الفتح']);
    expect(publisherOptions([], '')).toEqual([]);
  });
  it('finds the listed name a typed one is the same as', () => {
    expect(findPublisher(['دار الفتح'], 'دَار   الفتح')).toBe('دار الفتح');
    expect(findPublisher(['دار الفتح'], 'دار النور')).toBeNull();
    expect(findPublisher(['دار الفتح'], '   ')).toBeNull();
  });
});
