import { useMemo, useState } from 'react';
import LiveFrame from '@/components/preview/LiveFrame';
import { Pills, PreviewShell } from '@/components/preview/PreviewControls';
import { useSampleBooks } from '@/hooks/useSampleBooks';
import type { StorefrontAppearance, StoreTheme } from '@/lib/appearance';
import { SITE_PREVIEW_READY, buildLookMessage, siteOrigin, sitePreviewUrl, type SiteScreen } from '@/lib/livePreview';

const SCREENS: { key: SiteScreen; label: string; testId: string }[] = [
  { key: 'home', label: 'الرئيسية', testId: 'screen-home' },
  { key: 'books', label: 'الكتب', testId: 'screen-books' },
  { key: 'book', label: 'صفحة كتاب', testId: 'screen-book' },
  { key: 'account', label: 'دخول العملاء', testId: 'screen-account' },
];

/** The website at the width of a phone or of a computer (a computer's is scaled down to fit the column). */
const SIZE = { mobile: { width: 390, height: 700 }, desktop: { width: 1024, height: 640 } } as const;

/**
 * معاينة حية of the look: the real website with the pattern strength, the strips and the buttons' colours being edited (unsaved), on its
 * home page, its books page, a book's page or the customers' sign-in page, by day or by night (a button's colour is chosen for each).
 */
export default function LookPreview({ appearance, theme, onThemeChange, screen, onScreenChange }: {
  appearance: StorefrontAppearance;
  theme: StoreTheme;
  onThemeChange: (next: StoreTheme) => void;
  screen: SiteScreen;
  onScreenChange: (next: SiteScreen) => void;
}) {
  const [device, setDevice] = useState<'mobile' | 'desktop'>('mobile');
  const [bookId, setBookId] = useState<string | null>(null);
  const { data: books = [] } = useSampleBooks();
  const chosenBook = bookId ?? books[0]?.id ?? null;
  const message = useMemo(() => buildLookMessage(appearance, theme, screen, chosenBook), [appearance, theme, screen, chosenBook]);

  return (
    <PreviewShell
      testId="look-live-preview"
      title="معاينة حية"
      hint="المتجر الحقيقي بالباترن والشريط وألوان الأزرار اللي بتعدّلها قبل الحفظ. دوس على أي قسم وهيتعرض الصفحة المناسبة."
      controls={(
        <>
          <Pills<SiteScreen> label="صفحة المتجر" value={screen} onChange={onScreenChange} options={SCREENS} />
          <Pills<'mobile' | 'desktop'> label="حجم الشاشة" value={device} onChange={setDevice} options={[{ key: 'mobile', label: 'موبايل', testId: 'preview-device-mobile' }, { key: 'desktop', label: 'كمبيوتر', testId: 'preview-device-desktop' }]} />
          <Pills<StoreTheme> label="وضع المتجر" value={theme} onChange={onThemeChange} options={[{ key: 'light', label: 'نهاري', testId: 'preview-theme-light' }, { key: 'dark', label: 'ليلي', testId: 'preview-theme-dark' }]} />
          {screen === 'book' && books.length > 0 && (
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
      <LiveFrame
        key={`look-${device}`}
        testId="look-frame"
        title="معاينة المتجر"
        src={sitePreviewUrl('/')}
        origin={siteOrigin}
        readyType={SITE_PREVIEW_READY}
        message={message}
        {...SIZE[device]}
      />
    </PreviewShell>
  );
}
