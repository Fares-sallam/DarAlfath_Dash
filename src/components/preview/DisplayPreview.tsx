import { useMemo, useState } from 'react';
import LiveFrame from '@/components/preview/LiveFrame';
import { Pills, PreviewShell } from '@/components/preview/PreviewControls';
import { useSampleBooks } from '@/hooks/useSampleBooks';
import type { DisplaySettings } from '@/lib/displaySettings';
import {
  APP_PREVIEW_READY, APP_PREVIEW_URL, SITE_PREVIEW_READY, appOrigin, buildAppMessage, buildSiteMessage, siteOrigin, sitePreviewUrl,
  type AppScreen, type SiteScreen,
} from '@/lib/livePreview';

type Place = 'site' | 'app';

const SITE_SCREENS: { key: SiteScreen; label: string; testId: string }[] = [
  { key: 'books', label: 'صفحة الكتب', testId: 'screen-books' },
  { key: 'book', label: 'صفحة كتاب', testId: 'screen-book' },
  { key: 'footer', label: 'التذييل', testId: 'screen-footer' },
];
const APP_SCREENS: { key: AppScreen; label: string; testId: string }[] = [
  { key: 'cards', label: 'البحث والكروت', testId: 'screen-cards' },
  { key: 'book', label: 'صفحة كتاب', testId: 'screen-book' },
];

/** The website at the width of a phone or of a computer (a computer's is scaled down to fit the column). */
const SITE_SIZE = { mobile: { width: 390, height: 700 }, desktop: { width: 1024, height: 640 } } as const;
const APP_SIZE = { width: 390, height: 700 };

/**
 * معاينة حية of «تفاصيل العرض»: the real website (a phone's or a computer's width) or a web copy of the real app, showing the
 * unsaved draft on its real cards, its real book page and (the website) its real footer. A choice made in the form shows here
 * at once; nothing is written.
 */
export default function DisplayPreview({ display }: { display: DisplaySettings }) {
  const [place, setPlace] = useState<Place>('site');
  const [siteScreen, setSiteScreen] = useState<SiteScreen>('books');
  const [appScreen, setAppScreen] = useState<AppScreen>('cards');
  const [device, setDevice] = useState<'mobile' | 'desktop'>('mobile');
  const [language, setLanguage] = useState<'ar' | 'en'>('ar');
  const [dark, setDark] = useState(false);
  const [bookId, setBookId] = useState<string | null>(null);
  const { data: books = [] } = useSampleBooks();
  const chosenBook = bookId ?? books[0]?.id ?? null;

  const screen = place === 'site' ? siteScreen : appScreen;
  const showsBook = screen === 'book';
  const siteMessage = useMemo(() => buildSiteMessage(display, siteScreen, chosenBook), [display, siteScreen, chosenBook]);
  const appMessage = useMemo(
    () => buildAppMessage({ display, screen: appScreen, bookId: chosenBook, platform: 'ios', language, dark }),
    [display, appScreen, chosenBook, language, dark],
  );

  return (
    <PreviewShell
      testId="display-live-preview"
      title="معاينة حية"
      hint="الموقع الحقيقي والتطبيق الحقيقي بتعديلاتك قبل الحفظ. غيّر أي حاجة في الفورم وهتشوفها هنا."
      controls={(
        <>
          <Pills<Place> label="المعاينة في" value={place} onChange={setPlace} options={[{ key: 'site', label: 'الموقع', testId: 'preview-place-site' }, { key: 'app', label: 'التطبيق', testId: 'preview-place-app' }]} />
          {place === 'site'
            ? <Pills<SiteScreen> label="شاشة الموقع" value={siteScreen} onChange={setSiteScreen} options={SITE_SCREENS} />
            : <Pills<AppScreen> label="شاشة التطبيق" value={appScreen} onChange={setAppScreen} options={APP_SCREENS} />}
          {place === 'site' && (
            <Pills<'mobile' | 'desktop'> label="حجم الشاشة" value={device} onChange={setDevice} options={[{ key: 'mobile', label: 'موبايل', testId: 'preview-device-mobile' }, { key: 'desktop', label: 'كمبيوتر', testId: 'preview-device-desktop' }]} />
          )}
          {place === 'app' && (
            <>
              <Pills<'ar' | 'en'> label="لغة التطبيق" value={language} onChange={setLanguage} options={[{ key: 'ar', label: 'عربي' }, { key: 'en', label: 'English' }]} />
              <Pills<'light' | 'dark'> label="الوضع" value={dark ? 'dark' : 'light'} onChange={(v) => setDark(v === 'dark')} options={[{ key: 'light', label: 'نهاري' }, { key: 'dark', label: 'ليلي' }]} />
            </>
          )}
          {showsBook && books.length > 0 && (
            <select
              aria-label="الكتاب المعروض"
              value={chosenBook ?? ''}
              onChange={(e) => setBookId(e.target.value)}
              data-testid="preview-book"
              className="max-w-[210px] px-2 py-1 bg-gray-50 border border-gray-200 rounded-lg text-[11px]"
            >
              {books.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
            </select>
          )}
        </>
      )}
    >
      {place === 'site' ? (
        <LiveFrame
          key={`site-${device}`}
          testId="site-frame"
          title="معاينة الموقع"
          src={sitePreviewUrl('/books')}
          origin={siteOrigin}
          readyType={SITE_PREVIEW_READY}
          message={siteMessage}
          {...SITE_SIZE[device]}
        />
      ) : (
        <LiveFrame
          testId="app-frame"
          title="معاينة التطبيق"
          src={`${APP_PREVIEW_URL}/`}
          origin={appOrigin}
          readyType={APP_PREVIEW_READY}
          message={appMessage}
          phone
          {...APP_SIZE}
        />
      )}
      {place === 'app' && (
        <p className="text-[11px] text-gray-400 leading-relaxed">دي نسخة ويب من التطبيق بنفس الشاشات والمكوّنات، بكود البيلد الجاي. الكتب حقيقية.</p>
      )}
    </PreviewShell>
  );
}
