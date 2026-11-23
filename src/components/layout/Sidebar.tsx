import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useLogo } from '@/contexts/LogoContext';
import { toast } from 'sonner';
import { STOREFRONT_URL } from '@/lib/storefront';
import { usePendingReviewsCount } from '@/hooks/useReviews';
import type { AdminPermissions } from '@/contexts/AuthContext';
import {
  LayoutDashboard, Settings, BookOpen, ShoppingCart, Users, BookMarked,
  Tag, Package, BarChart3, Truck, ShieldCheck, ActivitySquare, LogOut, X, CreditCard,
  Image as ImageIcon, Youtube, Star, Megaphone, Link2, Lock, LockOpen,
  BookOpen as BookIcon, Palette, Smartphone } from 'lucide-react';

/** The permission each entry needs; the lock beside it shows whether the signed-in person has it. */
const NAV_PERMISSION: Record<string, keyof AdminPermissions | undefined> = {
  'hero-slides': 'can_manage_home_media',
  'intro-videos': 'can_manage_home_media',
  'ads-strips': 'can_manage_appearance',
  appearance: 'can_manage_appearance',
  'app-control': 'can_manage_app_control',
  'links-page': 'can_manage_links_page',
  settings: 'can_manage_settings',
  books: 'can_manage_products',
  catalog: 'can_manage_catalog',
  reviews: 'can_manage_products',
  orders: 'can_manage_orders',
  payments: 'can_manage_orders',
  customers: 'can_manage_users',
  coupons: 'can_manage_coupons',
  inventory: 'can_manage_inventory',
  analytics: 'can_view_analytics',
  shipping: 'can_manage_shipping',
  admins: 'can_manage_admins',
  activity: 'can_view_activity_log',
};

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

const navItems = [
  { id: 'home', label: 'الرئيسية', icon: LayoutDashboard, path: '/', requiresAdmin: false },
  { id: 'hero-slides', label: 'صور الصفحة الرئيسية', icon: ImageIcon, path: '/hero-slides', requiresAdmin: true },
  { id: 'intro-videos', label: 'فيديوهات "من الدار"', icon: Youtube, path: '/intro-videos', requiresAdmin: true },
  { id: 'ads-strips', label: 'إدارة الإعلانات والأشرطة', icon: Megaphone, path: '/ads-strips', requiresAdmin: true },
  { id: 'links-page', label: 'إدارة الصفحة والروابط', icon: Link2, path: '/links-page', requiresAdmin: true },
  { id: 'appearance', label: 'مظهر المتجر', icon: Palette, path: '/appearance', requiresAdmin: true },
  { id: 'app-control', label: 'التحكم في التطبيق', icon: Smartphone, path: '/app-control', requiresAdmin: true },
  { id: 'settings', label: 'الإعدادات', icon: Settings, path: '/settings', requiresAdmin: false },
  { id: 'books', label: 'إدارة الكتب', icon: BookOpen, path: '/books', requiresAdmin: true },
  { id: 'orders', label: 'إدارة الطلبات', icon: ShoppingCart, path: '/orders', requiresAdmin: true },
  { id: 'payments', label: 'محاولات الدفع', icon: CreditCard, path: '/payments', requiresAdmin: true },
  { id: 'customers', label: 'إدارة العملاء', icon: Users, path: '/customers', requiresAdmin: true },
  { id: 'catalog', label: 'السلاسل والتصنيفات', icon: BookMarked, path: '/catalog', requiresAdmin: true },
  { id: 'reviews', label: 'تقييمات العملاء', icon: Star, path: '/reviews', requiresAdmin: true },
  { id: 'coupons', label: 'إدارة الكوبونات', icon: Tag, path: '/coupons', requiresAdmin: true },
  { id: 'inventory', label: 'إدارة المخزون', icon: Package, path: '/inventory', requiresAdmin: true },
  { id: 'analytics', label: 'لوحة التحليلات', icon: BarChart3, path: '/analytics', requiresAdmin: true },
  { id: 'shipping', label: 'إدارة الشحن', icon: Truck, path: '/shipping', requiresAdmin: true },
  { id: 'admins', label: 'إعدادات المشرفين', icon: ShieldCheck, path: '/admins', requiresAdmin: true },
  { id: 'activity', label: 'سجل النشاط', icon: ActivitySquare, path: '/activity', requiresAdmin: true },
];

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { data: pendingReviews = 0 } = usePendingReviewsCount();
  const { logoUrl } = useLogo();

  const handleLogout = async () => {
    await logout();
    toast.success('تم تسجيل الخروج');
    navigate('/login');
  };

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed top-0 right-0 h-full w-72 sidebar-gradient z-50 flex flex-col
        transition-transform duration-300 ease-in-out
        ${isOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}
      `}>
        {/* Logo — opens the live storefront (where books are actually sold
            to customers) in a new tab, so the admin doesn't lose their
            place in the dashboard. */}
        <div className="flex items-center justify-between px-5 py-5 border-b border-white/10">
          <a
            href={STOREFRONT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 hover:opacity-80 transition-opacity"
            title="فتح متجر دار الفتح"
          >
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center overflow-hidden flex-shrink-0">
              {logoUrl
                ? <img src={logoUrl} alt="شعار دار الفتح" className="w-full h-full object-cover" />
                : <BookIcon size={22} className="text-[#D4AF37]" />
              }
            </div>
            <div>
              <h1 className="text-white font-bold text-base leading-tight">دار الفتح</h1>
              <p className="text-blue-200 text-xs">لوحة التحكم</p>
            </div>
          </a>
          <button onClick={onClose} className="lg:hidden text-white/60 hover:text-white">
            <X size={20} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <p className="text-blue-200/50 text-xs font-semibold px-4 mb-2 tracking-wider">القائمة الرئيسية</p>
          <ul className="space-y-0.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              const needed = NAV_PERMISSION[item.id];
              const unlocked = !needed || !!user?.isSystemOwner || !!user?.permissions?.[needed];
              return (
                <li key={item.id}>
                  <Link
                    to={item.path}
                    onClick={onClose}
                    className={`nav-item ${isActive ? 'nav-item-active' : 'nav-item-inactive'}`}
                  >
                    <Icon size={18} className={isActive ? 'text-white' : 'text-blue-200/70'} />
                    <span className="flex-1 text-sm">{item.label}</span>
                    {item.id === 'reviews' && pendingReviews > 0 && (
                      <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-amber-400 text-[11px] font-bold text-gray-900 flex items-center justify-center" title={`${pendingReviews} تعليق بانتظار المراجعة`} data-testid="pending-reviews-badge">
                        {pendingReviews}
                      </span>
                    )}
                    <span
                      data-testid={`nav-lock-${item.id}`}
                      data-locked={unlocked ? 'false' : 'true'}
                      title={unlocked ? 'مفتوحة لحسابك' : 'مغلقة: لا تملك صلاحية دخولها'}
                      className={unlocked ? 'text-emerald-300' : 'text-red-300'}
                    >
                      {unlocked ? <LockOpen size={14} /> : <Lock size={14} />}
                    </span>
                    {item.requiresAdmin && (
                      <span className="badge-admin text-[10px] px-1.5 py-0.5">مشرف</span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Logout */}
        <div className="px-3 py-4 border-t border-white/10">
          <button onClick={handleLogout} className="nav-item nav-item-inactive w-full text-red-400 hover:text-red-300 hover:bg-red-500/10">
            <LogOut size={18} />
            <span className="text-sm">تسجيل خروج</span>
          </button>
        </div>
      </aside>
    </>
  );
}
