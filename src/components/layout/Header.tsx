import { useState, useEffect, useRef } from 'react';
import {
  Bell,
  Search,
  Menu,
  ChevronDown,
  User,
  Settings,
  LogOut,
  ShoppingCart,
  Package,
  AlertTriangle,
  UserPlus,
  Globe2,
  Check,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useCountry } from '@/contexts/CountryContext';
import { useLogo } from '@/contexts/LogoContext';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';

interface HeaderProps {
  onMenuToggle: () => void;
  title: string;
  subtitle?: string;
}

interface NotificationItem {
  id: string;
  title: string;
  body?: string;
  type: string;
  data?: Record<string, unknown>;
  is_read: boolean;
  sent_at: string;
}

/* Map notification type → route */
function getNotifRoute(notif: NotificationItem): string {
  const type = notif.type;
  const data = notif.data ?? {};

  if (type === 'order' || type === 'new_order') return '/orders';
  if (type === 'inventory' || type === 'low_stock') return '/inventory';
  if (type === 'customer' || type === 'new_user') return '/customers';
  if (type === 'coupon') return '/coupons';
  if (type === 'return' || type === 'refund') return '/orders';
  if (data['order_id']) return '/orders';

  return '/';
}

/* Map type → icon */
function NotifIcon({ type }: { type: string }) {
  if (type === 'order' || type === 'new_order') {
    return <ShoppingCart size={14} className="text-blue-600" />;
  }
  if (type === 'inventory' || type === 'low_stock') {
    return <AlertTriangle size={14} className="text-amber-500" />;
  }
  if (type === 'customer' || type === 'new_user') {
    return <UserPlus size={14} className="text-green-600" />;
  }
  return <Package size={14} className="text-gray-500" />;
}

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);

  if (diff < 60) return 'الآن';
  if (diff < 3600) return `منذ ${Math.floor(diff / 60)} دقيقة`;
  if (diff < 86400) return `منذ ${Math.floor(diff / 3600)} ساعة`;
  return `منذ ${Math.floor(diff / 86400)} يوم`;
}

function getRoleLabel(
  role?: string,
  isSystemOwner?: boolean,
  countryName?: string | null
) {
  if (isSystemOwner) return 'مالك النظام';
  if (role === 'super_admin') return 'مدير النظام';
  if (role === 'admin') return countryName ? `مشرف ${countryName}` : 'مشرف';
  if (role === 'manager') return countryName ? `مدير ${countryName}` : 'مدير';
  return countryName ? `مستخدم ${countryName}` : 'مستخدم';
}

export default function Header({ onMenuToggle, title, subtitle }: HeaderProps) {
  const { user, logout } = useAuth();
  const { logoUrl } = useLogo();
  const {
    loading: countriesLoading,
    allowedCountries,
    selectedCountry,
    currencySymbol,
    setSelectedCountryById,
  } = useCountry();

  const navigate = useNavigate();

  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showCountryMenu, setShowCountryMenu] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  const notifRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const countryRef = useRef<HTMLDivElement>(null);

  /* ── Fetch real notifications from Supabase ── */
  useEffect(() => {
    if (!user) return;

    const fetchNotifs = async () => {
      const { data } = await supabase
        .from('notifications')
        .select('id, title, body, type, data, is_read, sent_at')
        .or(`user_id.eq.${user.id},user_id.is.null`)
        .order('sent_at', { ascending: false })
        .limit(20);

      if (data) setNotifications(data as NotificationItem[]);
    };

    void fetchNotifs();

    const channel = supabase
      .channel('notifications-header')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          setNotifications((prev) => [payload.new as NotificationItem, ...prev].slice(0, 20));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  /* ── Close dropdowns on outside click ── */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setShowProfile(false);
      }
      if (countryRef.current && !countryRef.current.contains(e.target as Node)) {
        setShowCountryMenu(false);
      }
    };

    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const handleLogout = async () => {
    await logout();
    toast.success('تم تسجيل الخروج');
    navigate('/login');
  };

  const markAsRead = async (id: string) => {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
  };

  const handleNotifClick = async (notif: NotificationItem) => {
    if (!notif.is_read) await markAsRead(notif.id);
    setShowNotifications(false);
    navigate(getNotifRoute(notif));
  };

  const markAllRead = async () => {
    const unreadIds = notifications.filter((n) => !n.is_read).map((n) => n.id);
    if (unreadIds.length === 0) return;

    await supabase.from('notifications').update({ is_read: true }).in('id', unreadIds);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    toast.success('تم تعليم جميع الإشعارات كمقروءة');
  };

  const roleLabel = getRoleLabel(
    user?.role,
    user?.isSystemOwner,
    selectedCountry?.name ?? null
  );

  const canSwitchCountries = allowedCountries.length > 1;

  return (
    <header className="bg-white border-b border-gray-100 h-20 flex items-center px-4 md:px-6 sticky top-0 z-30 shadow-sm">
      <div className="flex items-center gap-4 flex-1 min-w-0">
        {/* Mobile Menu */}
        <button
          onClick={onMenuToggle}
          className="lg:hidden p-2 rounded-xl hover:bg-gray-100 transition-colors"
        >
          <Menu size={22} className="text-gray-600" />
        </button>

        {/* Page Title */}
        <div className="hidden md:block min-w-0">
          <h2 className="text-lg font-bold text-gray-800 truncate">{title}</h2>
          {subtitle && <p className="text-xs text-gray-500 truncate">{subtitle}</p>}
        </div>
      </div>

      <div className="flex items-center gap-2 md:gap-4">
        {/* Search — jumps to إدارة الكتب with the query pre-filled into that
            page's own search box (same title/author/ISBN filter it already
            has), since books are the one thing worth a global quick-search
            here. */}
        <div className="relative hidden lg:block">
          <input
            type="text"
            placeholder="ابحث هنا..."
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              const q = searchValue.trim();
              if (!q) return;
              navigate(`/books?q=${encodeURIComponent(q)}`);
            }}
            className="w-64 h-10 pr-10 pl-4 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            dir="rtl"
          />
          <button
            type="button"
            onClick={() => {
              const q = searchValue.trim();
              if (!q) return;
              navigate(`/books?q=${encodeURIComponent(q)}`);
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-blue-600"
            title="بحث"
          >
            <Search size={16} />
          </button>
        </div>

        {/* Country Selector */}
        <div className="relative" ref={countryRef}>
          <button
            onClick={() => {
              if (!canSwitchCountries) return;
              setShowCountryMenu((prev) => !prev);
              setShowNotifications(false);
              setShowProfile(false);
            }}
            className={`flex items-center gap-2 h-10 px-3 rounded-xl border transition-colors ${
              canSwitchCountries
                ? 'border-gray-200 bg-white hover:bg-gray-50'
                : 'border-gray-100 bg-gray-50 cursor-default'
            }`}
            title={selectedCountry ? `الدولة الحالية: ${selectedCountry.name}` : 'الدولة الحالية'}
          >
            <Globe2 size={16} className="text-blue-600" />
            <div className="hidden md:block text-right leading-tight">
              <p className="text-xs font-bold text-gray-800">
                {countriesLoading
                  ? 'جارٍ التحميل...'
                  : selectedCountry?.name ?? 'بدون دولة'}
              </p>
              <p className="text-[10px] text-gray-500">
                {selectedCountry?.currency ?? 'EGP'} · {currencySymbol}
              </p>
            </div>
            {canSwitchCountries && (
              <ChevronDown size={14} className="text-gray-400 hidden md:block" />
            )}
          </button>

          {showCountryMenu && canSwitchCountries && (
            <div className="absolute left-0 top-14 w-64 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden z-50">
              <div className="px-4 py-3 border-b border-gray-100">
                <h3 className="font-bold text-gray-800 text-sm">اختر الدولة الحالية</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  كل الأسعار والتحليلات ستُقرأ حسب الدولة المختارة
                </p>
              </div>

              <ul className="py-1 max-h-72 overflow-y-auto">
                {allowedCountries.map((country) => {
                  const isSelected = selectedCountry?.id === country.id;

                  return (
                    <li key={country.id}>
                      <button
                        onClick={() => {
                          setSelectedCountryById(country.id);
                          setShowCountryMenu(false);
                          toast.success(`تم التبديل إلى ${country.name}`);
                        }}
                        className={`w-full flex items-center justify-between gap-3 px-4 py-3 text-sm transition-colors ${
                          isSelected ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50 text-gray-700'
                        }`}
                      >
                        <div className="flex flex-col items-start text-right flex-1">
                          <span className="font-semibold">{country.name}</span>
                          <span className="text-xs text-gray-400">
                            {country.currency} · {country.currency_symbol}
                          </span>
                        </div>

                        {isSelected && (
                          <span className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                            <Check size={13} className="text-blue-700" />
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>

        {/* Notifications */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => {
              setShowNotifications(!showNotifications);
              setShowProfile(false);
              setShowCountryMenu(false);
            }}
            className="relative p-2.5 rounded-xl hover:bg-gray-100 transition-colors"
          >
            <Bell size={20} className="text-gray-600" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {showNotifications && (
            <div className="absolute left-0 top-14 w-80 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden z-50">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-bold text-gray-800 text-sm">الإشعارات</h3>
                <div className="flex items-center gap-2">
                  {unreadCount > 0 && (
                    <span className="bg-red-100 text-red-600 text-[10px] font-bold px-2 py-0.5 rounded-full">
                      {unreadCount} جديد
                    </span>
                  )}
                  {unreadCount > 0 && (
                    <button
                      onClick={markAllRead}
                      className="text-xs text-blue-600 hover:underline font-semibold"
                    >
                      قراءة الكل
                    </button>
                  )}
                </div>
              </div>

              {notifications.length === 0 ? (
                <div className="py-10 text-center text-gray-400">
                  <Bell size={28} className="text-gray-200 mx-auto mb-2" />
                  <p className="text-sm">لا توجد إشعارات</p>
                </div>
              ) : (
                <ul className="max-h-72 overflow-y-auto divide-y divide-gray-50">
                  {notifications.map((n) => (
                    <li
                      key={n.id}
                      onClick={() => handleNotifClick(n)}
                      className={`px-4 py-3 hover:bg-gray-50 transition-colors cursor-pointer ${
                        !n.is_read ? 'bg-blue-50/40' : ''
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${
                            !n.is_read ? 'bg-blue-100' : 'bg-gray-100'
                          }`}
                        >
                          <NotifIcon type={n.type} />
                        </div>

                        <div className="flex-1 min-w-0">
                          <p
                            className={`text-sm ${
                              !n.is_read ? 'font-semibold text-gray-800' : 'text-gray-600'
                            } truncate`}
                          >
                            {n.title}
                          </p>
                          {n.body && (
                            <p className="text-xs text-gray-400 mt-0.5 truncate">{n.body}</p>
                          )}
                          <p className="text-xs text-gray-400 mt-0.5">{timeAgo(n.sent_at)}</p>
                        </div>

                        {!n.is_read && (
                          <span className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 mt-1.5" />
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <div className="px-4 py-2.5 text-center border-t border-gray-100">
                <button
                  onClick={() => {
                    setShowNotifications(false);
                    navigate('/activity');
                  }}
                  className="text-blue-600 text-sm font-semibold hover:underline"
                >
                  عرض سجل النشاط الكامل
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Profile */}
        <div className="relative" ref={profileRef}>
          <button
            onClick={() => {
              setShowProfile(!showProfile);
              setShowNotifications(false);
              setShowCountryMenu(false);
            }}
            className="flex items-center gap-2.5 p-1.5 rounded-xl hover:bg-gray-100 transition-colors"
          >
            <div className="text-right hidden sm:block">
              <p className="text-sm font-bold text-gray-800 leading-tight">
                {user?.fullName || 'مدير النظام'}
              </p>
              <p className="text-xs text-gray-500">{roleLabel}</p>
            </div>

            {user?.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt="Admin"
                className="w-9 h-9 rounded-xl object-cover border-2 border-blue-100"
              />
            ) : (
              <div className="w-9 h-9 rounded-xl bg-[#0B1F4D] flex items-center justify-center border-2 border-blue-100 overflow-hidden">
                {logoUrl ? (
                  <img src={logoUrl} alt="logo" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-[#D4AF37] font-bold text-sm">
                    {(user?.fullName || 'م')[0]}
                  </span>
                )}
              </div>
            )}

            <ChevronDown size={14} className="text-gray-400" />
          </button>

          {showProfile && (
            <div className="absolute left-0 top-14 w-56 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden z-50">
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="font-bold text-sm text-gray-800">
                  {user?.fullName || 'مدير النظام'}
                </p>
                <p className="text-xs text-gray-400 truncate">{user?.email}</p>
                <p className="text-[11px] text-blue-600 mt-1 font-semibold">{roleLabel}</p>
              </div>

              <ul className="py-1">
                <li>
                  <button
                    onClick={() => {
                      setShowProfile(false);
                      navigate('/settings', { state: { section: 'profile' } });
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 text-sm text-gray-700 transition-colors"
                  >
                    <User size={15} className="text-gray-400" />
                    الملف الشخصي
                  </button>
                </li>

                <li>
                  <button
                    onClick={() => {
                      setShowProfile(false);
                      navigate('/settings');
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 text-sm text-gray-700 transition-colors"
                  >
                    <Settings size={15} className="text-gray-400" />
                    الإعدادات
                  </button>
                </li>

                <li className="border-t border-gray-100 mt-1">
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-red-50 text-sm text-red-500 transition-colors"
                  >
                    <LogOut size={15} />
                    تسجيل خروج
                  </button>
                </li>
              </ul>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}