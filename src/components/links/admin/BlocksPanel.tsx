import { useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { Heading as HeadingIcon, Image as ImageIcon, Layers, Link2, Minus, Plus, Tag, Type } from 'lucide-react';
import { BLOCK_KIND_LABEL, LINK_PRESETS, makeBlock, type BlockKind, type LinkPreset, type LinksBlock } from '@/lib/linksPage';
import { LinkIcon } from '../linkIcons';
import BlockCard, { describeBlock } from './BlockCard';

const KIND_BUTTONS: { kind: BlockKind; icon: typeof Link2; hint: string }[] = [
  { kind: 'link', icon: Link2, hint: 'زر لأي رابط' },
  { kind: 'offer', icon: Tag, hint: 'كارت عرض بكود خصم' },
  { kind: 'image', icon: ImageIcon, hint: 'بنر أو صورة' },
  { kind: 'heading', icon: HeadingIcon, hint: 'عنوان قسم' },
  { kind: 'text', icon: Type, hint: 'فقرة كلام' },
  { kind: 'divider', icon: Minus, hint: 'فاصل أو مسافة' },
];

const PRESET_GROUPS: { key: LinkPreset['group']; label: string }[] = [
  { key: 'social', label: 'حسابات التواصل الاجتماعي' },
  { key: 'store', label: 'المتجر والتطبيق' },
  { key: 'contact', label: 'الموقع والتواصل' },
];

interface Props {
  blocks: LinksBlock[];
  setBlocks: Dispatch<SetStateAction<LinksBlock[]>>;
  openId: string | null;
  setOpenId: (id: string | null) => void;
}

/** The page's blocks, in order: add, edit, move (arrows or dragging), hide, copy and delete. */
export default function BlocksPanel({ blocks, setBlocks, openId, setOpenId }: Props) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<{ id: string; after: boolean } | null>(null);
  // The same two, kept in step synchronously: a drop can come before the last dragover has been drawn.
  const dragRef = useRef<string | null>(null);
  const overRef = useRef<{ id: string; after: boolean } | null>(null);
  const setDrag = (id: string | null) => { dragRef.current = id; setDragId(id); };
  const setOverAt = (next: { id: string; after: boolean } | null) => { overRef.current = next; setOver(next); };

  const reveal = (id: string) => {
    setOpenId(id);
    // after the list has drawn the new row
    window.setTimeout(() => document.getElementById(`links-block-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
  };

  const add = (kind: BlockKind, patch: Partial<LinksBlock> = {}) => {
    const block = makeBlock(kind, patch);
    setBlocks((list) => [...list, block]);
    reveal(block.id);
  };

  const update = (id: string, patch: Partial<LinksBlock>) =>
    setBlocks((list) => list.map((b) => (b.id === id ? { ...b, ...patch } : b)));

  const move = (index: number, dir: -1 | 1) =>
    setBlocks((list) => {
      const target = index + dir;
      if (target < 0 || target >= list.length) return list;
      const next = [...list];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const duplicate = (index: number) => {
    const { id: _sourceId, ...rest } = blocks[index];
    const copy = makeBlock(rest.kind, { ...rest, look: { ...rest.look } });
    setBlocks((list) => [...list.slice(0, index + 1), copy, ...list.slice(index + 1)]);
    reveal(copy.id);
  };

  const remove = (block: LinksBlock) => {
    if (!confirm(`حذف «${describeBlock(block).title}» من الصفحة؟ (بيتشال لما تحفظ)`)) return;
    setBlocks((list) => list.filter((b) => b.id !== block.id));
    if (openId === block.id) setOpenId(null);
  };

  const drop = () => {
    const from = dragRef.current;
    const target = overRef.current;
    if (from && target && from !== target.id) {
      setBlocks((list) => {
        const fromAt = list.findIndex((b) => b.id === from);
        if (fromAt < 0) return list;
        const next = [...list];
        const [moved] = next.splice(fromAt, 1);
        const at = next.findIndex((b) => b.id === target.id);
        if (at < 0) return list;
        next.splice(target.after ? at + 1 : at, 0, moved);
        return next;
      });
    }
    setDrag(null);
    setOverAt(null);
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-4">
        <div>
          <h2 className="text-sm font-bold text-gray-700 flex items-center gap-2"><Plus size={15} className="text-indigo-500" /> إضافة عنصر</h2>
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {KIND_BUTTONS.map(({ kind, icon: Icon, hint }) => (
              <button
                key={kind}
                type="button"
                onClick={() => add(kind)}
                data-testid={`add-${kind}`}
                className="flex flex-col items-center gap-1 rounded-xl border border-gray-200 bg-white px-2 py-3 text-center hover:border-indigo-300 hover:bg-indigo-50/50 transition-colors"
              >
                <Icon size={18} className="text-indigo-600" />
                <span className="text-sm font-bold text-gray-700">{BLOCK_KIND_LABEL[kind]}</span>
                <span className="text-[10.5px] text-gray-400 leading-tight">{hint}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="border-t border-gray-100 pt-3 space-y-3">
          <h3 className="text-xs font-bold text-gray-500 flex items-center gap-1.5"><Layers size={13} /> إضافة سريعة (بتجهّز الأيقونة والعنوان وانت تكتب الرابط بس)</h3>
          {PRESET_GROUPS.map((group) => (
            <div key={group.key} className="space-y-1.5">
              <span className="block text-[11px] font-semibold text-gray-400">{group.label}</span>
              <div className="flex flex-wrap gap-1.5">
                {LINK_PRESETS.filter((p) => p.group === group.key).map((preset) => (
                  <button
                    key={preset.key}
                    type="button"
                    onClick={() => add('link', preset.patch)}
                    data-testid={`preset-${preset.key}`}
                    className="flex items-center gap-1.5 pl-3 pr-2.5 py-1.5 rounded-full border border-gray-200 bg-white text-xs font-semibold text-gray-600 hover:border-indigo-300 hover:text-indigo-700 transition-colors"
                  >
                    <LinkIcon name={preset.patch.icon} size={14} />
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {blocks.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-gray-200 py-12 flex flex-col items-center gap-2 text-gray-400">
          <Layers size={26} />
          <p className="text-sm">الصفحة فاضية. ضيف أول عنصر من فوق.</p>
        </div>
      ) : (
        <ul className="space-y-2.5" data-testid="links-blocks">
          {blocks.map((block, i) => (
            <BlockCard
              key={block.id}
              block={block}
              index={i}
              count={blocks.length}
              open={openId === block.id}
              onToggleOpen={() => setOpenId(openId === block.id ? null : block.id)}
              onChange={(patch) => update(block.id, patch)}
              onMove={(dir) => move(i, dir)}
              onDuplicate={() => duplicate(i)}
              onDelete={() => remove(block)}
              drag={{
                dragging: dragId === block.id,
                mark: over?.id === block.id && dragId !== block.id ? (over.after ? 'after' : 'before') : null,
                onHandleDragStart: (event, row) => {
                  setDrag(block.id);
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData('text/plain', block.id);
                  if (row) event.dataTransfer.setDragImage(row, 24, 24);
                },
                onDragOver: (event) => {
                  if (!dragRef.current) return;
                  event.preventDefault();
                  const rect = event.currentTarget.getBoundingClientRect();
                  const after = event.clientY > rect.top + rect.height / 2;
                  const now = overRef.current;
                  if (now?.id !== block.id || now.after !== after) setOverAt({ id: block.id, after });
                },
                onDrop: (event) => {
                  event.preventDefault();
                  drop();
                },
                onDragEnd: () => {
                  setDrag(null);
                  setOverAt(null);
                },
              }}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
