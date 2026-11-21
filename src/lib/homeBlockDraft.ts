// The form for adding or editing a block of the home page, as plain data: what is typed (strings, lists) turned into a
// block (and back), with the checks that stop a bad one being saved. Pure, so it is tested without a screen.
import {
  BOOK_SHELF_KIND, DEFAULT_LOOK, FILTER_SHELF_KIND, PROMO_KIND, blockDefaults, blockProblem, bookShelfIds, configFor, filterSourceOf, lookFieldsFor, lookOf,
  normalizeLook, promoOf, withLook,
  type BlockKind, type BlockLook, type Devices, type FilterSource, type HomeBlock, type HomeBlockKey, type HomeChannel, type PromoTone,
} from '@/lib/homeBlocks';
import { SHELF_KIND, parseShelfLimit, shelfKeyFor } from '@/lib/homeShelves';

export interface BlockDraft {
  /** the saved block's key; null while it is being added */
  key: string | null;
  kind: BlockKind;
  std: HomeBlockKey | null;
  nodeId: string;
  title: string;
  subtitle: string;
  limit: string;
  /** a «datetime-local» value (the owner's own clock) or '' */
  startsAt: string;
  endsAt: string;
  countries: string[];
  devices: Devices;
  productIds: string[];
  source: FilterSource;
  imageUrl: string | null;
  linkUrl: string | null;
  buttonLabel: string;
  tone: PromoTone;
  /** the block's look (layout, band, divider, link) */
  look: BlockLook;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** An ISO time as the value of a «datetime-local» input, in the viewer's own time zone. */
export function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** The value of a «datetime-local» input as an ISO time (null when empty or not a date). */
export function fromLocalInput(value: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** A blank form for a new block of a kind. */
export function newDraft(kind: Exclude<BlockKind, 'standard'>): BlockDraft {
  return {
    key: null, kind, std: null, nodeId: '', title: '', subtitle: '', limit: '', startsAt: '', endsAt: '', countries: [], devices: 'all',
    productIds: [], source: 'newest', imageUrl: null, linkUrl: null, buttonLabel: '', tone: 'light', look: DEFAULT_LOOK,
  };
}

export function draftFromBlock(block: HomeBlock): BlockDraft {
  const promo = promoOf(block.config);
  return {
    key: block.key, kind: block.kind, std: block.std, nodeId: block.nodeId ?? '', title: block.title ?? '', subtitle: block.subtitle ?? '',
    limit: block.limit != null ? String(block.limit) : '',
    startsAt: toLocalInput(block.window.startsAt), endsAt: toLocalInput(block.window.endsAt), countries: block.window.countries ?? [], devices: block.window.devices,
    productIds: bookShelfIds(block.config), source: filterSourceOf(block.config),
    imageUrl: promo.imageUrl, linkUrl: promo.linkUrl, buttonLabel: promo.buttonLabel ?? '', tone: promo.tone, look: lookOf(block.config),
  };
}

/** Which of the three texts a form shows for a block: a standard block says so itself, the owner's kinds have their own set. */
export function fieldsFor(draft: Pick<BlockDraft, 'kind' | 'std'>, channel: HomeChannel): ('title' | 'subtitle' | 'limit')[] {
  if (draft.std) return blockDefaults(draft.std, channel).editable;
  if (draft.kind === PROMO_KIND) return ['title', 'subtitle'];
  return ['title', 'subtitle', 'limit'];
}

export type DraftResult = { ok: true; block: HomeBlock } | { ok: false; problem: string };

/**
 * The block a form describes, or what is wrong with it. `base` is the block being edited (null when adding); what a form
 * does not show (a standard block's texts that can't be edited, a category shelf's node) is kept from it.
 */
export function blockFromDraft(draft: BlockDraft, base: HomeBlock | null, channel: HomeChannel, order: number): DraftResult {
  const fields = fieldsFor(draft, channel);
  const parsed = parseShelfLimit(draft.limit);
  if (fields.includes('limit') && parsed === 'invalid') return { ok: false, problem: 'العدد رقم من 1 لـ60، أو سيبه فاضي.' };
  if (draft.kind === SHELF_KIND && !draft.nodeId) return { ok: false, problem: 'اختار التصنيف أو السلسلة الأول.' };
  const limit = fields.includes('limit') && parsed !== 'invalid' ? parsed : base?.limit ?? null;
  const picked = draft.kind === BOOK_SHELF_KIND ? bookShelfIds({ product_ids: draft.productIds }) : [];
  if (draft.kind === BOOK_SHELF_KIND && draft.productIds.length > 0 && picked.length === 0) return { ok: false, problem: 'الكتب المختارة مش مقروءة، اختارها تاني.' };

  const isCustom = draft.kind === BOOK_SHELF_KIND || draft.kind === FILTER_SHELF_KIND || draft.kind === PROMO_KIND;
  const look = normalizeLook(draft.look, lookFieldsFor({ std: draft.std, kind: draft.kind }, channel));
  if (look.linkLabel && look.linkLabel.length > 24) return { ok: false, problem: 'كلمة الرابط أطول من 24 حرف.' };
  if (look.linkUrl && !(look.linkUrl.startsWith('/') && !look.linkUrl.startsWith('//'))) return { ok: false, problem: 'وجهة الرابط لازم تكون صفحة جوه التطبيق (تبدأ بـ / ).' };
  const config = withLook(
    isCustom
      ? configFor(draft.kind, {
          productIds: picked,
          source: draft.source,
          promo: { imageUrl: draft.imageUrl, linkUrl: draft.linkUrl, buttonLabel: draft.buttonLabel, tone: draft.tone },
        })
      : base?.config ?? {},
    look,
  );
  const block: HomeBlock = {
    key: draft.key ?? '',
    std: draft.std,
    kind: draft.kind,
    config,
    window: {
      startsAt: fromLocalInput(draft.startsAt),
      endsAt: fromLocalInput(draft.endsAt),
      countries: channel === 'web' && draft.countries.length > 0 ? [...new Set(draft.countries.map((c) => c.toUpperCase()))].sort() : null,
      devices: channel === 'web' ? draft.devices : 'all',
    },
    nodeId: draft.kind === SHELF_KIND || draft.kind === FILTER_SHELF_KIND ? draft.nodeId || null : null,
    title: fields.includes('title') ? draft.title.trim() || null : base?.title ?? null,
    subtitle: fields.includes('subtitle') ? draft.subtitle.trim() || null : base?.subtitle ?? null,
    limit,
    visible: base?.visible ?? true,
    sortOrder: base?.sortOrder ?? order,
    saved: base?.saved ?? false,
  };
  if (draft.startsAt && !block.window.startsAt) return { ok: false, problem: 'تاريخ البداية مش مفهوم.' };
  if (draft.endsAt && !block.window.endsAt) return { ok: false, problem: 'تاريخ النهاية مش مفهوم.' };
  const problem = blockProblem(block);
  return problem ? { ok: false, problem } : { ok: true, block };
}

/** The key a block gets while it is only a draft in the preview (a category shelf's is its own, the others get a placeholder). */
export const DRAFT_KEY = 'block:draft-preview';

/**
 * The blocks as they would be if the open form were saved: the block being edited replaced, or a new one added at the end.
 * A form that can't be saved yet (a problem) leaves the blocks as they are. `focus` is the key the preview should scroll to.
 */
export function blocksWithDraft(blocks: readonly HomeBlock[], draft: BlockDraft | null, channel: HomeChannel): { blocks: HomeBlock[]; focus: string | null } {
  if (!draft) return { blocks: [...blocks], focus: null };
  const base = draft.key ? blocks.find((b) => b.key === draft.key) ?? null : null;
  const made = blockFromDraft(draft, base, channel, blocks.length);
  if ('problem' in made) return { blocks: [...blocks], focus: draft.key };
  if (draft.key !== null) return { blocks: blocks.map((b) => (b.key === draft.key ? { ...made.block, key: b.key } : b)), focus: draft.key };
  const key = draft.kind === SHELF_KIND ? shelfKeyFor(draft.nodeId) : DRAFT_KEY;
  return { blocks: [...blocks, { ...made.block, key }], focus: key };
}
