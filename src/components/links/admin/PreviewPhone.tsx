import { useMemo, useState } from 'react';
import { isLive, type LinksBlock, type LinksPageSettings } from '@/lib/linksPage';
import LinksPageView, { type LinksTheme } from '../LinksPageView';
import { Segmented } from './ui';
import '../linksPageFonts.css';

/** The page as a visitor's phone draws it, from what is on screen now (saved or not). */
export default function PreviewPhone({ settings, blocks }: { settings: LinksPageSettings; blocks: LinksBlock[] }) {
  const [theme, setTheme] = useState<LinksTheme>('light');
  const notShown = blocks.filter((b) => !isLive(b)).length;
  // In the editor a block's place is its place in the list (the saved sort_order is only written on save).
  const inOrder = useMemo(() => blocks.map((b, i) => ({ ...b, sort_order: i })), [blocks]);

  return (
    <div id="links-preview" data-testid="links-preview">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-sm font-bold text-gray-700">معاينة الصفحة</h2>
        <Segmented<LinksTheme>
          label="مظهر المعاينة"
          value={theme}
          options={[{ key: 'light', label: 'فاتح' }, { key: 'dark', label: 'ليلي' }]}
          onChange={setTheme}
        />
      </div>

      <div className="mx-auto w-full max-w-[392px] rounded-[40px] bg-gray-900 p-2.5 shadow-xl">
        <div className="h-[min(740px,calc(100vh-15rem))] min-h-[420px] overflow-y-auto overflow-x-hidden rounded-[30px] bg-white" data-testid="links-preview-scroll">
          <LinksPageView settings={settings} blocks={inOrder} theme={theme} preview />
        </div>
      </div>

      <p className="mt-3 text-center text-[11px] text-gray-400 leading-relaxed">
        بتتحدّث فورًا قبل ما تحفظ، والروابط هنا مش بتفتح.
        {notShown > 0 && <span className="block text-amber-600 font-medium">فيه {notShown} عنصر مخفي أو مجدول مش ظاهر في المعاينة.</span>}
      </p>
    </div>
  );
}
