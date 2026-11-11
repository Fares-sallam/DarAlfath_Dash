import {
  BUTTON_SHAPES, BUTTON_SHAPE_LABEL, PAGE_BACKGROUNDS, PAGE_BACKGROUND_LABEL,
  type ButtonShape, type LinksPageSettings, type PageBackground,
} from '@/lib/linksPage';
import { Switch } from '@/components/ads/CategoryBarSection';
import { Field, ImageField, Segmented, field } from './ui';

/** The page as a whole: switched on or off, its heading and line under the logo, its look, and what search engines and link previews show. */
export default function SettingsPanel({ settings, onChange }: { settings: LinksPageSettings; onChange: (patch: Partial<LinksPageSettings>) => void }) {
  return (
    <div className="space-y-4" data-testid="links-settings">
      <section className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
        <h2 className="text-sm font-bold text-gray-700">الصفحة</h2>

        <div className="flex items-center justify-between gap-3 rounded-xl bg-gray-50 border border-gray-100 px-3 py-2.5">
          <span className="text-xs font-semibold text-gray-600">
            الصفحة شغّالة
            <span className="block text-[11px] font-normal text-gray-400 mt-0.5">لو قفلتها، اللي يفتح الرابط بيشوف «الصفحة غير متاحة» ومعاها زر للمتجر.</span>
          </span>
          <Switch checked={settings.is_enabled} label="الصفحة شغّالة" onChange={(is_enabled) => onChange({ is_enabled })} />
        </div>

        <div className="flex items-center justify-between gap-3 rounded-xl bg-gray-50 border border-gray-100 px-3 py-2.5">
          <span className="text-xs font-semibold text-gray-600">إظهار شعار الدار في أعلى الصفحة</span>
          <Switch checked={settings.show_logo} label="إظهار الشعار" onChange={(show_logo) => onChange({ show_logo })} />
        </div>

        <Field label="عنوان ظاهر تحت الشعار (اختياري)" hint="سيبه فاضي لو الشعار كفاية. (الصفحة بيبقى ليها عنوان لقارئ الشاشة في كل الأحوال.)">
          <input value={settings.title} onChange={(e) => onChange({ title: e.target.value })} maxLength={120} placeholder="مثال: روابط دار الفتح" className={field} />
        </Field>

        <Field label="السطر التعريفي تحت العنوان">
          <textarea value={settings.tagline} onChange={(e) => onChange({ tagline: e.target.value })} rows={3} maxLength={300} className={`${field} resize-y`} />
          <span className="text-[11px] text-gray-400 self-end">{settings.tagline.length} / 300</span>
        </Field>

        <Field label="نص أسفل الصفحة (اختياري)">
          <input value={settings.footer_text} onChange={(e) => onChange({ footer_text: e.target.value })} maxLength={300} placeholder="مثال: © 2026 دار الفتح للنشر والتوزيع" className={field} />
        </Field>
      </section>

      <section className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
        <h2 className="text-sm font-bold text-gray-700">الشكل</h2>
        <div className="flex flex-wrap gap-x-8 gap-y-4">
          <Field label="شكل الأزرار">
            <Segmented<ButtonShape>
              label="شكل الأزرار"
              value={settings.button_shape}
              options={BUTTON_SHAPES.map((k) => ({ key: k, label: BUTTON_SHAPE_LABEL[k] }))}
              onChange={(button_shape) => onChange({ button_shape })}
            />
          </Field>
          <Field label="خلفية الصفحة" hint="الباترن بيظهر خفيف ورا الشعار، وصف زخرفة في آخر الصفحة.">
            <Segmented<PageBackground>
              label="خلفية الصفحة"
              value={settings.background}
              options={PAGE_BACKGROUNDS.map((k) => ({ key: k, label: PAGE_BACKGROUND_LABEL[k] }))}
              onChange={(background) => onChange({ background })}
            />
          </Field>
        </div>
        <p className="text-[11px] text-gray-400">الألوان والخطوط والشعار والباترن من هوية الدار، والزائر بيشوف الصفحة بالمظهر الفاتح أو الليلي حسب جهازه.</p>
      </section>

      <section className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
        <div>
          <h2 className="text-sm font-bold text-gray-700">جوجل ومعاينة المشاركة</h2>
          <p className="text-[11px] text-gray-400 mt-1">اللي بيظهر لما الرابط يتبعت على واتساب أو فيسبوك أو يطلع في نتايج البحث. لو سبته فاضي بيظهر الاسم والوصف الافتراضي.</p>
        </div>
        <Field label="عنوان الصفحة">
          <input value={settings.seo_title} onChange={(e) => onChange({ seo_title: e.target.value })} maxLength={120} placeholder="روابط دار الفتح — دار الفتح للنشر والتوزيع" className={field} />
        </Field>
        <Field label="وصف الصفحة">
          <textarea value={settings.seo_description} onChange={(e) => onChange({ seo_description: e.target.value })} rows={2} maxLength={300} className={`${field} resize-y`} />
        </Field>
        <Field label="صورة المشاركة" hint="لو فاضية بتظهر صورة شعار الدار.">
          <ImageField value={settings.share_image_url} onChange={(share_image_url) => onChange({ share_image_url })} />
        </Field>
      </section>
    </div>
  );
}
