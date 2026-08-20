import { useState, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import Layout from '@/components/layout/Layout';
import {
  Save, Store, Bell, Upload, User,
  Search as SearchIcon, Plus, Pencil, Trash2, X, Check,
  Loader2, AlertCircle, Globe2, Tag, Wallet, CheckCircle,
  Eye, EyeOff, Camera, Phone, Mail, MapPin, CheckCircle2,
  Shield, KeyRound, RefreshCw, ImageIcon, Lock
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useLogo } from '@/contexts/LogoContext';
import { useCountry } from '@/contexts/CountryContext';
import {
  useCountries, useCreateCountry, useUpdateCountry, useDeleteCountry,
  usePaymentMethods, useCreatePaymentMethod, useUpdatePaymentMethod, useDeletePaymentMethod,
  useCategories, useCreateCategory, useUpdateCategory, useDeleteCategory,
  useStoreSettings, useUpsertStoreSettings,
  type Country, type PaymentMethod, type Category, type StoreSettingsInput,
} from '@/hooks/useSettings';

/* ── Sidebar sections — personal vs shared ── */
const PERSONAL_SECTIONS = [
  { id: 'profile',  label: 'الملف الشخصي',       icon: User },
  { id: 'security', label: 'كلمة المرور والأمان', icon: Shield },
];

const STORE_SECTIONS = [
  { id: 'store',         label: 'إعدادات المتجر', icon: Store },
  { id: 'countries',     label: 'الدول النشطة',    icon: Globe2 },
  { id: 'payment',       label: 'طرق الدفع',       icon: Wallet },
  { id: 'categories',    label: 'تصنيفات الكتب',   icon: Tag },
  { id: 'seo',           label: 'إعدادات SEO',     icon: SearchIcon },
  { id: 'notifications', label: 'الإشعارات',       icon: Bell },
];

const SECTIONS = [...PERSONAL_SECTIONS, ...STORE_SECTIONS];

/* ── Password strength ── */
function passwordStrength(pw: string): { score: number; label: string; color: string } {
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const map: Record<number, { label: string; color: string }> = {
    0: { label: 'ضعيفة جداً', color: 'bg-red-400' },
    1: { label: 'ضعيفة',     color: 'bg-orange-400' },
    2: { label: 'متوسطة',    color: 'bg-yellow-400' },
    3: { label: 'جيدة',      color: 'bg-blue-500' },
    4: { label: 'قوية',      color: 'bg-green-500' },
  };
  return { score, ...map[score] };
}

/* ── Toggle Switch ── */
function ToggleSwitch({ value, onChange }: { value: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={`w-12 h-6 rounded-full transition-colors relative flex-shrink-0 ${value ? 'bg-blue-600' : 'bg-gray-300'}`}
    >
      <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 shadow transition-all ${value ? 'right-0.5' : 'right-6'}`} />
    </button>
  );
}

/* ── Confirm Delete Dialog ── */
function ConfirmDelete({ label, onConfirm, onCancel }: { label: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" dir="rtl">
      <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full">
        <div className="w-12 h-12 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Trash2 size={20} className="text-red-600" />
        </div>
        <h3 className="font-bold text-gray-800 text-center mb-2">تأكيد الحذف</h3>
        <p className="text-sm text-gray-500 text-center mb-5">
          هل أنت متأكد من حذف <span className="font-semibold text-gray-700">"{label}"</span>؟ لا يمكن التراجع.
        </p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 btn-secondary">إلغاء</button>
          <button onClick={onConfirm} className="flex-1 bg-red-600 text-white font-semibold py-2 rounded-xl hover:bg-red-700 transition-colors">
            حذف
          </button>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   Profile Section
════════════════════════════════════════════════════════════ */

function ProfileSection() {
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);

  const [fullName, setFullName] = useState(user?.fullName || '');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || '');

  useEffect(() => {
    let mounted = true;
    if (!user?.id) return;

    (async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('full_name, phone, avatar_url')
        .eq('id', user.id)
        .maybeSingle();

      if (!mounted || error || !data) return;
      setFullName(data.full_name ?? user.fullName ?? '');
      setPhone(data.phone ?? '');
      setAvatarUrl(data.avatar_url ?? user.avatarUrl ?? '');
    })();

    return () => { mounted = false; };
  }, [user?.id, user?.fullName, user?.avatarUrl]);

  const roleLabels: Record<string, string> = {
    super_admin: 'مالك النظام',
    admin: 'مشرف رئيسي',
    manager: 'مدير',
    sales: 'مبيعات',
    support: 'دعم',
    warehouse: 'مستودع',
    user: 'مستخدم',
  };

  const roleColors: Record<string, string> = {
    super_admin: 'bg-amber-100 text-amber-800',
    admin: 'bg-blue-100 text-blue-800',
    manager: 'bg-purple-100 text-purple-800',
    sales: 'bg-green-100 text-green-800',
    support: 'bg-teal-100 text-teal-800',
    warehouse: 'bg-orange-100 text-orange-800',
    user: 'bg-gray-100 text-gray-800',
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) { toast.error('الاسم مطلوب'); return; }
    if (!user?.id) return;
    setSaving(true);

    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: fullName.trim(),
        phone: phone.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    setSaving(false);
    if (error) { toast.error('فشل حفظ البيانات: ' + error.message); return; }
    toast.success('تم حفظ الملف الشخصي بنجاح');
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user?.id) return;
    if (file.size > 2 * 1024 * 1024) { toast.error('حجم الصورة يجب أن يكون أقل من 2MB'); return; }

    setUploadingAvatar(true);
    const ext = file.name.split('.').pop() ?? 'jpg';
    const path = `admins/${user.id}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true, contentType: file.type });

    if (uploadError) {
      toast.error('فشل رفع الصورة: ' + uploadError.message);
      setUploadingAvatar(false);
      return;
    }

    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ avatar_url: publicUrl })
      .eq('id', user.id);

    setUploadingAvatar(false);
    if (updateError) { toast.error('فشل تحديث الصورة'); return; }

    setAvatarUrl(publicUrl);
    toast.success('تم تحديث صورة الملف الشخصي');
  };

  const initials = (user?.fullName || user?.email || 'U')
    .split(' ')
    .map(w => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="space-y-6">
      <h3 className="font-bold text-gray-800 text-lg border-b border-gray-100 pb-3">الملف الشخصي</h3>

      <div className="flex items-center gap-5">
        <div className="relative flex-shrink-0">
          <div className="w-20 h-20 rounded-2xl overflow-hidden bg-[#0B1F4D] flex items-center justify-center shadow-md">
            {avatarUrl ? (
              <img src={avatarUrl} alt="avatar" className="w-full h-full object-cover" />
            ) : (
              <span className="text-white font-bold text-2xl">{initials}</span>
            )}
          </div>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploadingAvatar}
            className="absolute -bottom-1.5 -left-1.5 w-7 h-7 bg-blue-600 hover:bg-blue-700 rounded-xl flex items-center justify-center shadow-lg transition-colors disabled:opacity-60"
          >
            {uploadingAvatar ? <Loader2 size={13} className="animate-spin text-white" /> : <Camera size={13} className="text-white" />}
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
        </div>
        <div>
          <p className="font-bold text-gray-800 text-base">{fullName || user?.fullName || 'المستخدم'}</p>
          <p className="text-sm text-gray-500 mt-0.5" dir="ltr">{user?.email}</p>
          <span className={`inline-block mt-2 text-xs font-bold px-3 py-1 rounded-full ${roleColors[user?.role || 'user'] || 'bg-gray-100 text-gray-700'}`}>
            {roleLabels[user?.role || 'user'] || user?.role}
          </span>
        </div>
      </div>

      <form onSubmit={handleSaveProfile} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              <User size={14} className="inline ml-1.5 text-gray-400" />
              الاسم الكامل
            </label>
            <input
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              placeholder="اسمك الكامل"
              required
              className="input-field"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              <Phone size={14} className="inline ml-1.5 text-gray-400" />
              رقم الهاتف
            </label>
            <input
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="01XXXXXXXXX"
              className="input-field"
              dir="ltr"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            <Mail size={14} className="inline ml-1.5 text-gray-400" />
            البريد الإلكتروني
          </label>
          <input
            value={user?.email || ''}
            disabled
            className="input-field bg-gray-50 text-gray-400 cursor-not-allowed"
            dir="ltr"
          />
          <p className="text-xs text-gray-400 mt-1">لا يمكن تغيير البريد الإلكتروني من هنا</p>
        </div>

        <div className="pt-1">
          <button
            type="submit"
            disabled={saving}
            className="btn-primary flex items-center gap-2 disabled:opacity-60"
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            {saving ? 'جارٍ الحفظ...' : 'حفظ الملف الشخصي'}
          </button>
        </div>
      </form>

      <div className="border border-gray-100 rounded-2xl p-4 bg-gray-50 space-y-2">
        <p className="text-xs font-bold text-gray-500 mb-3">معلومات الحساب</p>
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">المعرّف</span>
          <span className="font-mono text-xs text-gray-600 bg-white px-2 py-1 rounded-lg border border-gray-100" dir="ltr">
            {user?.id?.slice(0, 8)}...
          </span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">الدور</span>
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${roleColors[user?.role || 'user']}`}>
            {roleLabels[user?.role || 'user'] || user?.role}
          </span>
        </div>
      </div>
    </div>
  );
}


/* ════════════════════════════════════════════════════════════
   Security / Change Password Section
════════════════════════════════════════════════════════════ */
function SecuritySection() {
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  // Security toggles
  const [twoFA, setTwoFA] = useState(false);
  const [sessionTimeout, setSessionTimeout] = useState('60');

  const pwStrength = passwordStrength(newPw);
  const pwMatch = confirmPw.length > 0 && newPw === confirmPw;
  const pwNoMatch = confirmPw.length > 0 && newPw !== confirmPw;

  const canSubmit = newPw.length >= 8 && newPw === confirmPw && !saving;

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPw.length < 8) { toast.error('كلمة المرور يجب أن تكون 8 أحرف على الأقل'); return; }
    if (newPw !== confirmPw) { toast.error('كلمتا المرور غير متطابقتين'); return; }

    setSaving(true);
    setSuccess(false);

    // If current password is provided, re-authenticate first
    if (currentPw) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.email) {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: user.email,
          password: currentPw,
        });
        if (signInError) {
          toast.error('كلمة المرور الحالية غير صحيحة');
          setSaving(false);
          return;
        }
      }
    }

    const { error } = await supabase.auth.updateUser({
      password: newPw,
      data: { has_password: true },
    });

    setSaving(false);

    if (error) {
      toast.error('فشل تغيير كلمة المرور: ' + error.message);
      return;
    }

    setSuccess(true);
    toast.success('تم تغيير كلمة المرور بنجاح! 🎉');
    setCurrentPw('');
    setNewPw('');
    setConfirmPw('');
    setTimeout(() => setSuccess(false), 4000);
  };

  return (
    <div className="space-y-6">
      <h3 className="font-bold text-gray-800 text-lg border-b border-gray-100 pb-3">كلمة المرور والأمان</h3>

      {/* Change Password Card */}
      <div className="border border-blue-100 bg-blue-50/30 rounded-2xl p-5">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
            <KeyRound size={18} className="text-blue-700" />
          </div>
          <div>
            <p className="font-bold text-gray-800">تغيير كلمة المرور</p>
            <p className="text-xs text-gray-500 mt-0.5">يُنصح بتغيير كلمة المرور بانتظام للحفاظ على أمان حسابك</p>
          </div>
        </div>

        {success && (
          <div className="mb-4 flex items-center gap-2.5 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
            <CheckCircle2 size={16} className="text-green-600 flex-shrink-0" />
            <p className="text-sm text-green-700 font-semibold">تم تغيير كلمة المرور بنجاح</p>
          </div>
        )}

        <form onSubmit={handleChangePassword} className="space-y-4">
          {/* Current Password */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">كلمة المرور الحالية (اختياري)</label>
            <div className="relative">
              <input
                type={showCurrent ? 'text' : 'password'}
                value={currentPw}
                onChange={e => setCurrentPw(e.target.value)}
                placeholder="أدخل كلمة مرورك الحالية للتحقق"
                className="input-field pl-10"
                dir="ltr"
              />
              <Lock size={15} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <button type="button" onClick={() => setShowCurrent(s => !s)}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {showCurrent ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1">يمكن تركه فارغاً إذا لم تكن قد عيّنت كلمة مرور من قبل</p>
          </div>

          {/* New Password */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">كلمة المرور الجديدة</label>
            <div className="relative">
              <input
                type={showNew ? 'text' : 'password'}
                value={newPw}
                onChange={e => setNewPw(e.target.value)}
                placeholder="8 أحرف على الأقل"
                required
                className="input-field pl-10"
                dir="ltr"
              />
              <Lock size={15} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <button type="button" onClick={() => setShowNew(s => !s)}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {showNew ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>

            {/* Strength meter */}
            {newPw && (
              <div className="mt-2 space-y-1.5">
                <div className="flex gap-1">
                  {[0, 1, 2, 3].map(i => (
                    <div key={i}
                      className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${i < pwStrength.score ? pwStrength.color : 'bg-gray-100'}`}
                    />
                  ))}
                </div>
                <p className="text-xs text-gray-500">
                  قوة كلمة المرور: <span className="font-semibold">{pwStrength.label}</span>
                </p>
              </div>
            )}
          </div>

          {/* Confirm Password */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">تأكيد كلمة المرور</label>
            <div className="relative">
              <input
                type={showConfirm ? 'text' : 'password'}
                value={confirmPw}
                onChange={e => setConfirmPw(e.target.value)}
                placeholder="أعد إدخال كلمة المرور"
                required
                className={`input-field pl-10 ${pwNoMatch ? 'border-red-400 focus:border-red-400' : pwMatch ? 'border-green-400 focus:border-green-400' : ''}`}
                dir="ltr"
              />
              <Lock size={15} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <button type="button" onClick={() => setShowConfirm(s => !s)}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            {pwNoMatch && <p className="text-xs text-red-500 mt-1 flex items-center gap-1"><X size={11} />كلمتا المرور غير متطابقتين</p>}
            {pwMatch && <p className="text-xs text-green-600 mt-1 flex items-center gap-1"><Check size={11} />كلمتا المرور متطابقتان</p>}
          </div>

          {/* Requirements checklist */}
          <div className="bg-white rounded-xl border border-gray-100 p-3 space-y-2">
            <p className="text-xs font-semibold text-gray-500 mb-2">متطلبات كلمة المرور</p>
            {[
              { check: newPw.length >= 8,      text: '8 أحرف على الأقل' },
              { check: /[A-Z]/.test(newPw),    text: 'حرف كبير (A–Z)' },
              { check: /[0-9]/.test(newPw),    text: 'رقم واحد على الأقل' },
              { check: /[^A-Za-z0-9]/.test(newPw), text: 'رمز خاص (!@#...)' },
            ].map((req, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${req.check ? 'bg-green-100' : 'bg-gray-100'}`}>
                  <Check size={9} className={req.check ? 'text-green-600' : 'text-gray-300'} />
                </div>
                <span className={`text-xs transition-colors ${req.check ? 'text-green-700 font-semibold' : 'text-gray-400'}`}>{req.text}</span>
              </div>
            ))}
          </div>

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full sm:w-auto btn-primary flex items-center justify-center gap-2 disabled:opacity-50 min-w-[180px]"
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : <KeyRound size={15} />}
            {saving ? 'جارٍ الحفظ...' : 'تغيير كلمة المرور'}
          </button>
        </form>
      </div>

      {/* Security Settings */}
      <div className="border border-gray-100 rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center">
            <Shield size={18} className="text-amber-600" />
          </div>
          <div>
            <p className="font-bold text-gray-800">إعدادات الأمان</p>
            <p className="text-xs text-gray-500 mt-0.5">تحكّم في إعدادات حماية حسابك</p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
            <div>
              <p className="text-sm font-semibold text-gray-800">المصادقة الثنائية (2FA)</p>
              <p className="text-xs text-gray-500 mt-0.5">حماية إضافية بكود OTP عند كل تسجيل دخول</p>
            </div>
            <ToggleSwitch
              value={twoFA}
              onChange={() => { setTwoFA(!twoFA); toast.info(twoFA ? 'تم تعطيل المصادقة الثنائية' : 'تم تفعيل المصادقة الثنائية'); }}
            />
          </div>

          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
            <div>
              <p className="text-sm font-semibold text-gray-800">مهلة انتهاء الجلسة</p>
              <p className="text-xs text-gray-500 mt-0.5">تسجيل خروج تلقائي بعد فترة الخمول</p>
            </div>
            <select
              value={sessionTimeout}
              onChange={e => { setSessionTimeout(e.target.value); toast.info('تم تحديث مهلة الجلسة'); }}
              className="text-sm font-semibold text-gray-700 bg-white border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-blue-400"
            >
              <option value="30">30 دقيقة</option>
              <option value="60">60 دقيقة</option>
              <option value="120">ساعتان</option>
              <option value="1440">يوم كامل</option>
            </select>
          </div>

          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
            <div>
              <p className="text-sm font-semibold text-gray-800">إشعارات تسجيل الدخول</p>
              <p className="text-xs text-gray-500 mt-0.5">استلام بريد عند تسجيل الدخول من جهاز جديد</p>
            </div>
            <ToggleSwitch value={true} onChange={() => toast.info('سيتم تطبيق هذا الإعداد قريباً')} />
          </div>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="border border-red-100 bg-red-50/30 rounded-2xl p-5">
        <p className="text-sm font-bold text-red-700 mb-3 flex items-center gap-2">
          <AlertCircle size={15} /> منطقة الخطر
        </p>
        <p className="text-xs text-gray-500 mb-4">هذه الإجراءات لا يمكن التراجع عنها. تصرف بحذر.</p>
        <button
          onClick={() => toast.error('يُرجى التواصل مع مالك النظام لحذف الحساب')}
          className="px-4 py-2 border border-red-300 text-red-600 hover:bg-red-50 rounded-xl text-sm font-semibold transition-colors"
        >
          طلب حذف الحساب
        </button>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   Store Settings Section (with real logo upload)
════════════════════════════════════════════════════════════ */

function StoreSection() {
  const { logoUrl, uploading, uploadLogo, clearLogo } = useLogo();
  const { data: settings, isLoading, isError } = useStoreSettings();
  const upsertStore = useUpsertStoreSettings();
  const logoFileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<StoreSettingsInput>({
    store_name: '',
    store_description: '',
    store_email: '',
    store_phone: '',
    store_address: '',
    seo_title: '',
    seo_description: '',
    seo_keywords: '',
    notifications: {
      emailNewOrder: true,
      smsNewOrder: true,
      emailLowStock: true,
      pushNewOrder: false,
      emailReturn: true,
      smsShipping: false,
    },
  });

  useEffect(() => {
    if (!settings) return;
    setForm({
      store_name: settings.store_name ?? '',
      store_description: settings.store_description ?? '',
      store_email: settings.store_email ?? '',
      store_phone: settings.store_phone ?? '',
      store_address: settings.store_address ?? '',
      seo_title: settings.seo_title ?? '',
      seo_description: settings.seo_description ?? '',
      seo_keywords: settings.seo_keywords ?? '',
      notifications: settings.notifications ?? {
        emailNewOrder: true,
        smsNewOrder: true,
        emailLowStock: true,
        pushNewOrder: false,
        emailReturn: true,
        smsShipping: false,
      },
    });
  }, [settings]);

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await uploadLogo(file);
      toast.success('✅ تم رفع الشعار بنجاح — يظهر الآن في جميع صفحات النظام');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'فشل رفع الشعار');
    }
    e.target.value = '';
  };

  const handleSave = async () => {
    await upsertStore.mutateAsync(form);
  };

  if (isLoading) {
    return <div className="flex items-center justify-center py-16 gap-2 text-gray-400"><Loader2 size={20} className="animate-spin" /><span className="text-sm">جارٍ تحميل إعدادات المتجر...</span></div>;
  }

  if (isError) {
    return <div className="flex items-center justify-center py-16 gap-2 text-red-400"><AlertCircle size={18} /><span className="text-sm">تعذّر تحميل إعدادات المتجر</span></div>;
  }

  return (
    <div className="space-y-5">
      <h3 className="font-bold text-gray-800 text-lg border-b border-gray-100 pb-3">إعدادات المتجر العامة</h3>
      <p className="text-xs text-gray-400 -mt-2">هذه البيانات عامة لكل الدول والعملاء، وأي تغيير فيها ينعكس مباشرة على واجهة البيع.</p>

      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-3">
          <ImageIcon size={14} className="inline ml-1.5 text-gray-400" />
          شعار المتجر
        </label>
        <div className="flex items-center gap-5">
          <div className="w-20 h-20 rounded-2xl bg-[#0B1F4D] flex items-center justify-center overflow-hidden shadow-md flex-shrink-0">
            {logoUrl
              ? <img src={logoUrl} alt="شعار المتجر" className="w-full h-full object-cover" />
              : <span className="text-[#D4AF37] text-3xl font-black">ف</span>
            }
          </div>

          <div className="space-y-2">
            <button
              type="button"
              onClick={() => logoFileRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-2 px-4 py-2.5 border-2 border-dashed border-blue-300 bg-blue-50 rounded-xl text-sm text-blue-700 hover:border-blue-500 hover:bg-blue-100 transition-all disabled:opacity-50 font-semibold"
            >
              {uploading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
              {uploading ? 'جارٍ الرفع...' : 'رفع شعار جديد'}
            </button>

            {logoUrl && (
              <button
                type="button"
                onClick={() => { clearLogo(); toast.info('تم إزالة الشعار المخصص'); }}
                className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 font-semibold"
              >
                <X size={12} /> حذف الشعار المخصص
              </button>
            )}

            <p className="text-xs text-gray-400">PNG، JPG أو WebP — بحد أقصى 2MB</p>
            <p className="text-xs text-green-600 font-semibold bg-green-50 px-2.5 py-1 rounded-xl inline-block">
              ✓ يتحدث تلقائياً في الشريط الجانبي وصفحة الدخول وكل أنحاء النظام
            </p>
          </div>
        </div>
        <input
          ref={logoFileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={handleLogoChange}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            <Store size={14} className="inline ml-1.5 text-gray-400" />اسم المتجر
          </label>
          <input value={form.store_name} onChange={e => setForm(f => ({ ...f, store_name: e.target.value }))} className="input-field" />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            <Mail size={14} className="inline ml-1.5 text-gray-400" />البريد الإلكتروني
          </label>
          <input type="email" value={form.store_email} onChange={e => setForm(f => ({ ...f, store_email: e.target.value }))} className="input-field" />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            <Phone size={14} className="inline ml-1.5 text-gray-400" />رقم الهاتف
          </label>
          <input value={form.store_phone} onChange={e => setForm(f => ({ ...f, store_phone: e.target.value }))} className="input-field" />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            <MapPin size={14} className="inline ml-1.5 text-gray-400" />العنوان
          </label>
          <input value={form.store_address} onChange={e => setForm(f => ({ ...f, store_address: e.target.value }))} className="input-field" />
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">وصف المتجر</label>
        <textarea value={form.store_description} onChange={e => setForm(f => ({ ...f, store_description: e.target.value }))} rows={3} className="input-field h-auto py-3 resize-none" />
      </div>

      <button onClick={handleSave} disabled={upsertStore.isPending} className="btn-primary flex items-center gap-2 disabled:opacity-60">
        {upsertStore.isPending ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
        {upsertStore.isPending ? 'جارٍ الحفظ...' : 'حفظ إعدادات المتجر'}
      </button>
    </div>
  );
}

function SeoSection() {
  const { data: settings, isLoading, isError } = useStoreSettings();
  const upsertStore = useUpsertStoreSettings();

  const [seoTitle, setSeoTitle] = useState('');
  const [seoDesc, setSeoDesc] = useState('');
  const [seoKeywords, setSeoKeywords] = useState('');

  useEffect(() => {
    if (!settings) return;
    setSeoTitle(settings.seo_title ?? '');
    setSeoDesc(settings.seo_description ?? '');
    setSeoKeywords(settings.seo_keywords ?? '');
  }, [settings]);

  const handleSave = async () => {
    await upsertStore.mutateAsync({
      seo_title: seoTitle,
      seo_description: seoDesc,
      seo_keywords: seoKeywords,
    });
  };

  if (isLoading) return <div className="flex items-center justify-center py-12 gap-2 text-gray-400"><Loader2 size={20} className="animate-spin" /><span className="text-sm">جارٍ التحميل...</span></div>;
  if (isError) return <div className="flex items-center justify-center py-12 gap-2 text-red-400"><AlertCircle size={18} /><span className="text-sm">تعذّر تحميل إعدادات SEO</span></div>;

  return (
    <div className="space-y-5">
      <h3 className="font-bold text-gray-800 text-lg border-b border-gray-100 pb-3">إعدادات SEO</h3>
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">عنوان الصفحة (Meta Title)</label>
        <input value={seoTitle} onChange={e => setSeoTitle(e.target.value)} className="input-field" />
        <p className="text-xs text-gray-400 mt-1">{seoTitle.length}/60 حرف</p>
      </div>
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">وصف الصفحة (Meta Description)</label>
        <textarea value={seoDesc} onChange={e => setSeoDesc(e.target.value)} rows={3} className="input-field h-auto py-3 resize-none" />
        <p className="text-xs text-gray-400 mt-1">{seoDesc.length}/160 حرف</p>
      </div>
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">الكلمات المفتاحية</label>
        <input value={seoKeywords} onChange={e => setSeoKeywords(e.target.value)} className="input-field" />
      </div>
      <div className="border border-gray-200 rounded-2xl p-4 bg-gray-50">
        <p className="text-xs font-semibold text-gray-500 mb-2">معاينة في Google</p>
        <p className="text-blue-700 text-base font-semibold">{seoTitle}</p>
        <p className="text-xs text-green-700 mt-0.5">https://darelfath.vercel.app</p>
        <p className="text-sm text-gray-600 mt-1">{seoDesc.slice(0, 160)}</p>
      </div>
      <button onClick={handleSave} disabled={upsertStore.isPending} className="btn-primary flex items-center gap-2 disabled:opacity-60">
        {upsertStore.isPending ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
        {upsertStore.isPending ? 'جارٍ الحفظ...' : 'حفظ'}
      </button>
    </div>
  );
}

function NotificationsSection() {
  const { data: settings, isLoading, isError } = useStoreSettings();
  const upsertStore = useUpsertStoreSettings();

  const [notifs, setNotifs] = useState({
    emailNewOrder: true,
    smsNewOrder: true,
    emailLowStock: true,
    pushNewOrder: false,
    emailReturn: true,
    smsShipping: false,
  });

  useEffect(() => {
    if (settings?.notifications) {
      setNotifs({
        emailNewOrder: !!settings.notifications.emailNewOrder,
        smsNewOrder: !!settings.notifications.smsNewOrder,
        emailLowStock: !!settings.notifications.emailLowStock,
        pushNewOrder: !!settings.notifications.pushNewOrder,
        emailReturn: !!settings.notifications.emailReturn,
        smsShipping: !!settings.notifications.smsShipping,
      });
    }
  }, [settings]);

  const handleSave = async () => {
    await upsertStore.mutateAsync({ notifications: notifs });
  };

  if (isLoading) return <div className="flex items-center justify-center py-12 gap-2 text-gray-400"><Loader2 size={20} className="animate-spin" /><span className="text-sm">جارٍ التحميل...</span></div>;
  if (isError) return <div className="flex items-center justify-center py-12 gap-2 text-red-400"><AlertCircle size={18} /><span className="text-sm">تعذّر تحميل إعدادات الإشعارات</span></div>;

  return (
    <div className="space-y-5">
      <h3 className="font-bold text-gray-800 text-lg border-b border-gray-100 pb-3">إعدادات الإشعارات</h3>
      <div className="space-y-3">
        {[
          { key: 'emailNewOrder', label: 'بريد — طلب جديد', desc: 'إرسال إيميل عند ورود طلب جديد' },
          { key: 'smsNewOrder', label: 'رسالة نصية — طلب جديد', desc: 'إرسال SMS عند ورود طلب جديد' },
          { key: 'emailLowStock', label: 'بريد — نفاد المخزون', desc: 'تنبيه عند انخفاض كمية كتاب' },
          { key: 'pushNewOrder', label: 'إشعار Push — طلب جديد', desc: 'إشعار فوري في المتصفح' },
          { key: 'emailReturn', label: 'بريد — طلب مرتجع', desc: 'إيميل عند طلب استرجاع' },
          { key: 'smsShipping', label: 'رسالة نصية — تحديث الشحن', desc: 'SMS للعميل عند شحن الطلب' },
        ].map(item => (
          <div key={item.key} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
            <div>
              <p className="text-sm font-semibold text-gray-800">{item.label}</p>
              <p className="text-xs text-gray-500 mt-0.5">{item.desc}</p>
            </div>
            <ToggleSwitch
              value={notifs[item.key as keyof typeof notifs]}
              onChange={() => setNotifs(n => ({ ...n, [item.key]: !n[item.key as keyof typeof n] }))}
            />
          </div>
        ))}
      </div>
      <button onClick={handleSave} disabled={upsertStore.isPending} className="btn-primary flex items-center gap-2 disabled:opacity-60">
        {upsertStore.isPending ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
        {upsertStore.isPending ? 'جارٍ الحفظ...' : 'حفظ'}
      </button>
    </div>
  );
}


/* ════════════════════════════════════════════════════════════
   Countries Section
════════════════════════════════════════════════════════════ */

function CountriesSection() {
  const { user } = useAuth();
  const { data: countries = [], isLoading, isError } = useCountries();
  const createMutation = useCreateCountry();
  const updateMutation = useUpdateCountry();
  const deleteMutation = useDeleteCountry();

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Country | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Country | null>(null);

  const emptyForm = { name: '', code: '', currency: 'EGP', currency_symbol: 'ج.م', is_active: true };
  const [form, setForm] = useState(emptyForm);

  const openAdd = () => { setForm(emptyForm); setEditing(null); setShowForm(true); };
  const openEdit = (c: Country) => {
    setForm({ name: c.name, code: c.code, currency: c.currency, currency_symbol: c.currency_symbol, is_active: c.is_active });
    setEditing(c);
    setShowForm(true);
  };
  const closeForm = () => { setShowForm(false); setEditing(null); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.code) return;
    if (editing) await updateMutation.mutateAsync({ id: editing.id, ...form });
    else await createMutation.mutateAsync(form);
    closeForm();
  };

  const isPending = createMutation.isPending || updateMutation.isPending;
  const canDeleteCountries = !!user?.isSystemOwner;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between border-b border-gray-100 pb-3">
        <div>
          <h3 className="font-bold text-gray-800 text-lg">الدول النشطة</h3>
          <p className="text-xs text-gray-400 mt-0.5">إدارة الدول والعملات. الحذف متاح لمالك النظام فقط وبعد إزالة الارتباطات.</p>
        </div>
        <button onClick={openAdd} className="btn-primary flex items-center gap-1.5 text-sm">
          <Plus size={14} /> إضافة دولة
        </button>
      </div>

      {isLoading && <div className="flex items-center justify-center py-12 gap-2 text-gray-400"><Loader2 size={20} className="animate-spin" /><span className="text-sm">جارٍ التحميل...</span></div>}
      {isError && <div className="flex items-center justify-center py-12 gap-2 text-red-400"><AlertCircle size={18} /><span className="text-sm">تعذّر تحميل الدول</span></div>}

      {!isLoading && !isError && (
        <div className="space-y-3">
          {countries.map(country => (
            <div key={country.id} className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-all ${country.is_active ? 'border-blue-100 bg-blue-50/20' : 'border-gray-100 bg-gray-50/20'}`}>
              <div className="flex items-center gap-3">
                <div className={`w-11 h-11 rounded-2xl flex items-center justify-center font-black ${country.is_active ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                  {country.code}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-gray-800">{country.name}</p>
                    {country.is_active && <CheckCircle size={13} className="text-green-600" />}
                  </div>
                  <p className="text-xs text-gray-400" dir="ltr">{country.currency} · {country.currency_symbol}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <ToggleSwitch value={country.is_active} onChange={() => updateMutation.mutate({ id: country.id, is_active: !country.is_active })} />
                <button onClick={() => openEdit(country)} className="p-2 rounded-xl hover:bg-blue-50 text-blue-600 transition-colors"><Pencil size={14} /></button>
                <button
                  disabled={!canDeleteCountries}
                  onClick={() => canDeleteCountries && setDeleteTarget(country)}
                  className="p-2 rounded-xl hover:bg-red-50 text-red-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  title={canDeleteCountries ? 'حذف الدولة' : 'فقط مالك النظام يمكنه حذف الدول'}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
          {countries.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <Globe2 size={32} className="text-gray-200 mx-auto mb-2" />
              <p className="text-sm">لا توجد دول مضافة بعد</p>
            </div>
          )}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" dir="rtl">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-md w-full">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-gray-800">{editing ? 'تعديل الدولة' : 'إضافة دولة جديدة'}</h3>
              <button onClick={closeForm} className="p-1.5 rounded-xl hover:bg-gray-100 text-gray-400"><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">اسم الدولة</label>
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="مصر" required className="input-field text-sm py-2 h-auto" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">رمز الدولة</label>
                  <input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase().slice(0, 2) }))}
                    placeholder="EG" maxLength={2} required className="input-field text-sm py-2 h-auto" dir="ltr" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">كود العملة</label>
                  <input value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value.toUpperCase() }))}
                    placeholder="EGP" required className="input-field text-sm py-2 h-auto" dir="ltr" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">رمز العملة</label>
                  <input value={form.currency_symbol} onChange={e => setForm(f => ({ ...f, currency_symbol: e.target.value }))}
                    placeholder="ج.م" required className="input-field text-sm py-2 h-auto" />
                </div>
              </div>
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                <span className="text-sm font-semibold text-gray-700">نشط</span>
                <ToggleSwitch value={form.is_active} onChange={() => setForm(f => ({ ...f, is_active: !f.is_active }))} />
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={closeForm} className="flex-1 btn-secondary">إلغاء</button>
                <button type="submit" disabled={isPending} className="flex-1 btn-primary flex items-center justify-center gap-2 disabled:opacity-60">
                  {isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                  {editing ? 'حفظ التعديلات' : 'إضافة'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteTarget && (
        <ConfirmDelete
          label={deleteTarget.name}
          onConfirm={() => { deleteMutation.mutate(deleteTarget.id); setDeleteTarget(null); }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}


/* ════════════════════════════════════════════════════════════
   Payment Methods Section
════════════════════════════════════════════════════════════ */

function PaymentMethodsSection() {
  const { selectedCountry } = useCountry();
  const { data: methods = [], isLoading, isError } = usePaymentMethods();
  const createMutation = useCreatePaymentMethod();
  const updateMutation = useUpdatePaymentMethod();
  const deleteMutation = useDeletePaymentMethod();

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<PaymentMethod | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PaymentMethod | null>(null);

  const emptyForm = { method_name: '', provider: '', country_id: (selectedCountry?.id ?? '') as string | null, is_active: true, integration_id: '' };
  const [form, setForm] = useState(emptyForm);
  // "Paymob" providers (paymob_card / paymob_wallet / paymob_apple_pay / ...)
  // are the only ones that need a numeric Paymob integration id — it's what
  // initiate-paymob-payment sends Paymob to say which payment method to
  // charge against, read straight from this row so no code deploy is needed
  // to add or change one.
  const needsIntegrationId = form.provider.toLowerCase().trim().startsWith('paymob');

  useEffect(() => {
    if (!editing) {
      setForm(f => ({ ...f, country_id: selectedCountry?.id ?? '' }));
    }
  }, [selectedCountry?.id, editing]);

  const openAdd = () => {
    setForm({ ...emptyForm, country_id: selectedCountry?.id ?? '' });
    setEditing(null);
    setShowForm(true);
  };

  const openEdit = (m: PaymentMethod) => {
    const existingId = (m.config as Record<string, unknown> | undefined)?.integration_id;
    setForm({
      method_name: m.method_name,
      provider: m.provider ?? '',
      country_id: m.country_id ?? selectedCountry?.id ?? null,
      is_active: m.is_active,
      integration_id: existingId != null ? String(existingId) : '',
    });
    setEditing(m);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedProvider = form.provider.toLowerCase().trim();
    const isPaymobProvider = trimmedProvider.startsWith('paymob');
    // Merge into whatever config already exists on the row (icon/type/etc. from
    // older rows) instead of clobbering it — only integration_id is owned here.
    const nextConfig: Record<string, unknown> = { ...(editing?.config ?? {}) };
    if (isPaymobProvider && form.integration_id.trim()) {
      nextConfig.integration_id = Number(form.integration_id.trim());
    } else {
      delete nextConfig.integration_id;
    }

    const payload = {
      method_name: form.method_name,
      provider: form.provider || undefined,
      country_id: form.country_id || selectedCountry?.id || null,
      is_active: form.is_active,
      config: nextConfig,
    };

    if (editing) await updateMutation.mutateAsync({ id: editing.id, ...payload });
    else await createMutation.mutateAsync(payload);

    setShowForm(false);
    setEditing(null);
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  const LOGOS: Record<string, string> = {
    fawry: '💳', instapay: '⚡', vodafone: '📱', paymob: '🟢',
    stripe: '💳', accept: '✅', cash: '💵', bank: '🏦', wallet: '👛', mada: '💠',
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between border-b border-gray-100 pb-3">
        <div>
          <h3 className="font-bold text-gray-800 text-lg">طرق الدفع</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            {selectedCountry ? `طرق الدفع الخاصة بـ ${selectedCountry.name}` : 'إدارة طرق الدفع المتاحة'}
          </p>
        </div>
        <button onClick={openAdd} className="btn-primary flex items-center gap-1.5 text-sm">
          <Plus size={14} /> إضافة طريقة دفع
        </button>
      </div>

      {selectedCountry && (
        <div className="text-xs font-semibold px-3 py-2 rounded-xl bg-blue-50 text-blue-700 inline-flex items-center gap-1.5">
          <Globe2 size={12} />
          الدولة الحالية: {selectedCountry.name}
        </div>
      )}

      {isLoading && <div className="flex items-center justify-center py-12 gap-2 text-gray-400"><Loader2 size={20} className="animate-spin" /><span className="text-sm">جارٍ التحميل...</span></div>}
      {isError && <div className="flex items-center justify-center py-12 gap-2 text-red-400"><AlertCircle size={18} /><span className="text-sm">تعذّر تحميل طرق الدفع</span></div>}

      {!isLoading && !isError && (
        <div className="space-y-3">
          {methods.map(m => {
            const logoKey = Object.keys(LOGOS).find(k => m.method_name.toLowerCase().includes(k) || (m.provider ?? '').toLowerCase().includes(k));
            return (
              <div key={m.id} className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-all ${m.is_active ? 'border-blue-100 bg-blue-50/20' : 'border-gray-100 bg-gray-50/20'}`}>
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{logoKey ? LOGOS[logoKey] : '💳'}</span>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-gray-800">{m.method_name}</p>
                      {m.is_active && <CheckCircle size={13} className="text-green-600" />}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {m.provider && <span className="text-xs text-blue-600 font-semibold">{m.provider}</span>}
                      {m.countries?.name && <span className="text-xs text-gray-400">· {m.countries.name}</span>}
                      {(m.config as Record<string, unknown> | undefined)?.integration_id != null && (
                        <span className="text-xs text-gray-400 font-mono" dir="ltr">
                          · ID {String((m.config as Record<string, unknown>).integration_id)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <ToggleSwitch value={m.is_active} onChange={() => updateMutation.mutate({ id: m.id, is_active: !m.is_active })} />
                  <button onClick={() => openEdit(m)} className="p-2 rounded-xl hover:bg-blue-50 text-blue-600 transition-colors"><Pencil size={14} /></button>
                  <button onClick={() => setDeleteTarget(m)} className="p-2 rounded-xl hover:bg-red-50 text-red-500 transition-colors"><Trash2 size={14} /></button>
                </div>
              </div>
            );
          })}
          {methods.length === 0 && <div className="text-center py-12 text-gray-400"><Wallet size={32} className="text-gray-200 mx-auto mb-2" /><p className="text-sm">لا توجد طرق دفع مضافة لهذه الدولة بعد</p></div>}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" dir="rtl">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-md w-full">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-gray-800">{editing ? 'تعديل طريقة الدفع' : 'إضافة طريقة دفع'}</h3>
              <button onClick={() => { setShowForm(false); setEditing(null); }} className="p-1.5 rounded-xl hover:bg-gray-100 text-gray-400"><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">اسم طريقة الدفع</label>
                <input value={form.method_name} onChange={e => setForm(f => ({ ...f, method_name: e.target.value }))}
                  placeholder="مثل: Mada، Visa، Mastercard، كاش" required className="input-field text-sm py-2 h-auto" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">المزوّد (اختياري)</label>
                <input value={form.provider} onChange={e => setForm(f => ({ ...f, provider: e.target.value }))}
                  placeholder="مثل: Paymob, HyperPay, Stripe" className="input-field text-sm py-2 h-auto" dir="ltr" />
                <p className="text-[11px] text-gray-400 mt-1">
                  اكتب قيمة تبدأ بـ paymob_ (مثل paymob_card، paymob_wallet، paymob_apple_pay) عشان الموقع والتطبيق يوجّهوا الدفع لـ Paymob فعليًا.
                </p>
              </div>

              {needsIntegrationId && (
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">رقم Integration ID من Paymob</label>
                  <input value={form.integration_id} onChange={e => setForm(f => ({ ...f, integration_id: e.target.value.replace(/[^0-9]/g, '') }))}
                    placeholder="مثل: 5862585" className="input-field text-sm py-2 h-auto" dir="ltr" inputMode="numeric" />
                  <p className="text-[11px] text-gray-400 mt-1">
                    الرقم من لوحة تحكم Paymob لطريقة الدفع دي بالظبط. بيتحفظ هنا فقط — مش في كود الموقع أو التطبيق، فتقدر تغيّره في أي وقت من غير أي تعديل برمجي.
                  </p>
                </div>
              )}

              <div className="p-3 bg-gray-50 rounded-xl text-sm text-gray-600">
                الدولة المرتبطة: <span className="font-bold text-gray-800">{selectedCountry?.name ?? 'غير محددة'}</span>
              </div>

              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                <span className="text-sm font-semibold text-gray-700">نشط</span>
                <ToggleSwitch value={form.is_active} onChange={() => setForm(f => ({ ...f, is_active: !f.is_active }))} />
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => { setShowForm(false); setEditing(null); }} className="flex-1 btn-secondary">إلغاء</button>
                <button type="submit" disabled={isPending} className="flex-1 btn-primary flex items-center justify-center gap-2 disabled:opacity-60">
                  {isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                  {editing ? 'حفظ' : 'إضافة'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteTarget && (
        <ConfirmDelete
          label={deleteTarget.method_name}
          onConfirm={() => { deleteMutation.mutate(deleteTarget.id); setDeleteTarget(null); }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}


/* ════════════════════════════════════════════════════════════
   Categories Section
════════════════════════════════════════════════════════════ */
function CategoriesSection() {
  const { data: categories = [], isLoading, isError } = useCategories();
  const createMutation = useCreateCategory();
  const updateMutation = useUpdateCategory();
  const deleteMutation = useDeleteCategory();

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);

  const emptyForm = { name: '', slug: '', description: '' };
  const [form, setForm] = useState(emptyForm);

  const handleNameChange = (name: string) => {
    const slug = name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^\w\u0621-\u064A-]/g, '').replace(/-+/g, '-');
    setForm(f => ({ ...f, name, slug }));
  };

  const openEdit = (c: Category) => {
    setForm({ name: c.name, slug: c.slug, description: c.description ?? '' });
    setEditing(c); setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { name: form.name, slug: form.slug, description: form.description || undefined };
    if (editing) { await updateMutation.mutateAsync({ id: editing.id, ...payload }); }
    else { await createMutation.mutateAsync(payload); }
    setShowForm(false); setEditing(null); setForm(emptyForm);
  };

  const isPending = createMutation.isPending || updateMutation.isPending;
  const COLORS = ['bg-blue-100 text-blue-700','bg-purple-100 text-purple-700','bg-green-100 text-green-700','bg-orange-100 text-orange-700','bg-pink-100 text-pink-700','bg-amber-100 text-amber-700','bg-teal-100 text-teal-700','bg-red-100 text-red-700'];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between border-b border-gray-100 pb-3">
        <div>
          <h3 className="font-bold text-gray-800 text-lg">تصنيفات الكتب</h3>
          <p className="text-xs text-gray-400 mt-0.5">إدارة تصنيفات المكتبة</p>
        </div>
        <button onClick={() => { setForm(emptyForm); setEditing(null); setShowForm(true); }} className="btn-primary flex items-center gap-1.5 text-sm">
          <Plus size={14} /> إضافة تصنيف
        </button>
      </div>

      {isLoading && <div className="flex items-center justify-center py-12 gap-2 text-gray-400"><Loader2 size={20} className="animate-spin" /><span className="text-sm">جارٍ التحميل...</span></div>}
      {isError && <div className="flex items-center justify-center py-12 gap-2 text-red-400"><AlertCircle size={18} /><span className="text-sm">تعذّر تحميل التصنيفات</span></div>}

      {!isLoading && !isError && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {categories.map((cat, idx) => (
            <div key={cat.id} className="flex items-center justify-between bg-gray-50 hover:bg-gray-100 rounded-2xl p-4 transition-colors group">
              <div className="flex items-center gap-3 min-w-0">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0 ${COLORS[idx % COLORS.length]}`}>
                  {cat.name.charAt(0)}
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-gray-800 text-sm truncate">{cat.name}</p>
                  <p className="text-xs text-gray-400 font-mono truncate" dir="ltr">{cat.slug}</p>
                </div>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                <button onClick={() => openEdit(cat)} className="p-1.5 rounded-xl hover:bg-blue-50 text-blue-600"><Pencil size={13} /></button>
                <button onClick={() => setDeleteTarget(cat)} className="p-1.5 rounded-xl hover:bg-red-50 text-red-500"><Trash2 size={13} /></button>
              </div>
            </div>
          ))}
          {categories.length === 0 && <div className="col-span-2 text-center py-12 text-gray-400"><Tag size={32} className="text-gray-200 mx-auto mb-2" /><p className="text-sm">لا توجد تصنيفات بعد</p></div>}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" dir="rtl">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-md w-full">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-gray-800">{editing ? 'تعديل التصنيف' : 'إضافة تصنيف'}</h3>
              <button onClick={() => { setShowForm(false); setEditing(null); }} className="p-1.5 rounded-xl hover:bg-gray-100 text-gray-400"><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">اسم التصنيف</label>
                <input value={form.name} onChange={e => handleNameChange(e.target.value)} placeholder="روايات، تنمية بشرية..." required className="input-field text-sm py-2 h-auto" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">الـ Slug</label>
                <input value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value }))} placeholder="novels" required className="input-field text-sm py-2 h-auto" dir="ltr" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">الوصف (اختياري)</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} className="input-field text-sm py-2 h-auto resize-none" />
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => { setShowForm(false); setEditing(null); }} className="flex-1 btn-secondary">إلغاء</button>
                <button type="submit" disabled={isPending} className="flex-1 btn-primary flex items-center justify-center gap-2 disabled:opacity-60">
                  {isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                  {editing ? 'حفظ' : 'إضافة'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteTarget && (
        <ConfirmDelete
          label={deleteTarget.name}
          onConfirm={() => { deleteMutation.mutate(deleteTarget.id); setDeleteTarget(null); }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   Main Settings Page
════════════════════════════════════════════════════════════ */
export default function Settings() {
  const { user } = useAuth();
  const location = useLocation();
  const [activeSection, setActiveSection] = useState(
    (location.state as { section?: string })?.section || 'profile'
  );

  // Sync section from navigation state (e.g., Header profile button)
  useEffect(() => {
    const sec = (location.state as { section?: string })?.section;
    if (sec) setActiveSection(sec);
  }, [location.state]);

  const isPersonal = PERSONAL_SECTIONS.some(s => s.id === activeSection);

  const roleLabels: Record<string, string> = {
    super_admin: 'مدير النظام',
    admin: 'مشرف',
    manager: 'مدير',
    sales: 'مبيعات',
    support: 'دعم',
    warehouse: 'مستودع',
    user: 'مستخدم',
  };

  return (
    <Layout>
      <div className="fade-in" dir="rtl">
        <div className="mb-6">
          <h1 className="section-title">الإعدادات</h1>
          <p className="section-subtitle">إعداداتك الشخصية وإعدادات المتجر والبيانات</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

          {/* ── Sidebar ── */}
          <div className="lg:col-span-1 space-y-3">

            {/* Personal identity card */}
            <div
              className="bg-white rounded-2xl shadow-sm p-4 border-2 border-[#0B1F4D]/10 cursor-pointer hover:border-[#0B1F4D]/30 transition-all"
              onClick={() => setActiveSection('profile')}
            >
              <div className="flex items-center gap-3">
                {user?.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt={user.fullName || ''}
                    className="w-11 h-11 rounded-xl object-cover border-2 border-[#0B1F4D]/10 flex-shrink-0"
                  />
                ) : (
                  <div className="w-11 h-11 rounded-xl bg-[#0B1F4D] flex items-center justify-center flex-shrink-0 border-2 border-[#0B1F4D]/20">
                    <span className="text-[#D4AF37] font-black text-base">
                      {(user?.fullName || user?.email || 'م')[0].toUpperCase()}
                    </span>
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-gray-800 text-sm truncate">{user?.fullName || 'المستخدم'}</p>
                  <p className="text-xs text-gray-400 truncate" dir="ltr">{user?.email}</p>
                  <span className="inline-block text-[10px] font-bold mt-1 px-2 py-0.5 rounded-full bg-[#0B1F4D]/10 text-[#0B1F4D]">
                    {roleLabels[user?.role ?? ''] ?? user?.role}
                  </span>
                </div>
              </div>
            </div>

            {/* Navigation */}
            <div className="bg-white rounded-2xl shadow-sm p-3">

              {/* Personal group */}
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider px-3 pt-1 pb-2">
                إعداداتي الشخصية
              </p>
              <ul className="space-y-0.5 mb-3">
                {PERSONAL_SECTIONS.map(s => {
                  const Icon = s.icon;
                  const isActive = activeSection === s.id;
                  return (
                    <li key={s.id}>
                      <button
                        onClick={() => setActiveSection(s.id)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                          isActive ? 'bg-[#0B1F4D] text-white font-semibold shadow-sm' : 'text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        <Icon size={15} className={isActive ? 'text-[#D4AF37]' : 'text-gray-400'} />
                        <span className="flex-1 text-right">{s.label}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>

              {/* Divider */}
              <div className="border-t border-gray-100 mb-3" />

              {/* Store group */}
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider px-3 pb-2">
                إعدادات المتجر المشتركة
              </p>
              <ul className="space-y-0.5">
                {STORE_SECTIONS.map(s => {
                  const Icon = s.icon;
                  const isActive = activeSection === s.id;
                  return (
                    <li key={s.id}>
                      <button
                        onClick={() => setActiveSection(s.id)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                          isActive ? 'bg-blue-600 text-white font-semibold shadow-sm' : 'text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        <Icon size={15} className={isActive ? 'text-white' : 'text-gray-400'} />
                        <span className="flex-1 text-right">{s.label}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>

          {/* ── Content Panel ── */}
          <div className="lg:col-span-3">

            {/* Context banner */}
            {isPersonal ? (
              <div className="mb-4 px-4 py-3 bg-[#0B1F4D]/5 border border-[#0B1F4D]/10 rounded-2xl flex items-center gap-3">
                <div className="w-8 h-8 bg-[#0B1F4D] rounded-xl flex items-center justify-center flex-shrink-0">
                  <User size={14} className="text-[#D4AF37]" />
                </div>
                <div>
                  <p className="text-xs font-bold text-[#0B1F4D]">
                    إعداداتك الشخصية — مخصصة لك فقط
                  </p>
                  <p className="text-[11px] text-[#0B1F4D]/60 mt-0.5">
                    التغييرات هنا تؤثر على حسابك أنت فقط، ولا تؤثر على بقية المشرفين
                  </p>
                </div>
              </div>
            ) : (
              <div className="mb-4 px-4 py-3 bg-blue-50 border border-blue-100 rounded-2xl flex items-center gap-3">
                <div className="w-8 h-8 bg-blue-600 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Store size={14} className="text-white" />
                </div>
                <div>
                  <p className="text-xs font-bold text-blue-800">
                    إعدادات المتجر المشتركة
                  </p>
                  <p className="text-[11px] text-blue-600 mt-0.5">
                    هذه الإعدادات موحدة لجميع المشرفين وتؤثر على المتجر بالكامل
                  </p>
                </div>
              </div>
            )}

            <div className="bg-white rounded-2xl shadow-sm p-6 min-h-[500px]">
              {activeSection === 'profile'      && <ProfileSection />}
              {activeSection === 'security'     && <SecuritySection />}
              {activeSection === 'countries'    && <CountriesSection />}
              {activeSection === 'payment'      && <PaymentMethodsSection />}
              {activeSection === 'categories'   && <CategoriesSection />}
              {activeSection === 'store'        && <StoreSection />}
              {activeSection === 'seo'          && <SeoSection />}
              {activeSection === 'notifications'&& <NotificationsSection />}
            </div>
          </div>

        </div>
      </div>
    </Layout>
  );
}
