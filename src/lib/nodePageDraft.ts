// The look of a node's own page as the «صفحات الأقسام» tab edits it: the picture or video, the welcome text and how it is set.
// Pure helpers (no React, no Supabase).
import type { CatalogNode, IntroAlign, IntroMedia, IntroTextPos, PageLayout } from './catalogTree';

export type MediaChoice = 'none' | 'video' | 'image';

export interface NodePageForm {
  media: MediaChoice;
  videoUrl: string;
  imageUrl: string | null;
  introAr: string;
  introEn: string;
  align: IntroAlign;
  fontPx: number;
  padRight: number;
  padLeft: number;
  textPos: IntroTextPos;
  pageLayout: PageLayout;
  stripsLimit: number;
}

export const FONT_MIN = 12;
export const FONT_MAX = 40;
export const PAD_MAX = 240;
export const DEFAULT_FONT_PX = 16;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(Number.isFinite(value) ? value : min)));

/** 'auto' (the old default) means a video when there is one. */
export function mediaChoiceOf(node: Pick<CatalogNode, 'intro_media' | 'video_url'>): MediaChoice {
  if (node.intro_media === 'auto') return node.video_url?.trim() ? 'video' : 'none';
  return node.intro_media;
}

export function formFromNode(node: CatalogNode): NodePageForm {
  return {
    media: mediaChoiceOf(node),
    videoUrl: node.video_url ?? '',
    imageUrl: node.intro_image_url ?? null,
    introAr: node.intro_ar ?? '',
    introEn: node.intro_en ?? '',
    align: node.intro_align ?? 'right',
    fontPx: node.intro_font_px ?? DEFAULT_FONT_PX,
    padRight: node.intro_pad_right ?? 0,
    padLeft: node.intro_pad_left ?? 0,
    textPos: node.intro_text_pos ?? 'side',
    pageLayout: node.page_layout,
    stripsLimit: node.strips_limit,
  };
}

/** What the website may be shown while this is being edited (its own whitelist re-checks all of it). */
export function previewFields(form: NodePageForm): Partial<CatalogNode> {
  return {
    intro_ar: form.introAr.trim() || null,
    intro_en: form.introEn.trim() || null,
    video_url: form.videoUrl.trim() || null,
    intro_image_url: form.imageUrl,
    intro_media: form.media as IntroMedia,
    intro_align: form.align,
    intro_font_px: clamp(form.fontPx, FONT_MIN, FONT_MAX),
    intro_pad_right: clamp(form.padRight, 0, PAD_MAX),
    intro_pad_left: clamp(form.padLeft, 0, PAD_MAX),
    intro_text_pos: form.textPos,
    page_layout: form.pageLayout,
    strips_limit: clamp(form.stripsLimit, 1, 60),
  };
}

/**
 * The fields to save: only the ones that differ from what the form showed when it was opened (a column the node does not have
 * yet reads as its default). The picture / video choice is written only when it was changed.
 */
export function nodePagePatch(node: CatalogNode, form: NodePageForm): Partial<CatalogNode> {
  const next = previewFields(form) as Record<string, unknown>;
  const before = previewFields(formFromNode(node)) as Record<string, unknown>;
  const patch: Partial<CatalogNode> = {};
  Object.keys(next).forEach((key) => {
    if (key === 'intro_media') return;
    if (before[key] !== next[key]) (patch as Record<string, unknown>)[key] = next[key];
  });
  if (form.media !== mediaChoiceOf(node)) patch.intro_media = form.media;
  return patch;
}

export function nodePageProblems(form: NodePageForm): { video?: string; strips?: string } {
  const out: { video?: string; strips?: string } = {};
  if (form.videoUrl.trim() && !/^https:\/\/\S+$/i.test(form.videoUrl.trim())) out.video = 'رابط الفيديو لازم يبدأ بـ https://';
  if (!Number.isFinite(form.stripsLimit) || form.stripsLimit < 1 || form.stripsLimit > 60) out.strips = 'عدد الكتب في الشريط من 1 لـ 60';
  return out;
}

/** What is on the page above the books, said in a line (for the node list). */
export function pageSummary(node: Pick<CatalogNode, 'intro_ar' | 'intro_media' | 'video_url' | 'intro_image_url'>): string[] {
  const parts: string[] = [];
  const media = mediaChoiceOf(node as Pick<CatalogNode, 'intro_media' | 'video_url'>);
  if (media === 'video' && node.video_url?.trim()) parts.push('فيديو');
  if (media === 'image' && node.intro_image_url) parts.push('صورة');
  if (node.intro_ar?.trim()) parts.push('كلام تعريفي');
  return parts;
}
