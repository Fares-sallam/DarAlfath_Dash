import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import { useLocation } from 'react-router-dom';

const pageTitles: Record<string, { title: string; subtitle: string }> = {
  '/': { title: 'دار الفتح', subtitle: 'لوحة التحكم الرئيسية — إدارة جميع أقسام المكتبة' },
  '/books': { title: 'إدارة الكتب', subtitle: 'إضافة وتعديل وحذف الكتب الورقية والرقمية' },
  '/orders': { title: 'إدارة الطلبات', subtitle: 'متابعة الطلبات وحالاتها وتفاصيلها' },
  '/payments': { title: 'محاولات الدفع', subtitle: 'كل محاولة دفع أونلاين — الناجحة والفاشلة' },
  '/customers': { title: 'إدارة العملاء', subtitle: 'إدارة بيانات العملاء وحساباتهم' },
  '/series': { title: 'إدارة السلاسل', subtitle: 'إدارة السلاسل والمكتبات التابعة' },
  '/coupons': { title: 'إدارة الكوبونات والخصم', subtitle: 'إنشاء وإدارة كوبونات الخصم والعروض الترويجية' },
  '/inventory': { title: 'إدارة المخزون', subtitle: 'متابعة كميات المخزون والكتب النافدة' },
  '/analytics': { title: 'لوحة التحليلات', subtitle: 'عرض الإحصائيات والتقارير الشاملة' },
  '/shipping': { title: 'إدارة الشحن', subtitle: 'إدارة طلبات الشحن وتتبع التوصيل' },
  '/admins': { title: 'إعدادات المشرفين', subtitle: 'إدارة حسابات المشرفين والصلاحيات' },
  '/activity': { title: 'سجل النشاط', subtitle: 'متابعة جميع الأنشطة والعمليات في النظام' },
  '/settings': { title: 'الإعدادات', subtitle: 'إدارة إعدادات النظام والتطبيق' },
};

interface LayoutProps {
  children?: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const pageInfo = pageTitles[location.pathname] || { title: 'لوحة التحكم', subtitle: '' };

  return (
    <div className="min-h-screen bg-background flex" dir="rtl">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      
      {/* Main content area - offset for sidebar */}
      <div className="flex-1 flex flex-col min-h-screen lg:mr-72">
        <Header
          onMenuToggle={() => setSidebarOpen(true)}
          title={pageInfo.title}
          subtitle={pageInfo.subtitle}
        />
        <main className="flex-1 p-6 overflow-auto">
          {children || <Outlet />}
        </main>
        <footer className="py-4 text-center text-sm text-gray-400 border-t border-gray-100 bg-white">
          جميع الحقوق محفوظة © 2025 دار الفتح للنشر والتوزيع
        </footer>
      </div>
    </div>
  );
}
