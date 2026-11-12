import { useState } from 'react';
import { Gift, Loader2, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { useDeleteShippingOffer, useSaveShippingOffer, useShippingOffers } from '@/hooks/useShippingOffers';
import {
  CHANNEL_LABELS, currentOffer, offerFormError, offerState, type OfferChannel, type ShippingOffer,
} from '@/lib/shippingOffers';
import { useCountry } from '@/contexts/CountryContext';

const field = 'w-full px-3 py-2 rounded-xl border border-gray-200 focus:border-blue-400 focus:ring-1 focus:ring-blue-200 outline-none text-sm bg-white';

const toLocalInput = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fromLocalInput = (value: string) => (value ? new Date(value).toISOString() : null);
const dateLabel = (iso: string) =>
  new Date(iso).toLocaleString('ar-EG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

const STATE_BADGE = {
  live: { label: 'شغال الآن', tone: 'bg-green-50 text-green-700' },
  scheduled: { label: 'مجدول', tone: 'bg-amber-50 text-amber-700' },
  ended: { label: 'انتهى', tone: 'bg-red-50 text-red-600' },
  off: { label: 'مقفول', tone: 'bg-gray-100 text-gray-500' },
} as const;

type Draft = { id?: string; title: string; min_subtotal: string; channel: OfferChannel; starts_at: string; ends_at: string; is_active: boolean };
const emptyDraft: Draft = { title: 'شحن مجاني', min_subtotal: '', channel: 'all', starts_at: '', ends_at: '', is_active: true };

/** Free-shipping offers: a minimum order, for the website, the app or both, with optional dates. */
export default function ShippingOffersSection() {
  const { currencySymbol } = useCountry();
  const { data: offers = [], isLoading, isError, error } = useShippingOffers();
  const save = useSaveShippingOffer();
  const remove = useDeleteShippingOffer();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const web = currentOffer(offers, 'web');
  const app = currentOffer(offers, 'app');
  const money = (n: number) => `${n.toLocaleString('ar-EG')} ${currencySymbol}`;

  const edit = (o: ShippingOffer) => {
    setFormError(null);
    setDraft({
      id: o.id, title: o.title, min_subtotal: String(o.min_subtotal), channel: o.channel,
      starts_at: toLocalInput(o.starts_at), ends_at: toLocalInput(o.ends_at), is_active: o.is_active,
    });
  };

  const submit = async () => {
    if (!draft) return;
    const starts = fromLocalInput(draft.starts_at);
    const ends = fromLocalInput(draft.ends_at);
    const problem = offerFormError({ min_subtotal: draft.min_subtotal, starts_at: starts, ends_at: ends });
    if (problem) { setFormError(problem); return; }
    await save.mutateAsync({
      id: draft.id,
      title: draft.title.trim() || 'شحن مجاني',
      min_subtotal: Number(draft.min_subtotal),
      channel: draft.channel,
      starts_at: starts,
      ends_at: ends,
      is_active: draft.is_active,
    });
    setDraft(null);
  };

  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm mb-6 border border-emerald-100" data-testid="shipping-offers">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-emerald-50"><Gift size={18} className="text-emerald-600" /></div>
          <div>
            <h3 className="font-bold text-gray-800">عروض الشحن المجاني</h3>
            <p className="text-xs text-gray-500">
              لكل عرض أقل مبلغ للطلب، وتختار هو للموقع أو التطبيق أو الاتنين. لو فيه أكتر من عرض شغال، العميل بياخد الأقل. لمصر فقط.
            </p>
          </div>
        </div>
        {!draft && (
          <button onClick={() => { setFormError(null); setDraft({ ...emptyDraft }); }} className="btn-primary flex items-center gap-2">
            <Plus size={15} /> عرض جديد
          </button>
        )}
      </div>

      {/* What each channel gets right now */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        {([['الموقع', web], ['التطبيق', app]] as const).map(([label, offer]) => (
          <div key={label} className={`rounded-xl px-4 py-3 text-sm ${offer ? 'bg-emerald-50 text-emerald-800' : 'bg-gray-50 text-gray-500'}`}>
            <span className="font-bold">{label}: </span>
            {offer ? <>شحن مجاني فوق <b>{money(offer.min_subtotal)}</b>{offer.ends_at ? ` (لحد ${dateLabel(offer.ends_at)})` : ''}</> : 'مفيش شحن مجاني دلوقتي'}
          </div>
        ))}
      </div>

      {draft && (
        <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 mb-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="text-xs font-semibold text-gray-600">اسم العرض (لك أنت)
              <input className={`${field} mt-1`} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            </label>
            <label className="text-xs font-semibold text-gray-600">أقل مبلغ للطلب ({currencySymbol})
              <input type="number" min="0" step="any" className={`${field} mt-1`} value={draft.min_subtotal}
                onChange={(e) => setDraft({ ...draft, min_subtotal: e.target.value })} placeholder="500" />
            </label>
            <label className="text-xs font-semibold text-gray-600">العرض لـ
              <select className={`${field} mt-1`} value={draft.channel} onChange={(e) => setDraft({ ...draft, channel: e.target.value as OfferChannel })}>
                {(Object.keys(CHANNEL_LABELS) as OfferChannel[]).map((c) => <option key={c} value={c}>{CHANNEL_LABELS[c]}</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold text-gray-600">يبدأ (اختياري)
              <input type="datetime-local" className={`${field} mt-1`} value={draft.starts_at} onChange={(e) => setDraft({ ...draft, starts_at: e.target.value })} />
            </label>
            <label className="text-xs font-semibold text-gray-600">ينتهي (اختياري)
              <input type="datetime-local" className={`${field} mt-1`} value={draft.ends_at} onChange={(e) => setDraft({ ...draft, ends_at: e.target.value })} />
            </label>
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 self-end pb-2">
              <input type="checkbox" checked={draft.is_active} onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })} />
              شغال
            </label>
          </div>
          {formError && <p className="text-xs text-red-600 font-semibold">{formError}</p>}
          <div className="flex gap-2">
            <button onClick={submit} disabled={save.isPending} className="btn-primary flex items-center gap-2">
              {save.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} حفظ العرض
            </button>
            <button onClick={() => setDraft(null)} className="flex items-center gap-1 px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-white">
              <X size={14} /> إلغاء
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="py-8 flex justify-center text-gray-400"><Loader2 className="animate-spin" /></div>
      ) : isError ? (
        <p className="text-sm text-red-600">تعذّر تحميل العروض: {error instanceof Error ? error.message : 'خطأ غير معروف'}</p>
      ) : offers.length === 0 ? (
        <p className="text-sm text-gray-400 py-4 text-center">مفيش عروض شحن. أضف عرض عشان يظهر شريط الشحن المجاني في السلة.</p>
      ) : (
        <ul className="divide-y divide-gray-50">
          {offers.map((o) => {
            const st = STATE_BADGE[offerState(o)];
            return (
              <li key={o.id} className="flex items-center gap-3 py-3 flex-wrap">
                <span className={`px-2 py-1 rounded-lg text-xs font-semibold ${st.tone}`}>{st.label}</span>
                <div className="flex-1 min-w-[180px]">
                  <p className="text-sm font-bold text-gray-800">{o.title} · فوق {money(o.min_subtotal)}</p>
                  <p className="text-xs text-gray-500">
                    {CHANNEL_LABELS[o.channel]}
                    {o.starts_at ? ` · من ${dateLabel(o.starts_at)}` : ''}
                    {o.ends_at ? ` · لحد ${dateLabel(o.ends_at)}` : ' · من غير تاريخ نهاية'}
                  </p>
                </div>
                <button onClick={() => save.mutate({ ...o, is_active: !o.is_active })} className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50">
                  {o.is_active ? 'إيقاف' : 'تشغيل'}
                </button>
                <button onClick={() => edit(o)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500" aria-label={`تعديل ${o.title}`}><Pencil size={14} /></button>
                <button
                  onClick={() => { if (window.confirm('حذف العرض نهائيًا؟')) remove.mutate(o.id); }}
                  className="p-2 rounded-lg hover:bg-red-50 text-red-500" aria-label={`حذف ${o.title}`}
                ><Trash2 size={14} /></button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
