import { Link } from 'react-router-dom';
import {
  Settings, BookOpen, ShoppingCart, Users, BookMarked,
  Tag, Package, BarChart3, Truck, ShieldCheck, ChevronLeft
} from 'lucide-react';

const modules = [
  { id: 'settings', label: 'الإعدادات', description: 'إدارة إعدادات النظام والتطبيق', icon: Settings, path: '/settings', requiresAdmin: false, color: 'bg-blue-50', iconColor: 'text-blue-600' },
  { id: 'coupons', label: 'إدارة الكوبونات', description: 'إنشاء وإدارة كوبونات الخصم', icon: Tag, path: '/coupons', requiresAdmin: true, color: 'bg-amber-50', iconColor: 'text-amber-600' },
  { id: 'books', label: 'إدارة الكتب', description: 'إضافة وتعديل وحذف الكتب', icon: BookOpen, path: '/books', requiresAdmin: true, color: 'bg-indigo-50', iconColor: 'text-indigo-600' },
  { id: 'discount', label: 'إدارة الكوبونات و الخصم', description: 'إدارة الخصومات والعروض الترويجية', icon: Package, path: '/coupons', requiresAdmin: true, color: 'bg-purple-50', iconColor: 'text-purple-600' },
  { id: 'orders', label: 'إدارة الطلبات', description: 'متابعة الطلبات وحالاتها', icon: ShoppingCart, path: '/orders', requiresAdmin: true, color: 'bg-green-50', iconColor: 'text-green-600' },
  { id: 'analytics', label: 'لوحة التحليلات', description: 'عرض الإحصائيات والتقارير', icon: BarChart3, path: '/analytics', requiresAdmin: true, color: 'bg-cyan-50', iconColor: 'text-cyan-600' },
  { id: 'catalog', label: 'السلاسل والتصنيفات', description: 'الأقسام والسلاسل والتصنيفات للموقع والتطبيق', icon: BookMarked, path: '/catalog', requiresAdmin: true, color: 'bg-orange-50', iconColor: 'text-orange-600' },
  { id: 'customers', label: 'إدارة العملاء', description: 'إدارة بيانات العملاء', icon: Users, path: '/customers', requiresAdmin: true, color: 'bg-pink-50', iconColor: 'text-pink-600' },
  { id: 'admins', label: 'إعدادات المشرفين', description: 'إدارة حسابات المشرفين والصلاحيات', icon: ShieldCheck, path: '/admins', requiresAdmin: true, color: 'bg-slate-50', iconColor: 'text-slate-600' },
];

export default function ModuleGrid() {
  return (
    <div className="mt-6">
      <h3 className="text-lg font-bold text-gray-800 mb-4">التطبيق</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {modules.map((mod) => {
          const Icon = mod.icon;
          return (
            <Link
              key={mod.id}
              to={mod.path}
              className="bg-white rounded-2xl p-5 shadow-sm hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 flex items-center gap-4 group"
            >
              <div className={`w-12 h-12 ${mod.color} rounded-xl flex items-center justify-center flex-shrink-0`}>
                <Icon size={22} className={mod.iconColor} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-bold text-gray-800 text-sm">{mod.label}</h4>
                  {mod.requiresAdmin && (
                    <span className="badge-admin text-[10px] px-1.5 py-0.5">مشرف</span>
                  )}
                </div>
                <p className="text-xs text-gray-500 truncate">{mod.description}</p>
              </div>
              <ChevronLeft size={18} className="text-gray-300 group-hover:text-gray-500 transition-colors flex-shrink-0" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
