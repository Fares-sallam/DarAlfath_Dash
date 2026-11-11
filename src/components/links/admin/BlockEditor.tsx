import {
  ALIGN_LABEL, DIVIDER_LENGTHS, DIVIDER_LENGTH_LABEL, SIZES, SIZE_LABEL, URL_RULE, classifyUrl, ltr, normalizeUrlInput, resolveLook,
  type Align, type DividerLength, type LinkDisplay, type LinksBlock,
} from '@/lib/linksPage';
import { Switch } from '@/components/ads/CategoryBarSection';
import {
  ColorPicker, DividerTypePicker, Field, IconPicker, ImageField, ScheduleFields, Segmented, field,
} from './ui';

type Patch = Partial<LinksBlock>;

const URL_HINT = URL_RULE;

/** "تلقائي" lets the page decide: another site opens in a new tab, a page of the store in the same one. */
const NEW_TAB_OPTIONS = [
  { key: 'auto', label: 'تلقائي' },
  { key: 'new', label: 'تبويب جديد' },
  { key: 'same', label: 'نفس التبويب' },
] as const;

/** The fields of one block, by kind. Edits go up as small patches; `look` carries the colour/size/alignment choices. */
export default function BlockEditor({ block, onChange }: { block: LinksBlock; onChange: (patch: Patch) => void }) {
  const look = resolveLook(block.kind, block.look);
  const setLook = (patch: Record<string, unknown>) => onChange({ look: { ...block.look, ...patch } });
  const urlProblem = (value: string | null) => (value && !classifyUrl(value) ? `الرابط مش صالح. ${URL_RULE}` : null);

  const newTabValue = look.newTab === null ? 'auto' : look.newTab ? 'new' : 'same';
  const NewTab = (
    <Field label="طريقة الفتح" hint="التلقائي: الموقع الخارجي بيفتح في تبويب جديد، وصفحات المتجر في نفس التبويب.">
      <Segmented
        label="طريقة الفتح"
        value={newTabValue}
        options={[...NEW_TAB_OPTIONS]}
        onChange={(k) => setLook({ newTab: k === 'auto' ? undefined : k === 'new' })}
      />
    </Field>
  );

  const Schedule = (
    <Field label="جدولة الظهور" hint="سيبهم فاضيين لو العنصر يفضل ظاهر على طول.">
      <ScheduleFields startsAt={block.starts_at} endsAt={block.ends_at} onChange={onChange} />
    </Field>
  );

  const Visible = (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-gray-50 border border-gray-100 px-3 py-2.5">
      <span className="text-xs font-semibold text-gray-600">إظهار العنصر في الصفحة</span>
      <Switch checked={block.is_active} label="إظهار العنصر في الصفحة" onChange={(next) => onChange({ is_active: next })} />
    </div>
  );

  switch (block.kind) {
    case 'link':
      return (
        <div className="space-y-4">
          <Field label="شكل العرض">
            <Segmented<LinkDisplay>
              label="شكل العرض"
              value={look.display}
              options={[{ key: 'button', label: 'زر كامل' }, { key: 'icon', label: 'أيقونة فقط' }]}
              onChange={(display) => setLook({ display })}
            />
            {look.display === 'icon' && (
              <span className="text-[11px] text-gray-400">الأيقونات اللي جنب بعض بتتجمّع في صف واحد (زي حسابات السوشيال).</span>
            )}
          </Field>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label={look.display === 'icon' ? 'اسم الحساب' : 'العنوان'} hint={look.display === 'icon' ? 'بيظهر لما حد يقف على الأيقونة.' : undefined}>
              <input value={block.title} onChange={(e) => onChange({ title: e.target.value })} maxLength={160} placeholder={look.display === 'icon' ? 'مثال: فيسبوك' : 'مثال: تسوّق من المتجر'} className={field} />
            </Field>
            {look.display === 'button' && (
              <Field label="سطر تحت العنوان (اختياري)">
                <input value={block.body} onChange={(e) => onChange({ body: e.target.value })} maxLength={160} placeholder="مثال: كتب دار الفتح الورقية والرقمية" className={field} />
              </Field>
            )}
          </div>
          <Field label="الرابط" hint={URL_HINT} error={urlProblem(block.url)}>
            <input
              value={block.url ?? ''}
              onChange={(e) => onChange({ url: e.target.value })}
              onBlur={() => onChange({ url: normalizeUrlInput(block.url ?? '') || null })}
              dir="ltr"
              placeholder="https://..."
              className={field}
            />
          </Field>
          <Field label="الأيقونة"><IconPicker value={block.icon} onChange={(icon) => onChange({ icon })} /></Field>
          <Field label="اللون (من ألوان الهوية)"><ColorPicker value={look.style} onChange={(style) => setLook({ style })} /></Field>
          {look.display === 'button' && (
            <Field label="شارة صغيرة (اختياري)" hint="مثال: جديد، خصم 20%">
              <input value={block.badge ?? ''} onChange={(e) => onChange({ badge: e.target.value })} maxLength={30} className={`${field} max-w-xs`} />
            </Field>
          )}
          {NewTab}
          {Schedule}
          {Visible}
        </div>
      );

    case 'offer':
      return (
        <div className="space-y-4">
          <Field label="عنوان العرض">
            <input value={block.title} onChange={(e) => onChange({ title: e.target.value })} maxLength={160} placeholder="مثال: عرض الدورة الصيفية" className={field} />
          </Field>
          <Field label="الوصف (اختياري)">
            <textarea value={block.body} onChange={(e) => onChange({ body: e.target.value })} rows={3} maxLength={1500} className={`${field} resize-y`} />
          </Field>
          <Field label="صورة العرض (اختياري)" hint="بتظهر فوق الكارت بنسبة 2:1. الصورة بتتصغّر تلقائي قبل الرفع.">
            <ImageField value={block.image_url} onChange={(image_url) => onChange({ image_url })} />
          </Field>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="شارة (اختياري)" hint="مثال: خصم 20%، لفترة محدودة">
              <input value={block.badge ?? ''} onChange={(e) => onChange({ badge: e.target.value })} maxLength={30} className={field} />
            </Field>
            <Field label="كود الخصم (اختياري)" hint="حروف إنجليزية وأرقام. العميل بينسخه بضغطة.">
              <input value={block.coupon_code ?? ''} onChange={(e) => onChange({ coupon_code: e.target.value.replace(/\s/g, '').toUpperCase() })} maxLength={40} dir="ltr" placeholder="DARALFATH20" className={field} />
            </Field>
            <Field label="نص الزر (اختياري)" hint="لو سبته فاضي والرابط موجود: «تفاصيل العرض».">
              <input value={block.cta_label ?? ''} onChange={(e) => onChange({ cta_label: e.target.value })} maxLength={40} placeholder="اطلب الآن" className={field} />
            </Field>
            <Field label="رابط الزر (اختياري)" error={urlProblem(block.url)}>
              <input
                value={block.url ?? ''}
                onChange={(e) => onChange({ url: e.target.value })}
                onBlur={() => onChange({ url: normalizeUrlInput(block.url ?? '') || null })}
                dir="ltr"
                placeholder="/books?sale=1"
                className={field}
              />
            </Field>
          </div>
          <Field label="أيقونة جنب الشارة (اختياري)">
            <IconPicker value={block.icon} onChange={(icon) => onChange({ icon })} />
          </Field>
          <Field label="لون الزر والشارة"><ColorPicker value={look.style} onChange={(style) => setLook({ style })} /></Field>
          <div className="flex items-center justify-between gap-3 rounded-xl bg-gray-50 border border-gray-100 px-3 py-2.5">
            <span className="text-xs font-semibold text-gray-600">
              إظهار «ينتهي يوم ...» من تاريخ الاختفاء
              {look.showEnd && !block.ends_at && <span className="block text-[11px] text-amber-600 font-medium">اختار تاريخ الاختفاء من الجدولة تحت.</span>}
            </span>
            <Switch checked={look.showEnd} label="إظهار تاريخ الانتهاء" onChange={(showEnd) => setLook({ showEnd })} />
          </div>
          {NewTab}
          {Schedule}
          {Visible}
        </div>
      );

    case 'image':
      return (
        <div className="space-y-4">
          <Field label="الصورة" hint="تتعرض بعرض الصفحة كله وبنسبتها الأصلية.">
            <ImageField
              value={block.image_url}
              onChange={(image_url) => onChange({ image_url })}
              error={block.image_url && !/^https:\/\//i.test(block.image_url) ? `رابط الصورة لازم يبدأ بـ ${ltr('https://')}` : null}
            />
          </Field>
          <Field label="وصف الصورة" hint="بيقراه قارئ الشاشة، وبيظهر تحت الصورة لو شغّلت التعليق.">
            <input value={block.title} onChange={(e) => onChange({ title: e.target.value })} maxLength={160} className={field} />
          </Field>
          <div className="flex items-center justify-between gap-3 rounded-xl bg-gray-50 border border-gray-100 px-3 py-2.5">
            <span className="text-xs font-semibold text-gray-600">إظهار الوصف تحت الصورة</span>
            <Switch checked={look.showCaption} label="إظهار الوصف تحت الصورة" onChange={(showCaption) => setLook({ showCaption })} />
          </div>
          <Field label="رابط عند الضغط على الصورة (اختياري)" error={urlProblem(block.url)}>
            <input
              value={block.url ?? ''}
              onChange={(e) => onChange({ url: e.target.value })}
              onBlur={() => onChange({ url: normalizeUrlInput(block.url ?? '') || null })}
              dir="ltr"
              placeholder="https://..."
              className={field}
            />
          </Field>
          {NewTab}
          {Schedule}
          {Visible}
        </div>
      );

    case 'heading':
      return (
        <div className="space-y-4">
          <Field label="نص العنوان">
            <input value={block.title} onChange={(e) => onChange({ title: e.target.value })} maxLength={160} placeholder="مثال: تابعنا" className={field} />
          </Field>
          <div className="flex flex-wrap gap-4">
            <Field label="المحاذاة">
              <Segmented<Align>
                label="المحاذاة"
                value={look.align}
                options={(['start', 'center', 'end'] as const).map((k) => ({ key: k, label: ALIGN_LABEL[k] }))}
                onChange={(align) => setLook({ align })}
              />
            </Field>
            <Field label="الحجم">
              <Segmented
                label="الحجم"
                value={look.size}
                options={SIZES.map((k) => ({ key: k, label: SIZE_LABEL[k] }))}
                onChange={(size) => setLook({ size })}
              />
            </Field>
          </div>
          {Schedule}
          {Visible}
        </div>
      );

    case 'text':
      return (
        <div className="space-y-4">
          <Field label="النص" hint="السطور الجديدة بتظهر زي ما كتبتها.">
            <textarea value={block.body} onChange={(e) => onChange({ body: e.target.value })} rows={5} maxLength={1500} className={`${field} resize-y`} />
            <span className="text-[11px] text-gray-400 self-end">{block.body.length} / 1500</span>
          </Field>
          <div className="flex flex-wrap gap-4">
            <Field label="المحاذاة">
              <Segmented<Align>
                label="المحاذاة"
                value={look.align}
                options={(['start', 'center', 'justify'] as const).map((k) => ({ key: k, label: ALIGN_LABEL[k] }))}
                onChange={(align) => setLook({ align })}
              />
            </Field>
            <Field label="الحجم">
              <Segmented
                label="الحجم"
                value={look.size}
                options={SIZES.map((k) => ({ key: k, label: SIZE_LABEL[k] }))}
                onChange={(size) => setLook({ size })}
              />
            </Field>
          </div>
          {Schedule}
          {Visible}
        </div>
      );

    case 'divider':
      return (
        <div className="space-y-4">
          <Field label="نوع الفاصل"><DividerTypePicker value={look.dividerType} onChange={(type) => setLook({ type })} /></Field>
          <Field label={look.dividerType === 'space' ? 'حجم المسافة' : 'طول الفاصل'}>
            <Segmented<DividerLength>
              label="الطول"
              value={look.dividerLength}
              options={DIVIDER_LENGTHS.map((k) => ({ key: k, label: DIVIDER_LENGTH_LABEL[k] }))}
              onChange={(length) => setLook({ length })}
            />
          </Field>
          {Schedule}
          {Visible}
        </div>
      );
  }
}
