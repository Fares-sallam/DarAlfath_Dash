import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import AccessDenied from '@/pages/AccessDenied';

type AdminPermissionKey =
  | 'can_manage_products'
  | 'can_manage_orders'
  | 'can_manage_users'
  | 'can_manage_admins'
  | 'can_manage_inventory'
  | 'can_manage_coupons'
  | 'can_manage_shipping'
  | 'can_view_analytics'
  | 'can_export'
  | 'can_view_activity_log';

interface ProtectedRouteProps {
  children: React.ReactNode;
  permission?: AdminPermissionKey;
}

const SYSTEM_OWNER_EMAIL = 'faresalsaid780@gmail.com';

export default function ProtectedRoute({
  children,
  permission,
}: ProtectedRouteProps) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0B1F4D]" dir="rtl">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-white/20 border-t-white rounded-full animate-spin mx-auto mb-4" />
          <p className="text-white/70 text-sm">جارٍ التحميل...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const isOwner =
    user.email?.toLowerCase() === SYSTEM_OWNER_EMAIL.toLowerCase();

  if (isOwner) {
    return <>{children}</>;
  }

  if (!user.isActive) {
    return <Navigate to="/login" replace />;
  }

  if (!permission) {
    return <>{children}</>;
  }

  if (!user.permissions || !user.permissions[permission]) {
    return <AccessDenied />;
  }

  return <>{children}</>;
}