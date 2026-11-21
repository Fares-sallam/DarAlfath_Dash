import { describe, expect, it } from 'vitest';
import { authorKey, authorOptions, findAuthor } from './authors';

describe('author names', () => {
  it('a title in front or another spelling is the same author', () => {
    expect(authorKey('د / أيمن أمين عبدالغنى')).toBe(authorKey('أيمن أمين عبدالغني'));
    expect(authorKey('دكتور  أيمن أمين عبدالغني')).toBe(authorKey('ايمن امين عبدالغني'));
    expect(authorKey('Dr. Ayman')).toBe(authorKey('ayman'));
    expect(authorKey('د أحمد')).toBe(authorKey('احمد'));
  });
  it('a name that only starts with the same letters is not a title', () => {
    expect(authorKey('دار الفتح')).toBe('دار الفتح');
    expect(authorKey('ابو بكر')).toBe('ابو بكر');
    expect(authorKey('دعاء محمد')).toBe('دعاء محمد');
    expect(authorKey('أكاديمية الفتح العالمية')).toBe('اكاديميه الفتح العالميه');
  });
  it('different authors stay different', () => {
    expect(authorKey('محمد القليعي')).not.toBe(authorKey('عبدالرحمن بكر'));
  });
  it('lists each author once and keeps the one a book already carries', () => {
    expect(authorOptions(['محمد القليعي', 'د / أيمن أمين عبدالغني', 'أيمن أمين عبدالغنى'], '')).toEqual(['د / أيمن أمين عبدالغني', 'محمد القليعي']);
    expect(authorOptions(['محمد القليعي'], 'د / أيمن أمين عبدالغنى')).toEqual(['د / أيمن أمين عبدالغنى', 'محمد القليعي']);
  });
  it('finds the listed author a typed name is the same as', () => {
    expect(findAuthor(['د / أيمن أمين عبدالغني'], 'أيمن أمين عبدالغنى')).toBe('د / أيمن أمين عبدالغني');
    expect(findAuthor(['محمد القليعي'], 'محمد السيد')).toBeNull();
  });
});
