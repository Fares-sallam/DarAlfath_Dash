import { describe, expect, it } from 'vitest';
import type { CatalogNode } from './catalogTree';
import { formFromNode, mediaChoiceOf, nodePagePatch, nodePageProblems, pageSummary, previewFields } from './nodePageDraft';

function node(over: Partial<CatalogNode> = {}): CatalogNode {
  return {
    id: 'n', parent_id: null, type: 'series', name_ar: 'سلسلة', name_en: null, slug: 'n', description_ar: null, description_en: null,
    image_url: null, icon: null, color: null, is_active: true, featured: false, show_web: true, show_app: true,
    sort_web: 0, sort_app: 0, show_in_menu_web: false, show_in_bar_web: true, show_in_bar_app: true, hide_when_empty: true,
    books_sort_web: 'manual', books_sort_app: 'manual', starts_at: null, ends_at: null, seo_title: null, seo_description: null, intro_ar: null, intro_en: null, video_url: null,
    intro_media: 'auto', intro_image_url: null, intro_align: 'right', intro_font_px: 16, intro_pad_right: 0, intro_pad_left: 0, intro_text_pos: 'side', page_layout: 'auto',
    strips_limit: 12, show_as_strip: true, legacy_table: null, legacy_id: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', ...over,
  };
}

describe('the media choice', () => {
  it("'auto' (what every page had) is a video when there is one, otherwise nothing", () => {
    expect(mediaChoiceOf({ intro_media: 'auto', video_url: 'https://youtu.be/abc' })).toBe('video');
    expect(mediaChoiceOf({ intro_media: 'auto', video_url: null })).toBe('none');
    expect(mediaChoiceOf({ intro_media: 'auto', video_url: '  ' })).toBe('none');
  });
  it('an explicit choice is kept', () => {
    expect(mediaChoiceOf({ intro_media: 'image', video_url: 'https://youtu.be/abc' })).toBe('image');
    expect(mediaChoiceOf({ intro_media: 'none', video_url: 'https://youtu.be/abc' })).toBe('none');
  });
});

describe('the form and what is saved', () => {
  it('a form opened and left alone saves nothing', () => {
    const n = node({ intro_ar: 'مرحبا', video_url: 'https://youtu.be/abc' });
    expect(nodePagePatch(n, formFromNode(n))).toEqual({});
    expect(nodePagePatch(node(), formFromNode(node()))).toEqual({});
  });
  it('only what changed is saved', () => {
    const n = node();
    const patch = nodePagePatch(n, { ...formFromNode(n), introAr: '  كلام  ', align: 'center', fontPx: 22 });
    expect(patch).toEqual({ intro_ar: 'كلام', intro_align: 'center', intro_font_px: 22 });
  });
  it('choosing a picture or a video writes the choice; leaving it as it was does not', () => {
    const n = node();
    expect(nodePagePatch(n, { ...formFromNode(n), media: 'image', imageUrl: 'https://x/i.png' })).toEqual({ intro_media: 'image', intro_image_url: 'https://x/i.png' });
    expect(nodePagePatch(n, { ...formFromNode(n), media: 'video', videoUrl: 'https://youtu.be/abc' })).toEqual({ intro_media: 'video', video_url: 'https://youtu.be/abc' });
    const withVideo = node({ video_url: 'https://youtu.be/abc' });
    expect(nodePagePatch(withVideo, { ...formFromNode(withVideo), media: 'none' })).toEqual({ intro_media: 'none' });
  });
  it('an empty text or address is saved as nothing', () => {
    const n = node({ intro_ar: 'قديم', intro_image_url: 'https://x/i.png' });
    expect(nodePagePatch(n, { ...formFromNode(n), introAr: '   ', imageUrl: null })).toEqual({ intro_ar: null, intro_image_url: null });
  });
  it('the numbers are held to what the page can draw', () => {
    const fields = previewFields({ ...formFromNode(node()), fontPx: 999, padRight: -5, padLeft: 9999, stripsLimit: 0 });
    expect(fields).toMatchObject({ intro_font_px: 40, intro_pad_right: 0, intro_pad_left: 240, strips_limit: 1 });
  });
});

describe('problems and the page summary', () => {
  it('a video address must be https', () => {
    expect(nodePageProblems({ ...formFromNode(node()), videoUrl: 'http://x.com/v' }).video).toBeTruthy();
    expect(nodePageProblems({ ...formFromNode(node()), videoUrl: 'https://youtu.be/abc' }).video).toBeUndefined();
    expect(nodePageProblems({ ...formFromNode(node()), videoUrl: '' })).toEqual({});
  });
  it('the books per strip are 1 to 60', () => {
    expect(nodePageProblems({ ...formFromNode(node()), stripsLimit: 0 }).strips).toBeTruthy();
    expect(nodePageProblems({ ...formFromNode(node()), stripsLimit: 61 }).strips).toBeTruthy();
    expect(nodePageProblems({ ...formFromNode(node()), stripsLimit: 12 })).toEqual({});
  });
  it('says what a page has above its books', () => {
    expect(pageSummary(node())).toEqual([]);
    expect(pageSummary(node({ intro_ar: 'x', video_url: 'https://youtu.be/abc' }))).toEqual(['فيديو', 'كلام تعريفي']);
    expect(pageSummary(node({ intro_media: 'image', intro_image_url: 'https://x/i.png' }))).toEqual(['صورة']);
    expect(pageSummary(node({ intro_media: 'none', video_url: 'https://youtu.be/abc' }))).toEqual([]);
  });
});
