import { useRef } from 'react';
import {
  AlertCircle, ArrowDown, ArrowUp, ChevronDown, Copy, Eye, EyeOff, GripVertical, Heading as HeadingIcon,
  Image as ImageIcon, Link2, Minus, Tag, Trash2, Type,
} from 'lucide-react';
import {
  BLOCK_KIND_LABEL, DIVIDER_LENGTH_LABEL, DIVIDER_TYPE_LABEL, blockStatus, resolveLook, validateBlock,
  type BlockKind, type BlockStatus, type LinksBlock,
} from '@/lib/linksPage';
import { LinkIcon } from '../linkIcons';
import BlockEditor from './BlockEditor';

const KIND_ICON: Record<BlockKind, typeof Link2> = {
  link: Link2, offer: Tag, image: ImageIcon, heading: HeadingIcon, text: Type, divider: Minus,
};

const STATUS: Record<BlockStatus, { label: string; tone: string }> = {
  live: { label: 'ظاهر', tone: 'bg-green-50 text-green-700' },
  hidden: { label: 'مخفي', tone: 'bg-gray-100 text-gray-500' },
  scheduled: { label: 'مجدول', tone: 'bg-amber-50 text-amber-700' },
  ended: { label: 'انتهى', tone: 'bg-red-50 text-red-600' },
};

/** What a block is called in the list: its main line and a quieter one under it. */
export function describeBlock(b: LinksBlock): { title: string; sub: string } {
  const look = resolveLook(b.kind, b.look);
  switch (b.kind) {
    case 'link':
      return { title: b.title.trim() || 'رابط من غير عنوان', sub: (b.url ?? '').trim() || 'لسه من غير رابط' };
    case 'offer':
      return { title: b.title.trim() || 'عرض من غير عنوان', sub: [b.badge, b.coupon_code && `كود ${b.coupon_code}`].filter(Boolean).join(' · ') || 'عرض' };
    case 'image':
      return { title: b.title.trim() || 'صورة', sub: b.image_url ? 'صورة مرفوعة' : 'لسه من غير صورة' };
    case 'heading':
      return { title: b.title.trim() || 'عنوان فاضي', sub: 'عنوان' };
    case 'text':
      return { title: b.body.trim().split('\n')[0].slice(0, 70) || 'نص فاضي', sub: 'نص' };
    case 'divider':
      return { title: DIVIDER_TYPE_LABEL[look.dividerType], sub: `فاصل ${DIVIDER_LENGTH_LABEL[look.dividerLength]}` };
  }
}

export interface DragProps {
  /** Where a dragged block would land relative to this one, while one is over it. */
  mark: 'before' | 'after' | null;
  dragging: boolean;
  onHandleDragStart: (event: React.DragEvent, row: HTMLElement | null) => void;
  onDragOver: (event: React.DragEvent) => void;
  onDrop: (event: React.DragEvent) => void;
  onDragEnd: () => void;
}

interface Props {
  block: LinksBlock;
  index: number;
  count: number;
  open: boolean;
  onToggleOpen: () => void;
  onChange: (patch: Partial<LinksBlock>) => void;
  onMove: (dir: -1 | 1) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  drag: DragProps;
}

const iconBtn = 'p-2 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 disabled:opacity-25 disabled:hover:bg-transparent disabled:hover:text-gray-400';

/** One block in the list: its summary and quick actions, and its editor when opened. */
export default function BlockCard({ block, index, count, open, onToggleOpen, onChange, onMove, onDuplicate, onDelete, drag }: Props) {
  const row = useRef<HTMLLIElement>(null);
  const KindIcon = KIND_ICON[block.kind];
  const { title, sub } = describeBlock(block);
  const status = STATUS[blockStatus(block)];
  const problems = validateBlock(block);
  const name = BLOCK_KIND_LABEL[block.kind];

  return (
    <li
      ref={row}
      id={`links-block-${block.id}`}
      data-testid="links-block"
      data-kind={block.kind}
      onDragOver={drag.onDragOver}
      onDrop={drag.onDrop}
      className={`relative rounded-2xl border bg-white transition-shadow ${open ? 'border-indigo-200 shadow-sm' : 'border-gray-100'} ${drag.dragging ? 'opacity-40' : ''} ${block.is_active ? '' : 'bg-gray-50/70'}`}
    >
      {drag.mark && (
        <span
          aria-hidden
          className={`absolute inset-x-3 h-1 rounded-full bg-indigo-500 ${drag.mark === 'before' ? '-top-[3px]' : '-bottom-[3px]'}`}
        />
      )}

      <div className="flex flex-wrap sm:flex-nowrap items-center gap-x-1.5 gap-y-0 pl-2 pr-1.5 py-2">
        <span
          draggable
          onDragStart={(e) => drag.onHandleDragStart(e, row.current)}
          onDragEnd={drag.onDragEnd}
          className="p-1.5 text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing touch-none hidden sm:block"
          title="اسحب لتغيير الترتيب"
          aria-hidden
        >
          <GripVertical size={16} />
        </span>

        <button type="button" onClick={onToggleOpen} aria-expanded={open} className="flex-1 basis-[12rem] min-w-0 flex items-center gap-3 text-right py-1">
          <span className="w-6 text-center text-xs font-bold text-gray-300 flex-shrink-0">{index + 1}</span>
          <span className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${block.is_active ? 'bg-indigo-50 text-indigo-600' : 'bg-gray-100 text-gray-400'}`}>
            {block.kind === 'link' && block.icon ? <LinkIcon name={block.icon} size={17} /> : <KindIcon size={17} />}
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-bold text-gray-800 truncate">{title}</span>
            <span className="block text-[11px] text-gray-400 truncate">
              {name} · {block.kind === 'link' ? <bdi dir="ltr">{sub}</bdi> : sub}
            </span>
          </span>
        </button>

        {problems.length > 0 && (
          <span className="hidden sm:flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-600" title={problems.join('، ')}>
            <AlertCircle size={12} /> ناقص
          </span>
        )}
        <span className={`hidden sm:inline text-[11px] font-bold px-2 py-0.5 rounded-full ${status.tone}`}>{status.label}</span>

        <div className="flex items-center mr-auto sm:mr-0">
          <button type="button" onClick={() => onMove(-1)} disabled={index === 0} className={iconBtn} aria-label={`نقل ${name} لأعلى`} title="لأعلى"><ArrowUp size={15} /></button>
          <button type="button" onClick={() => onMove(1)} disabled={index === count - 1} className={iconBtn} aria-label={`نقل ${name} لأسفل`} title="لأسفل"><ArrowDown size={15} /></button>
          <button
            type="button"
            onClick={() => onChange({ is_active: !block.is_active })}
            className={`p-2 rounded-lg ${block.is_active ? 'text-green-600 hover:bg-green-50' : 'text-gray-300 hover:bg-gray-100'}`}
            aria-label={block.is_active ? `إخفاء ${name}` : `إظهار ${name}`}
            title={block.is_active ? 'ظاهر: اضغط للإخفاء' : 'مخفي: اضغط للإظهار'}
          >
            {block.is_active ? <Eye size={16} /> : <EyeOff size={16} />}
          </button>
          <button type="button" onClick={onDuplicate} className={`${iconBtn} hidden sm:block`} aria-label={`نسخ ${name}`} title="نسخ العنصر"><Copy size={15} /></button>
          <button
            type="button"
            onClick={onDelete}
            className="p-2 rounded-lg text-gray-300 hover:text-red-600 hover:bg-red-50"
            aria-label={`حذف ${name}`}
            title="حذف"
          >
            <Trash2 size={15} />
          </button>
          <button type="button" onClick={onToggleOpen} className={iconBtn} aria-label={open ? 'إغلاق التعديل' : 'فتح التعديل'}>
            <ChevronDown size={16} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-gray-100 px-4 py-4">
          {problems.length > 0 && (
            <ul className="mb-4 space-y-1 rounded-xl bg-red-50 border border-red-100 px-3 py-2.5" role="alert">
              {problems.map((p) => (
                <li key={p} className="text-xs text-red-700 font-medium flex items-start gap-1.5"><AlertCircle size={13} className="mt-0.5 flex-shrink-0" />{p}</li>
              ))}
            </ul>
          )}
          <BlockEditor block={block} onChange={onChange} />
        </div>
      )}
    </li>
  );
}
