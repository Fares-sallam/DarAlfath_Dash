import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useLogo } from '@/contexts/LogoContext';
import { toast } from 'sonner';
import { 
  LayoutDashboard, Settings, BookOpen, ShoppingCart, Users, BookMarked,
  Tag, Package, BarChart3, Truck, ShieldCheck, ActivitySquare, LogOut, X, CreditCard,
  Image as ImageIcon,
  BookOpen as BookIcon
} from 'lucide-react';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

const navItems = [
  { id: 'home', label: 'الرئيسية', icon: LayoutDashboard, path: '/', requiresAdmin: false },
  { id: 'hero-slides', label: 'صور الصفحة الرئيسية', icon: ImageIcon, path: '/hero-slides', requiresAdmin: true },
  { id: 'settings', label: 'الإعدادات', icon: Settings, path: '/settings', requiresAdmin: false },
  { id: 'books', label: 'إدارة الكتب', icon: BookOpen, path: '/books', requiresAdmin: true },
  { id: 'orders', label: 'إدارة الطلبات', icon: ShoppingCart, path: '/orders', requiresAdmin: true },
  { id: 'payments', label: 'محاولات الدفع', icon: CreditCard, path: '/payments', requiresAdmin: true },
  { id: 'customers', label: 'إدارة العملاء', icon: Users, path: '/customers', requiresAdmin: true },
  { id: 'series', label: 'إدارة السلاسل', icon: BookMarked, path: '/series', requiresAdmin: true },
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
  const { logout } = useAuth();
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
        {/* Logo */}
        <div className="flex items-center justify-between px-5 py-5 border-b border-white/10">
          <div className="flex items-center gap-3">
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
          </div>
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
              return (
                <li key={item.id}>
                  <Link
                    to={item.path}
                    onClick={onClose}
                    className={`nav-item ${isActive ? 'nav-item-active' : 'nav-item-inactive'}`}
                  >
                    <Icon size={18} className={isActive ? 'text-white' : 'text-blue-200/70'} />
                    <span className="flex-1 text-sm">{item.label}</span>
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
