import { useState } from 'react';
import { ArrowDown, ArrowUp, Eye, EyeOff, Loader2, Megaphone, Plus, Save, Trash2 } from 'lucide-react';
import {
  useAnnouncements, useDeleteAnnouncement, useSaveAnnouncement, useSwapOrder, type Announcement,
} from '@/hooks/useAdsStrips';

const field = 'px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300';

/** ISO time to the value a datetime-local field shows (local time), and back. */
const toLocalInput = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fromLocalInput = (value: string) => (value ? new Date(value).toISOString() : null);

/** Where a message stands right now, as the store sees it. */
export function announcementState(a: Pick<Announcement, 'is_active' | 'starts_at' | 'ends_at'>, now = new Date()) {
  if (!a.is_active) return { label: 'مخفية', tone: 'bg-gray-100 text-gray-500' };
  if (a.starts_at && new Date(a.starts_at) > now) return { label: 'مجدولة', tone: 'bg-amber-50 text-amber-700' };
  if (a.ends_at && new Date(a.ends_at) <= now) return { label: 'انتهت', tone: 'bg-red-50 text-red-600' };
  return { label: 'ظاهرة الآن', tone: 'bg-green-50 text-green-700' };
}

export default function AnnouncementsSection() {
  const { data: rows = [], isLoading } = useAnnouncements();
  const save = useSaveAnnouncement();
  const remove = useDeleteAnnouncement();
  const swap = useSwapOrder('site_announcements', 'site-announcements');

  const [message, setMessage] = useState('');
  const [link, setLink] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');

  const datesWrong = Boolean(startsAt && endsAt && new Date(endsAt) <= new Date(startsAt));
  const live = rows.filter((r) => announcementState(r).label === 'ظاهرة الآن');

  const add = async () => {
    if (!message.trim() || datesWrong) return;
    await save.mutateAsync({
      message: message.trim(),
      link_url: link.trim() || null,
      starts_at: fromLocalInput(startsAt),
      ends_at: fromLocalInput(endsAt),
      sort_order: rows.length ? Math.max(...rows.map((r) => r.sort_order)) + 1 : 0,
    });
    setMessage('');
    setLink('');
    setStartsAt('');
    setEndsAt('');
  };

  return (
    <div className="space-y-5">
      {/* What the strip shows right now. */}
      <div className="rounded-2xl overflow-hidden border border-gray-100">
        <p className="text-xs font-semibold text-gray-500 px-4 py-2 bg-gray-50">معاينة الشريط تحت الهيدر</p>
        {live.length ? (
          <div className="bg-gradient-to-l from-[#12448f] to-[#092f6a] text-white text-center text-sm font-bold py-2.5 px-4" data-testid="announcement-preview">
            {live[0].message}
            {live.length > 1 && <span className="opacity-60 font-normal"> · و{live.length - 1} غيرها بالتناوب كل 5 ثواني</span>}
          </div>
        ) : (
          <p className="text-sm text-gray-400 text-center py-3">مفيش رسالة ظاهرة دلوقتي، فالشريط مش ظاهر في الموقع.</p>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
        <h2 className="text-sm font-bold text-gray-700">رسالة جديدة</h2>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={200}
          rows={2}
          placeholder="مثال: شحن مجاني للطلبات فوق 500 جنيه حتى آخر الشهر *"
          className={`${field} w-full resize-none`}
          aria-label="نص الرسالة"
        />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="رابط (اختياري) مثال: /books?sale=1" dir="ltr" className={field} aria-label="رابط الرسالة" />
          <label className="text-xs text-gray-500 flex flex-col gap-1">
            تبدأ من (اختياري)
            <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className={field} />
          </label>
          <label className="text-xs text-gray-500 flex flex-col gap-1">
            تنتهي في (اختياري)
            <input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className={field} />
          </label>
        </div>
        {datesWrong && <p className="text-xs text-red-600">تاريخ النهاية لازم يكون بعد البداية.</p>}
        <button onClick={add} disabled={save.isPending || !message.trim() || datesWrong} className="btn-primary flex items-center gap-2 disabled:opacity-50">
          {save.isPending ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
          إضافة الرسالة
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {isLoading ? (
          <div className="py-12 flex justify-center text-gray-400"><Loader2 className="animate-spin" /></div>
        ) : rows.length === 0 ? (
          <div className="py-12 flex flex-col items-center gap-2 text-gray-400">
            <Megaphone size={26} />
            <p className="text-sm">مفيش رسايل لسه. أضف أول رسالة من فوق.</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-50">
            {rows.map((row, i) => (
              <AnnouncementRow
                key={row.id}
                row={row}
                isFirst={i === 0}
                isLast={i === rows.length - 1}
                onMove={(dir) => swap.mutate({ a: row, b: rows[i + dir] })}
                onSave={(patch) => save.mutate({ id: row.id, ...patch })}
                onDelete={() => { if (confirm('حذف الرسالة دي نهائيًا؟')) remove.mutate(row.id); }}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function AnnouncementRow({
  row, isFirst, isLast, onMove, onSave, onDelete,
}: {
  row: Announcement;
  isFirst: boolean;
  isLast: boolean;
  onMove: (dir: -1 | 1) => void;
  onSave: (patch: Partial<Announcement>) => void;
  onDelete: () => void;
}) {
  const [message, setMessage] = useState(row.message);
  const [link, setLink] = useState(row.link_url ?? '');
  const [startsAt, setStartsAt] = useState(toLocalInput(row.starts_at));
  const [endsAt, setEndsAt] = useState(toLocalInput(row.ends_at));
  const dirty = message !== row.message || link !== (row.link_url ?? '') || startsAt !== toLocalInput(row.starts_at) || endsAt !== toLocalInput(row.ends_at);
  const datesWrong = Boolean(startsAt && endsAt && new Date(endsAt) <= new Date(startsAt));
  const state = announcementState(row);

  return (
    <li className="flex items-start gap-3 px-4 py-3" data-testid="announcement-row">
      <div className="flex flex-col gap-1 pt-1">
        <button onClick={() => onMove(-1)} disabled={isFirst} aria-label="نقل لأعلى" className="p-1 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 disabled:opacity-20"><ArrowUp size={14} /></button>
        <button onClick={() => onMove(1)} disabled={isLast} aria-label="نقل لأسفل" className="p-1 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 disabled:opacity-20"><ArrowDown size={14} /></button>
      </div>
      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex items-center gap-2">
          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${state.tone}`}>{state.label}</span>
        </div>
        <input value={message} onChange={(e) => setMessage(e.target.value)} maxLength={200} aria-label="نص الرسالة" className={`${field} w-full`} />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="رابط (اختياري)" dir="ltr" aria-label="رابط الرسالة" className={field} />
          <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} aria-label="تبدأ من" className={field} />
          <input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} aria-label="تنتهي في" className={field} />
        </div>
        {datesWrong && <p className="text-xs text-red-600">تاريخ النهاية لازم يكون بعد البداية.</p>}
      </div>
      {dirty && (
        <button
          onClick={() => onSave({ message: message.trim(), link_url: link.trim() || null, starts_at: fromLocalInput(startsAt), ends_at: fromLocalInput(endsAt) })}
          disabled={!message.trim() || datesWrong}
          className="p-2 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 disabled:opacity-40"
          aria-label="حفظ" title="حفظ"
        >
          <Save size={16} />
        </button>
      )}
      <button
        onClick={() => onSave({ is_active: !row.is_active })}
        className={`p-2 rounded-lg ${row.is_active ? 'text-green-600 hover:bg-green-50' : 'text-gray-300 hover:bg-gray-100'}`}
        title={row.is_active ? 'مفعّلة — اضغط للإخفاء' : 'مخفية — اضغط للتفعيل'}
        aria-label={row.is_active ? 'إخفاء الرسالة' : 'تفعيل الرسالة'}
      >
        {row.is_active ? <Eye size={17} /> : <EyeOff size={17} />}
      </button>
      <button onClick={onDelete} className="p-2 rounded-lg text-gray-300 hover:text-red-600 hover:bg-red-50" title="حذف" aria-label="حذف الرسالة">
        <Trash2 size={16} />
      </button>
    </li>
  );
}
