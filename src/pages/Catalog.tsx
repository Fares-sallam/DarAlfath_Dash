import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BookOpen, FolderTree, HeartPulse, Home, Map as MapIcon, Rows3 } from 'lucide-react';
import Layout from '@/components/layout/Layout';
import TreeTab from '@/components/catalog/TreeTab';
import BooksTab from '@/components/catalog/BooksTab';
import HealthTab from '@/components/catalog/HealthTab';
import DisplayMapTab from '@/components/catalog/DisplayMapTab';
import HomeBlocksEditor from '@/components/catalog/HomeBlocksEditor';
import CategoryBarSection from '@/components/ads/CategoryBarSection';
import AppStripsSection from '@/components/ads/AppStripsSection';

const TABS = [
  { key: 'tree', label: 'الشجرة', hint: 'كل الأقسام والسلاسل والتصنيفات في مكان واحد: التنظيم، الظهور، الترتيب، والكتب.', icon: FolderTree },
  { key: 'books', label: 'الكتب', hint: 'كل كتاب بسلاسله وتصنيفاته. عدّل التنظيم أو دوّر على الكتب اللي مش تابعة لأي حاجة.', icon: BookOpen },
  { key: 'map', label: 'خريطة العرض', hint: 'الشكل الكامل من فوق لتحت: القايمة العلوية (رئيسي وفرعي ومجموعات)، شريط التصنيفات، ورفوف الصفحة الرئيسية.', icon: MapIcon },
  { key: 'menus', label: 'شريط التصنيفات', hint: 'التصنيفات اللي بتظهر في الشريط تحت الهيدر، وترتيبها.', icon: Rows3 },
  { key: 'home', label: 'الصفحة الرئيسية', hint: 'رفوف الصفحة الرئيسية في الموقع والتطبيق.', icon: Home },
  { key: 'health', label: 'فحص وتنظيف', hint: 'ملاحظات على التنظيم: عناصر فاضية، أسماء مكررة، كتب بلا تصنيف.', icon: HeartPulse },
] as const;

/** One place for the catalog: sections, series and categories for the website and the app. */
export default function Catalog() {
  const [params, setParams] = useSearchParams();
  const active = TABS.find((t) => t.key === params.get('tab')) ?? TABS[0];
  const openNode = params.get('node');
  const homeChannel: 'web' | 'app' = params.get('channel') === 'app' ? 'app' : 'web';
  const openProduct = params.get('product');

  const clearParam = useCallback(
    (key: string) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete(key);
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );
  const clearNode = useCallback(() => clearParam('node'), [clearParam]);
  const clearProduct = useCallback(() => clearParam('product'), [clearParam]);

  return (
    <Layout>
      <div className="space-y-5" data-testid="catalog-page">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <FolderTree className="text-blue-600" size={24} />
            السلاسل والتصنيفات
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            أي تعديل هنا بيتطبّق على الموقع والتطبيق (النسخ المنشورة من التطبيق بتشوفه أول ما تفتح أو تسحب للتحديث).
          </p>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="أقسام السلاسل والتصنيفات">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const on = tab.key === active.key;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setParams({ tab: tab.key }, { replace: true })}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap border transition-colors ${
                  on ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
                data-testid={`tab-${tab.key}`}
              >
                <Icon size={16} />
                {tab.label}
              </button>
            );
          })}
        </div>

        <p className="text-xs text-gray-500">{active.hint}</p>

        <div role="tabpanel" aria-label={active.label}>
          {active.key === 'tree' && <TreeTab openNodeId={openNode} onOpened={clearNode} />}
          {active.key === 'books' && <BooksTab openProductId={openProduct} onOpened={clearProduct} />}
          {active.key === 'map' && <DisplayMapTab />}
          {active.key === 'menus' && <CategoryBarSection />}
          {active.key === 'home' && (
            <div className="space-y-6">
              <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1 w-fit" role="group" aria-label="القناة" data-testid="home-channel">
                {(['web', 'app'] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setParams({ tab: 'home', channel: c }, { replace: true })}
                    aria-pressed={homeChannel === c}
                    data-testid={`home-channel-${c}`}
                    className={`px-4 py-1.5 rounded-lg text-sm font-semibold ${homeChannel === c ? 'bg-white shadow-sm text-blue-700' : 'text-gray-500'}`}
                  >
                    {c === 'web' ? 'الموقع' : 'التطبيق'}
                  </button>
                ))}
              </div>
              <HomeBlocksEditor key={homeChannel} channel={homeChannel} />
              {homeChannel === 'app' && (
                <section>
                  <h2 className="text-lg font-bold text-gray-800 mb-3">إعدادات تانية للتطبيق</h2>
                  <AppStripsSection inHub />
                </section>
              )}
            </div>
          )}
          {active.key === 'health' && (
            <HealthTab
              onOpenNode={(id) => setParams({ tab: 'tree', node: id }, { replace: true })}
              onOpenProduct={(id) => setParams({ tab: 'books', product: id }, { replace: true })}
            />
          )}
        </div>
      </div>
    </Layout>
  );
}
