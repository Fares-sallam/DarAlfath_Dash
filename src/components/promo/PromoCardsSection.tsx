import { useRef, useState } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, Eye, EyeOff, ImagePlus, Loader2, Megaphone, Moon, Plus, Save, Sun, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Switch } from '@/components/ads/CategoryBarSection';
import {
  uploadPromoImage, useDeletePromoCard, usePromoCards, usePromoSettings, useSavePromoCard, useSavePromoSettings, useSwapPromoCards,
} from '@/hooks/usePromoCards';
import {
  DEFAULT_PROMO_SETTINGS, MAX_BUTTON, MAX_ROTATE_SECONDS, MAX_SUBTITLE, MAX_TITLE, MIN_ROTATE_SECONDS, cardProblems, settingsProblem,
  type PromoCard, type PromoSettings,
} from '@/lib/promoCards';
import LinkPicker from './LinkPicker';
import PromoPreview from './PromoPreview';

const field = 'w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300';

/**
 * "صندوق العروض" — the card (or cards) under the big banner on the app's home screen: words and a button on the right, a
 * picture on the left. Several cards take turns, on their own timer or together with the banner above.
 */
export default function PromoCardsSection() {
  const { data: cards = [], isLoading, isError, error } = usePromoCards();
  const { data: settings = DEFAULT_PROMO_SETTINGS } = usePromoSettings();
  const save = useSavePromoCard();
  const remove = useDeletePromoCard();
  const swap = useSwapPromoCards();
  const [dark, setDark] = useState(false);
  const active = cards.filter((c) => c.is_active);

  const addCard = () =>
    save.mutate({
      title: 'عنوان جديد',
      subtitle: null,
      button_label: null,
      link_url: null,
      sort_order: cards.length ? Math.max(...cards.map((c) => c.sort_order)) + 1 : 0,
      is_active: false,
    });

  return (
    <section className="bg-white rounded-2xl border border-gray-100 p-5 space-y-5" data-testid="promo-section">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-bold text-gray-800 flex items-center gap-2"><Megaphone size={18} className="text-indigo-600" /> صندوق العروض في التطبيق</h2>
          <p className="text-xs text-gray-500 mt-1 leading-relaxed max-w-2xl">
            الكارت اللي بيظهر في الرئيسية تحت البانر الكبير: الكلام والزر على اليمين وصورة على الشمال. تقدر تحط أكتر من كارت وبيتبدّلوا لوحدهم.
            الزر بيفتح أي مكان في التطبيق. الموقع مش بيعرض الصندوق ده.
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-xl bg-gray-100 p-1" role="group" aria-label="وضع المعاينة">
          <button onClick={() => setDark(false)} className={`px-3 py-1.5 rounded-lg text-xs flex items-center gap-1 ${!dark ? 'bg-white shadow text-gray-800' : 'text-gray-500'}`}><Sun size={13} /> فاتح</button>
          <button onClick={() => setDark(true)} className={`px-3 py-1.5 rounded-lg text-xs flex items-center gap-1 ${dark ? 'bg-white shadow text-gray-800' : 'text-gray-500'}`}><Moon size={13} /> داكن</button>
        </div>
      </div>

      <RotationSettings settings={settings} activeCount={active.length} />

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-gray-500">
          {active.length === 0 ? 'مفيش كارت ظاهر: الصندوق مش بيظهر في التطبيق.' : `${active.length} كارت ظاهر في التطبيق.`}
        </p>
        <button onClick={addCard} disabled={save.isPending} className="btn-secondary flex items-center gap-2 disabled:opacity-50">
          <Plus size={15} /> كارت جديد
        </button>
      </div>

      {isLoading ? (
        <div className="py-10 flex justify-center text-gray-400"><Loader2 className="animate-spin" /></div>
      ) : isError ? (
        <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-600 flex items-start gap-2">
          <AlertTriangle size={16} className="mt-0.5" />
          <span>تعذّر تحميل الكروت: {error instanceof Error ? error.message : 'خطأ غير معروف'}</span>
        </div>
      ) : cards.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">لسه مفيش كروت. اضغط «كارت جديد».</p>
      ) : (
        <ul className="space-y-4">
          {cards.map((card, i) => (
            <CardEditor
              key={card.id}
              card={card}
              dark={dark}
              isFirst={i === 0}
              isLast={i === cards.length - 1}
              onMove={(dir) => swap.mutate({ a: card, b: cards[i + dir] })}
              onSave={(patch) => save.mutate({ id: card.id, ...patch })}
              onDelete={() => { if (confirm(`حذف كارت «${card.title || 'من غير عنوان'}» نهائيًا؟`)) remove.mutate(card.id); }}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

/** Seconds per card, and whether the card follows the big banner instead of its own timer. */
function RotationSettings({ settings, activeCount }: { settings: PromoSettings; activeCount: number }) {
  const save = useSavePromoSettings();
  const [seconds, setSeconds] = useState(String(settings.rotate_seconds));
  const [sync, setSync] = useState(settings.sync_with_banner);
  const [seen, setSeen] = useState(settings);
  // Follow the saved values after they load or change (state derived from props, adjusted during render).
  if (seen !== settings) { setSeen(settings); setSeconds(String(settings.rotate_seconds)); setSync(settings.sync_with_banner); }

  const value = Number(seconds);
  const problem = settingsProblem(value);
  const dirty = value !== settings.rotate_seconds || sync !== settings.sync_with_banner;

  return (
    <div className="rounded-xl bg-gray-50 border border-gray-100 p-4 space-y-3" data-testid="promo-settings">
      <p className="text-sm font-semibold text-gray-700">التبديل بين الكروت</p>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <label className="flex items-center gap-2 text-sm text-gray-600">
          كل كارت بيفضل
          <input
            value={seconds}
            onChange={(e) => setSeconds(e.target.value.replace(/[^0-9]/g, ''))}
            inputMode="numeric"
            className={`${field} !w-20 text-center`}
            aria-label="ثواني كل كارت"
            disabled={sync}
          />
          ثانية ({MIN_ROTATE_SECONDS}–{MAX_ROTATE_SECONDS})
        </label>
        <Switch checked={sync} onChange={setSync} label="يتبدّل مع البانر الكبير" />
      </div>
      <p className="text-xs text-gray-500">
        {sync
          ? 'الكارت بيتغيّر في نفس لحظة تغيّر صورة البانر الكبير، فالمؤقت الخاص بيه مقفول. (لازم يكون فيه أكتر من صورة بانر.)'
          : 'الكارت ليه مؤقت لوحده مستقل عن البانر.'}
        {activeCount < 2 && ' التبديل مش بيحصل غير لما يكون فيه كارتين ظاهرين أو أكتر.'}
      </p>
      {problem && <p className="text-xs text-red-500">{problem}</p>}
      {dirty && (
        <button
          onClick={() => save.mutate({ rotate_seconds: problem ? settings.rotate_seconds : value, sync_with_banner: sync })}
          disabled={save.isPending || (!!problem && !sync)}
          className="px-4 py-2 rounded-xl text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 flex items-center gap-1.5"
        >
          {save.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} حفظ إعدادات التبديل
        </button>
      )}
    </div>
  );
}

function CardEditor({
  card, dark, isFirst, isLast, onMove, onSave, onDelete,
}: {
  card: PromoCard;
  dark: boolean;
  isFirst: boolean;
  isLast: boolean;
  onMove: (dir: -1 | 1) => void;
  onSave: (patch: Partial<PromoCard>) => void;
  onDelete: () => void;
}) {
  const [title, setTitle] = useState(card.title);
  const [subtitle, setSubtitle] = useState(card.subtitle ?? '');
  const [buttonLabel, setButtonLabel] = useState(card.button_label ?? '');
  const [link, setLink] = useState<string | null>(card.link_url);
  const [image, setImage] = useState<string | null>(card.image_url);
  const [imageDark, setImageDark] = useState<string | null>(card.image_url_dark);

  const draft = {
    title: title.trim(),
    subtitle: subtitle.trim() || null,
    button_label: buttonLabel.trim() || null,
    link_url: link?.trim() || null,
    image_url: image,
    image_url_dark: imageDark,
  };
  const dirty =
    draft.title !== card.title || draft.subtitle !== card.subtitle || draft.button_label !== card.button_label ||
    draft.link_url !== card.link_url || draft.image_url !== card.image_url || draft.image_url_dark !== card.image_url_dark;
  const problems = cardProblems(draft);
  // What the app shows in dark mode when there is no dark picture: the light one.
  const shownImage = dark ? imageDark ?? image : image ?? imageDark;

  return (
    <li className={`rounded-2xl border p-4 ${card.is_active ? 'border-gray-100 bg-white' : 'border-dashed border-gray-200 bg-gray-50/60'}`} data-testid="promo-card-row">
      <div className="flex items-start gap-3">
        <div className="flex flex-col gap-1">
          <button onClick={() => onMove(-1)} disabled={isFirst} aria-label="نقل لأعلى" className="p-1 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 disabled:opacity-20"><ArrowUp size={14} /></button>
          <button onClick={() => onMove(1)} disabled={isLast} aria-label="نقل لأسفل" className="p-1 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 disabled:opacity-20"><ArrowDown size={14} /></button>
        </div>

        <div className="flex-1 min-w-0 grid grid-cols-1 xl:grid-cols-2 gap-4">
          {/* Fields */}
          <div className="space-y-3 min-w-0">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">العنوان</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={MAX_TITLE + 20} className={field} placeholder="مثلًا: خصم على سلسلة النحو بين يديك" aria-label="عنوان الكارت" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">سطر تحت العنوان (اختياري)</label>
              <textarea value={subtitle} onChange={(e) => setSubtitle(e.target.value)} maxLength={MAX_SUBTITLE + 40} rows={2} className={`${field} resize-none`} aria-label="نص الكارت" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">اسم الزر (اختياري)</label>
              <input value={buttonLabel} onChange={(e) => setButtonLabel(e.target.value)} maxLength={MAX_BUTTON + 10} className={field} placeholder="تسوق الآن" aria-label="اسم الزر" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">الزر (والكارت كله) بيفتح</label>
              <LinkPicker value={link} onChange={setLink} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <ImageSlot label="الصورة (الوضع الفاتح)" value={image} onChange={setImage} />
              <ImageSlot label="الصورة (الداكن، اختيارية)" value={imageDark} onChange={setImageDark} />
            </div>
            <p className="text-[11px] text-gray-400">أنسب مقاس حوالي 600×560 بكسل، وPNG بخلفية شفافة أحسن. لو ما رفعتش صورة داكنة بتتستخدم الفاتحة.</p>
          </div>

          {/* Live preview + actions */}
          <div className="space-y-3 min-w-0">
            <p className="text-xs font-semibold text-gray-500">معاينة ({dark ? 'الوضع الداكن' : 'الوضع الفاتح'})</p>
            <PromoPreview title={title} subtitle={subtitle.trim() || null} buttonLabel={buttonLabel.trim() || null} image={shownImage} dark={dark} />
            {problems.length > 0 && (
              <ul className="space-y-1">
                {problems.map((p) => <li key={p.text} className={`text-xs flex items-start gap-1.5 ${p.blocking ? 'text-red-500' : 'text-amber-600'}`}><AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />{p.text}</li>)}
              </ul>
            )}
          </div>
        </div>

        <div className="flex flex-col items-center gap-1">
          <Switch checked={card.is_active} onChange={(v) => onSave({ is_active: v })} label={card.is_active ? 'إخفاء الكارت' : 'إظهار الكارت'} />
          {card.is_active ? <Eye size={14} className="text-green-600" /> : <EyeOff size={14} className="text-gray-300" />}
          {dirty && (
            <button
              onClick={() => onSave(draft)}
              disabled={problems.some((p) => p.blocking)}
              className="mt-2 p-2 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 disabled:opacity-40"
              aria-label="حفظ الكارت" title="حفظ الكارت"
            >
              <Save size={16} />
            </button>
          )}
          <button onClick={onDelete} className="mt-1 p-2 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50" aria-label="حذف الكارت" title="حذف الكارت"><Trash2 size={16} /></button>
        </div>
      </div>
    </li>
  );
}

function ImageSlot({ label, value, onChange }: { label: string; value: string | null; onChange: (url: string | null) => void }) {
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { toast.error('الصورة لازم تكون JPG أو PNG أو WebP.'); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error('الصورة أكبر من 5MB.'); return; }
    setBusy(true);
    try {
      onChange(await uploadPromoImage(file));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'تعذّر رفع الصورة');
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = '';
    }
  };

  return (
    <div>
      <p className="text-xs font-semibold text-gray-600 mb-1">{label}</p>
      <div className="relative">
        <label className="flex flex-col items-center justify-center gap-1 h-24 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 hover:bg-indigo-50/40 cursor-pointer overflow-hidden">
          {busy ? <Loader2 className="animate-spin text-indigo-400" size={20} /> : value ? (
            <img src={value} alt="" className="w-full h-full object-contain p-1" />
          ) : (
            <><ImagePlus size={20} className="text-indigo-300" /><span className="text-[11px] text-gray-500">رفع صورة</span></>
          )}
          <input ref={ref} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
        </label>
        {value && !busy && (
          <button onClick={() => onChange(null)} className="absolute top-1 left-1 p-1 rounded-full bg-white/90 text-gray-500 hover:text-red-500 shadow" aria-label="شيل الصورة" title="شيل الصورة"><X size={12} /></button>
        )}
      </div>
    </div>
  );
}
