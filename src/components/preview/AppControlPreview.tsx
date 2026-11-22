import { useMemo, useState } from 'react';
import LiveFrame from '@/components/preview/LiveFrame';
import { Pills, PreviewShell } from '@/components/preview/PreviewControls';
import type { AppControl } from '@/lib/appControl';
import { APP_PREVIEW_READY, APP_PREVIEW_URL, appOrigin, buildAppMessage, type AppNotice, type AppPlatform } from '@/lib/livePreview';

const NOTICE_LABEL: Record<AppNotice, string> = {
  maintenance: 'الصيانة',
  'update-required': 'تحديث إجباري',
  'update-offer': 'تحديث مقترح',
  popup: 'النافذة الترويجية',
};
const NOTICES = (Object.keys(NOTICE_LABEL) as AppNotice[]).map((key) => ({ key, label: NOTICE_LABEL[key], testId: `notice-${key}` }));

/**
 * معاينة حية of «التحكم في التطبيق»: a web copy of the real app showing the notice being edited exactly as customers will see it
 * (the maintenance screen, the forced update, the update that can be put off, the pop-up over the home page), with the words and
 * pictures from the form. The notice shows even when its switch is off: this is how it would look, not whether it is on.
 */
export default function AppControlPreview({ control, notice, onNoticeChange }: { control: AppControl; notice: AppNotice; onNoticeChange: (next: AppNotice) => void }) {
  const [platform, setPlatform] = useState<AppPlatform>('ios');
  const [language, setLanguage] = useState<'ar' | 'en'>('ar');
  const [dark, setDark] = useState(false);
  const message = useMemo(
    () => buildAppMessage({ control, notice, screen: 'home', bookId: null, platform, language, dark }),
    [control, notice, platform, language, dark],
  );

  return (
    <PreviewShell
      testId="app-control-live-preview"
      title="معاينة حية"
      hint="التطبيق الحقيقي وهو بيعرض اللي إنت بتكتبه، قبل الحفظ. دوس على أي قسم في الصفحة وهيتعرض هنا."
      controls={(
        <>
          <Pills<AppNotice> label="الشاشة المعروضة" value={notice} onChange={onNoticeChange} options={NOTICES} />
          <Pills<AppPlatform> label="النظام" value={platform} onChange={setPlatform} options={[{ key: 'ios', label: 'آيفون' }, { key: 'android', label: 'أندرويد' }]} />
          <Pills<'ar' | 'en'> label="لغة التطبيق" value={language} onChange={setLanguage} options={[{ key: 'ar', label: 'عربي' }, { key: 'en', label: 'English' }]} />
          <Pills<'light' | 'dark'> label="الوضع" value={dark ? 'dark' : 'light'} onChange={(v) => setDark(v === 'dark')} options={[{ key: 'light', label: 'نهاري' }, { key: 'dark', label: 'ليلي' }]} />
        </>
      )}
    >
      <LiveFrame
        testId="app-control-frame"
        title="معاينة التطبيق"
        src={`${APP_PREVIEW_URL}/`}
        origin={appOrigin}
        readyType={APP_PREVIEW_READY}
        message={message}
        width={390}
        height={700}
        phone
      />
    </PreviewShell>
  );
}
