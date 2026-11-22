import { describe, expect, it } from 'vitest';
import { DEFAULT_DISPLAY, type DisplaySettings } from './displaySettings';
import { blankColumn, blankLink, displayProblems, moveItem, removeAt, replaceAt } from './displayDraft';

const withFooter = (columns: DisplaySettings['footer']['columns']): DisplaySettings => ({ ...DEFAULT_DISPLAY, footer: { ...DEFAULT_DISPLAY.footer, columns } });

describe('displayProblems', () => {
  it('the defaults have none', () => {
    expect(displayProblems(DEFAULT_DISPLAY)).toEqual([]);
  });

  it('a half-written footer link is named, not dropped silently', () => {
    const noLabel = displayProblems(withFooter([{ title: 'عمود', links: [{ label: '', url: '/x' }] }]));
    expect(noLabel).toHaveLength(1);
    expect(noLabel[0]).toContain('عمود «عمود»');
    expect(noLabel[0]).toContain('كلمة الرابط');

    const badUrl = displayProblems(withFooter([{ title: '', links: [{ label: 'تواصل', url: 'javascript:alert(1)' }] }]));
    expect(badUrl[0]).toContain('العمود رقم 1');
    expect(badUrl[0]).toContain('«تواصل»');

    expect(displayProblems(withFooter([{ title: 'ع', links: [blankLink()] }]))[0]).toContain('فاضي');
    expect(displayProblems(withFooter([{ title: 'ع', links: [{ label: 'ا', url: 'https://darolfath.com' }, { label: 'ب', url: 'mailto:a@b.co' }] }]))).toEqual([]);
  });

  it('empty trust text and too many items', () => {
    const empty = { ...DEFAULT_DISPLAY, page: { ...DEFAULT_DISPLAY.page, trust: [{ icon: 'check' as const, text: '  ' }] } };
    expect(displayProblems(empty)[0]).toContain('شارة الثقة رقم 1');
    const many = { ...DEFAULT_DISPLAY, page: { ...DEFAULT_DISPLAY.page, trust: Array.from({ length: 5 }, () => ({ icon: 'check' as const, text: 'س' })) } };
    expect(displayProblems(many).some((p) => p.includes('أكتر من 4'))).toBe(true);
  });
});

describe('list moves', () => {
  it('moves up and down, and stays put at the ends', () => {
    expect(moveItem(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c']);
    expect(moveItem(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'c', 'b']);
    expect(moveItem(['a', 'b', 'c'], 0, -1)).toEqual(['a', 'b', 'c']);
    expect(moveItem(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'b', 'c']);
    expect(moveItem(['a'], 5, 1)).toEqual(['a']);
  });

  it('replace and remove leave the original alone', () => {
    const list = ['a', 'b', 'c'];
    expect(replaceAt(list, 1, 'x')).toEqual(['a', 'x', 'c']);
    expect(removeAt(list, 0)).toEqual(['b', 'c']);
    expect(list).toEqual(['a', 'b', 'c']);
    expect(blankColumn().links).toHaveLength(1);
  });
});
