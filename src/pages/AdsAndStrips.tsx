import { Navigate, useSearchParams } from 'react-router-dom';
import { LayoutGrid, Megaphone, Smartphone, Trophy } from 'lucide-react';
import Layout from '@/components/layout/Layout';
import AnnouncementsSection from '@/components/ads/AnnouncementsSection';
import FeatureBoxesSection from '@/components/ads/FeatureBoxesSection';
import BestSellersSection from '@/components/ads/BestSellersSection';
import AppStripsSection from '@/components/ads/AppStripsSection';

const TABS = [
  { key: 'offers', label: 'شريط العروض والإعلانات', hint: 'الشريط اللي تحت الهيدر على طول، برسايل بتتبدل كل 5 ثواني.', icon: Megaphone, Section: AnnouncementsSection },
  { key: 'boxes', label: 'مربعات أعلى الفوتر', hint: 'المربعات اللي في آخر الصفحة الرئيسية فوق الفوتر.', icon: LayoutGrid, Section: FeatureBoxesSection },
  { key: 'best', label: 'الأكثر مبيعًا', hint: 'صف «الأكثر مبيعًا» في الرئيسية، ومبيعات كل كتاب عشان تختار.', icon: Trophy, Section: BestSellersSection },
  { key: 'app', label: 'شرايط التطبيق', hint: 'شريط الشحن المجاني في سلة التطبيق، وأقسام الرئيسية في التطبيق اللي تقدر تقفلها أو تفتحها.', icon: Smartphone, Section: AppStripsSection },
] as const;

/** One place for what the store shows around the books: the strips, the boxes above the footer, and the best sellers row. */
export default function AdsAndStrips() {
  const [params, setParams] = useSearchParams();
  // the top menu and the category bar moved to «السلاسل والتصنيفات»
  if (params.get('tab') === 'menu' || params.get('tab') === 'categories') {
    return <Navigate to="/catalog?tab=menus" replace />;
  }
  const active = TABS.find((t) => t.key === params.get('tab')) ?? TABS[0];
  const { Section } = active;

  return (
    <Layout>
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Megaphone className="text-amber-500" size={24} />
            إدارة الإعلانات والأشرطة
          </h1>
          <p className="text-sm text-gray-500 mt-1">أي تغيير بيظهر في الموقع أول ما تحفظه. تغييرات تاب «شرايط التطبيق» بتظهر في التطبيق.</p>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="أقسام الإعلانات والأشرطة">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const on = tab.key === active.key;
            return (
              <button
                key={tab.key}
                role="tab"
                aria-selected={on}
                onClick={() => setParams({ tab: tab.key }, { replace: true })}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap border transition-colors ${
                  on ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                <Icon size={16} />
                {tab.label}
              </button>
            );
          })}
        </div>

        <p className="text-xs text-gray-500">{active.hint}</p>
        <div role="tabpanel" aria-label={active.label}>
          <Section />
        </div>
      </div>
    </Layout>
  );
}
