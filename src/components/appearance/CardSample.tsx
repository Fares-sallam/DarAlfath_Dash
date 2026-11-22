import { useState } from 'react';
import { Heart, Share2, Star } from 'lucide-react';
import { Segmented } from '@/components/links/admin/ui';
import { discountText, type DisplayChannel, type DisplaySettings } from '@/lib/displaySettings';

const CHANNELS: { key: DisplayChannel; label: string }[] = [{ key: 'web', label: 'الموقع' }, { key: 'app', label: 'التطبيق' }];

/**
 * A small drawing of a book card with the choices made above, for the website or for the app. It is only a sketch of what is
 * shown and what is not (not the real card): the real one is a click away through «افتح صفحة الكتب في الموقع».
 */
export default function CardSample({ card }: { card: DisplaySettings['card'] }) {
  const [channel, setChannel] = useState<DisplayChannel>('web');
  const on = (key: keyof DisplaySettings['card']['show']) => card.show[key][channel];

  return (
    <div className="rounded-xl bg-gray-50 border border-gray-100 p-4 space-y-3" data-testid="card-sample">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-gray-600">عينة للبطاقة</span>
        <Segmented<DisplayChannel>
          label="عينة البطاقة في"
          value={channel}
          options={CHANNELS}
          onChange={setChannel}
        />
      </div>

      <div className="mx-auto w-48 rounded-xl bg-white border border-gray-200 overflow-hidden shadow-sm" dir="rtl">
        <div className="relative h-44 bg-gradient-to-br from-sky-100 to-indigo-100 flex items-center justify-center text-4xl text-indigo-300 font-bold">
          ك
          {on('wishlist') && <span data-sample="wishlist" className="absolute top-2 right-2 w-7 h-7 rounded-full bg-white/90 flex items-center justify-center text-gray-500"><Heart size={14} /></span>}
          {channel === 'web' && on('share') && <span data-sample="share" className="absolute top-2 right-10 w-7 h-7 rounded-full bg-white/90 flex items-center justify-center text-gray-500"><Share2 size={14} /></span>}
          {on('discount') && <span data-sample="discount" className="absolute top-2 left-2 px-1.5 py-0.5 rounded-md bg-indigo-700 text-white text-[10px] font-bold">{discountText(card.discountStyle, 20, 30, 'ج.م')}</span>}
          {on('isNew') && <span data-sample="isNew" className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded-md bg-emerald-600 text-white text-[10px] font-bold">جديد</span>}
          {on('lowStock') && <span data-sample="lowStock" className="absolute bottom-2 left-2 px-1.5 py-0.5 rounded-md bg-orange-100 text-orange-700 text-[10px] font-bold">آخر {card.lowStockAt}</span>}
        </div>
        <div className="p-3 space-y-1">
          <div className="flex items-center gap-2 text-[10px] text-gray-400">
            {on('type') && <span data-sample="type" className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">كتاب</span>}
            {on('category') && <span data-sample="category">النحو والإملاء</span>}
          </div>
          <div className="text-sm font-bold text-gray-800">عنوان الكتاب</div>
          <div className="text-xs text-gray-500">اسم المؤلف</div>
          {on('rating') && (
            <div data-sample="rating" className="flex items-center gap-0.5 text-amber-400">
              {[1, 2, 3, 4].map((i) => <Star key={i} size={11} fill="currentColor" />)}
              <Star size={11} />
              <span className="text-[10px] text-gray-400 mr-1">4.0</span>
            </div>
          )}
          {channel === 'web' && on('editions') && <div data-sample="editions" className="text-[10px] text-gray-400">عدة خيارات</div>}
          <div className="text-sm font-bold text-indigo-700 pt-1">120 ج.م</div>
        </div>
      </div>
    </div>
  );
}
