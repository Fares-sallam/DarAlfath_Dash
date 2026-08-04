import { useEffect, useMemo, useState } from 'react';
import Layout from '@/components/layout/Layout';
import {
  Plus,
  Power,
  ShieldCheck,
  X,
  Search,
  Shield,
  Loader2,
  AlertCircle,
  RefreshCw,
  CheckSquare,
  Square,
  User,
  Trash2,
  Check,
  UserPlus,
  ChevronDown,
  Eye,
  EyeOff,
  Globe2,
  Crown,
  Lock,
  Settings,
  Camera,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import {
  useAdminSettings,
  useAdminProfiles,
  useAdminCountries,
  useUpdateAdminPermissions,
  useUpdateAdminProfile,
  useUpdateProfileRole,
  useToggleAdminStatus,
  useCreateAdminSetting,
  useDeleteAdminSetting,
  useCreateNewAdminUser,
  getRoleLabel,
  getRoleColor,
  ROLE_OPTIONS,
  PERMISSION_FIELDS,
  PERMISSION_SECTIONS_GROUPED,
  DEFAULT_PERMISSIONS,
  countActivePerms,
  isSystemOwner,
  type AdminSetting,
  type AdminPermissions,
  type CountryOption,
} from '@/hooks/useAdminSettings';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

/* ── Role badge ── */
function RoleBadge({ role, isOwner = false }: { role: string; isOwner?: boolean }) {
  if (isOwner) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#0B1F4D] text-white">
        <Crown size={11} className="text-[#D4AF37]" />
        مالك النظام
      </span>
    );
  }

  return (
    <span className={`inline-block text-[11px] font-bold px-2 py-0.5 rounded-full ${getRoleColor(role)}`}>
      {getRoleLabel(role)}
    </span>
  );
}

/* ── Toggle Switch ── */
function Toggle({
  value,
  onChange,
  disabled,
}: {
  value: boolean;
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      disabled={disabled}
      className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0 ${
        value ? 'bg-blue-600' : 'bg-gray-200'
      } disabled:opacity-40`}
    >
      <div
        className={`w-5 h-5 bg-white rounded-full absolute top-0.5 shadow transition-all ${
          value ? 'right-0.5' : 'right-5'
        }`}
      />
    </button>
  );
}

/* ── Password strength ── */
function PasswordStrength({ password }: { password: string }) {
  let score = 0;
  if (password.length >= 8) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  const labels = ['ضعيفة جداً', 'ضعيفة', 'متوسطة', 'جيدة', 'قوية'];
  const colors = ['bg-red-400', 'bg-orange-400', 'bg-yellow-400', 'bg-blue-500', 'bg-green-500'];

  return (
    <div className="mt-2">
      <div className="flex gap-1 mb-1">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full ${
              i < score ? colors[score] : 'bg-gray-100'
            }`}
          />
        ))}
      </div>
      <p className="text-xs text-gray-500">
        القوة: <span className="font-semibold">{labels[score]}</span>
      </p>
    </div>
  );
}

/* ── Country multi-select block ── */
function CountryAccessSelector({
  countries,
  selectedCountryIds,
  primaryCountryId,
  onToggleCountry,
  onSetPrimary,
  disabled = false,
}: {
  countries: CountryOption[];
  selectedCountryIds: string[];
  primaryCountryId: string | null;
  onToggleCountry: (countryId: string) => void;
  onSetPrimary: (countryId: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Globe2 size={15} className="text-[#0B1F4D]" />
        <h3 className="font-bold text-gray-700">الدول المسموح بها</h3>
        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-semibold">
          {selectedCountryIds.length}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-60 overflow-y-auto pr-1">
        {countries.map((country) => {
          const selected = selectedCountryIds.includes(country.id);
          const isPrimary = primaryCountryId === country.id;

          return (
            <div
              key={country.id}
              className={`rounded-2xl border p-3 transition-all ${
                selected ? 'border-blue-200 bg-blue-50' : 'border-gray-100 bg-white'
              } ${disabled ? 'opacity-70' : ''}`}
            >
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onToggleCountry(country.id)}
                  className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all ${
                    selected ? 'bg-blue-600 border-blue-600' : 'border-gray-300 hover:border-blue-400'
                  }`}
                >
                  {selected && (
                    <svg
                      className="w-3 h-3 text-white"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>

                <div className="flex-1 min-w-0">
                  <p className={`text-sm ${selected ? 'font-bold text-blue-800' : 'font-semibold text-gray-800'}`}>
                    {country.name}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {country.code} · {country.currency} · {country.currency_symbol}
                  </p>

                  {selected && (
                    <div className="mt-2">
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => onSetPrimary(country.id)}
                        className={`text-xs px-2.5 py-1 rounded-xl font-semibold transition-colors ${
                          isPrimary
                            ? 'bg-[#0B1F4D] text-white'
                            : 'bg-white border border-blue-200 text-blue-700 hover:bg-blue-100'
                        }`}
                      >
                        {isPrimary ? 'الدولة الأساسية' : 'تعيين كأساسية'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {selectedCountryIds.length === 0 && (
        <div className="bg-red-50 border border-red-100 rounded-2xl p-3 text-xs text-red-600 font-semibold">
          يجب اختيار دولة واحدة على الأقل للمشرف
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   Permissions Panel
════════════════════════════════════════════════════════════ */
interface PermissionsPanelProps {
  admin: AdminSetting;
}
function PermissionsPanel({ admin }: PermissionsPanelProps) {
  const updateMutation = useUpdateAdminPermissions();
  const { data: countries = [] } = useAdminCountries();

  const adminEmail = admin.profiles?.email ?? null;
  const ownerLocked = isSystemOwner(adminEmail);

  const buildAdminPerms = (row: AdminSetting): AdminPermissions => ({
    can_manage_products: row.can_manage_products,
    can_manage_orders: row.can_manage_orders,
    can_manage_users: row.can_manage_users,
    can_manage_admins: row.can_manage_admins,
    can_manage_inventory: row.can_manage_inventory,
    can_manage_coupons: row.can_manage_coupons,
    can_manage_shipping: row.can_manage_shipping,
    can_view_analytics: row.can_view_analytics,
    can_export: row.can_export,
    can_view_activity_log: row.can_view_activity_log,
    can_manage_settings: row.can_manage_settings,
  });

  const initialCountryIds = admin.accessible_countries?.length
    ? admin.accessible_countries.map((c) => c.country_id)
    : admin.country_id
    ? [admin.country_id]
    : [];

  const [perms, setPerms] = useState<AdminPermissions>(() => buildAdminPerms(admin));
  const [selectedCountryIds, setSelectedCountryIds] = useState<string[]>(initialCountryIds);
  const [primaryCountryId, setPrimaryCountryId] = useState<string | null>(
    admin.primary_country_id ?? initialCountryIds[0] ?? null
  );

  useEffect(() => {
    const nextPerms = buildAdminPerms(admin);
    const nextCountryIds = admin.accessible_countries?.length
      ? admin.accessible_countries.map((c) => c.country_id)
      : admin.country_id
      ? [admin.country_id]
      : [];

    setPerms(nextPerms);
    setSelectedCountryIds(nextCountryIds);
    setPrimaryCountryId(admin.primary_country_id ?? nextCountryIds[0] ?? null);
  }, [admin]);

  const togglePerm = (key: keyof AdminPermissions) => {
    if (ownerLocked) return;
    setPerms((p) => ({ ...p, [key]: !p[key] }));
  };

  const toggleSection = (keys: (keyof AdminPermissions)[]) => {
    if (ownerLocked) return;

    const allOn = keys.every((k) => perms[k]);
    setPerms((p) => {
      const next = { ...p };
      keys.forEach((k) => {
        next[k] = !allOn;
      });
      return next;
    });
  };

  const selectAll = () => {
    if (ownerLocked) return;
    const newPerms: AdminPermissions = {} as AdminPermissions;
    PERMISSION_FIELDS.forEach((f) => {
      newPerms[f.key] = true;
    });
    setPerms(newPerms);
  };

  const clearAll = () => {
    if (ownerLocked) return;
    setPerms({ ...DEFAULT_PERMISSIONS });
  };

  const toggleCountry = (countryId: string) => {
    if (ownerLocked) return;

    setSelectedCountryIds((prev) => {
      const exists = prev.includes(countryId);
      let next: string[];

      if (exists) {
        next = prev.filter((id) => id !== countryId);
      } else {
        next = [...prev, countryId];
      }

      if (next.length === 0) {
        setPrimaryCountryId(null);
      } else if (!next.includes(primaryCountryId ?? '')) {
        setPrimaryCountryId(next[0]);
      }

      return next;
    });
  };

  const handleSetPrimary = (countryId: string) => {
    if (ownerLocked) return;
    if (!selectedCountryIds.includes(countryId)) return;
    setPrimaryCountryId(countryId);
  };

  const originalPerms = buildAdminPerms(admin);
  const originalCountryIds = initialCountryIds;
  const originalPrimaryCountryId = admin.primary_country_id ?? initialCountryIds[0] ?? null;

  const dirty =
    JSON.stringify(perms) !== JSON.stringify(originalPerms) ||
    JSON.stringify([...selectedCountryIds].sort()) !== JSON.stringify([...originalCountryIds].sort()) ||
    primaryCountryId !== originalPrimaryCountryId;

  const name = admin.profiles?.full_name ?? 'مشرف';
  const activeCount = countActivePerms(perms);

  const saveDisabled =
    updateMutation.isPending ||
    !dirty ||
    selectedCountryIds.length === 0 ||
    !primaryCountryId ||
    !selectedCountryIds.includes(primaryCountryId) ||
    ownerLocked;

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 bg-gradient-to-l from-blue-50 to-indigo-50/30">
        {admin.profiles?.avatar_url ? (
          <img
            src={admin.profiles.avatar_url}
            alt={name}
            className="w-11 h-11 rounded-2xl object-cover border-2 border-white shadow-sm flex-shrink-0"
          />
        ) : (
          <div className="w-11 h-11 rounded-2xl bg-blue-200 border-2 border-white shadow-sm flex items-center justify-center flex-shrink-0">
            <span className="text-blue-800 font-black text-lg">{name.charAt(0)}</span>
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-bold text-gray-800 text-sm">{name}</h3>
            <RoleBadge role={admin.profiles?.role ?? ''} isOwner={ownerLocked} />
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            {activeCount} / {PERMISSION_FIELDS.length} صلاحية مفعّلة
          </p>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {ownerLocked && (
            <span className="text-xs bg-[#0B1F4D]/10 text-[#0B1F4D] px-2 py-1 rounded-xl font-semibold flex items-center gap-1">
              <Lock size={11} />
              حساب محمي
            </span>
          )}

          {dirty && !ownerLocked && (
            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-xl font-semibold">
              تعديلات غير محفوظة
            </span>
          )}

          <button
            onClick={() =>
              updateMutation.mutate({
                settingId: admin.id,
                userId: admin.user_id,
                permissions: perms,
                countryIds: selectedCountryIds,
                primaryCountryId,
              })
            }
            disabled={saveDisabled}
            className="btn-primary text-sm flex items-center gap-1.5 disabled:opacity-50"
          >
            {updateMutation.isPending ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <ShieldCheck size={13} />
            )}
            حفظ
          </button>
        </div>
      </div>

      {ownerLocked && (
        <div className="mx-5 mt-4 bg-[#0B1F4D]/5 border border-[#0B1F4D]/10 rounded-2xl p-3 text-xs text-[#0B1F4D] font-semibold">
          هذا الحساب هو مالك النظام، لذلك لا يمكن تعديل دوره أو تعطيله أو حذفه من المشرفين.
        </div>
      )}

      {/* Quick actions */}
      <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-50">
        <button
          onClick={selectAll}
          disabled={ownerLocked}
          className="flex items-center gap-1 text-xs px-2.5 py-1.5 bg-blue-50 text-blue-700 rounded-xl font-semibold hover:bg-blue-100 transition-colors disabled:opacity-50"
        >
          <CheckSquare size={12} /> تحديد الكل
        </button>

        <button
          onClick={clearAll}
          disabled={ownerLocked}
          className="flex items-center gap-1 text-xs px-2.5 py-1.5 bg-gray-100 text-gray-600 rounded-xl font-semibold hover:bg-gray-200 transition-colors disabled:opacity-50"
        >
          <Square size={12} /> إلغاء الكل
        </button>

        <span className="text-xs text-gray-400 mr-auto">التغييرات مباشرة على Supabase</span>
      </div>

      {/* Countries */}
      <div className="p-5 border-b border-gray-50">
        <CountryAccessSelector
          countries={countries}
          selectedCountryIds={selectedCountryIds}
          primaryCountryId={primaryCountryId}
          onToggleCountry={toggleCountry}
          onSetPrimary={handleSetPrimary}
          disabled={ownerLocked}
        />
      </div>

      {/* Permissions grouped */}
      <div className="p-4 space-y-3 max-h-[500px] overflow-y-auto">
        {PERMISSION_SECTIONS_GROUPED.map(([sectionName, fields]) => {
          const sectionKeys = fields.map((f) => f.key);
          const allSectionOn = sectionKeys.every((k) => perms[k]);
          const someSectionOn = sectionKeys.some((k) => perms[k]);

          return (
            <div key={sectionName} className="border border-gray-100 rounded-2xl overflow-hidden">
              <button
                onClick={() => toggleSection(sectionKeys)}
                disabled={ownerLocked}
                className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors disabled:opacity-60"
              >
                <span className="text-sm font-bold text-gray-700">{sectionName}</span>
                <div
                  className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${
                    allSectionOn
                      ? 'bg-blue-600 border-blue-600'
                      : someSectionOn
                      ? 'bg-blue-200 border-blue-400'
                      : 'border-gray-300'
                  }`}
                >
                  {allSectionOn && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                  {someSectionOn && !allSectionOn && <div className="w-2 h-0.5 bg-blue-600 rounded" />}
                </div>
              </button>

              <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {fields.map((field) => {
                  const active = perms[field.key];

                  return (
                    <label
                      key={field.key}
                      className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all ${
                        active ? 'bg-blue-50 border border-blue-100' : 'hover:bg-gray-50 border border-transparent'
                      } ${ownerLocked ? 'opacity-70 cursor-default' : ''}`}
                    >
                      <button
                        type="button"
                        onClick={() => togglePerm(field.key)}
                        disabled={ownerLocked}
                        className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                          active ? 'bg-blue-600 border-blue-600' : 'border-gray-300 hover:border-blue-400'
                        }`}
                      >
                        {active && (
                          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </button>

                      <span className="text-sm">{field.icon}</span>
                      <span className={`text-sm ${active ? 'font-semibold text-blue-800' : 'text-gray-700'}`}>
                        {field.label}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   Add Admin Modal (pick from existing profiles)
════════════════════════════════════════════════════════════ */
interface AddAdminModalProps {
  onClose: () => void;
  existingUserIds: string[];
}
function AddAdminModal({ onClose, existingUserIds }: AddAdminModalProps) {
  const { data: profiles = [], isLoading } = useAdminProfiles();
  const { data: countries = [] } = useAdminCountries();
  const createMutation = useCreateAdminSetting();

  const [selectedUserId, setSelectedUserId] = useState('');
  const [perms, setPerms] = useState<AdminPermissions>({ ...DEFAULT_PERMISSIONS });
  const [selectedCountryIds, setSelectedCountryIds] = useState<string[]>([]);
  const [primaryCountryId, setPrimaryCountryId] = useState<string | null>(null);

  const available = profiles.filter((p: any) => !existingUserIds.includes(p.id));

  const handleAdd = async () => {
    if (!selectedUserId) {
      toast.error('اختر مستخدماً');
      return;
    }

    if (selectedCountryIds.length === 0) {
      toast.error('اختر دولة واحدة على الأقل');
      return;
    }

    const resolvedPrimary = primaryCountryId && selectedCountryIds.includes(primaryCountryId)
      ? primaryCountryId
      : selectedCountryIds[0];

    await createMutation.mutateAsync({
      userId: selectedUserId,
      permissions: perms,
      countryIds: selectedCountryIds,
      primaryCountryId: resolvedPrimary,
    });

    onClose();
  };

  const togglePerm = (key: keyof AdminPermissions) =>
    setPerms((p) => ({ ...p, [key]: !p[key] }));

  const toggleCountry = (countryId: string) => {
    setSelectedCountryIds((prev) => {
      const exists = prev.includes(countryId);
      const next = exists ? prev.filter((id) => id !== countryId) : [...prev, countryId];

      if (next.length === 0) {
        setPrimaryCountryId(null);
      } else if (!next.includes(primaryCountryId ?? '')) {
        setPrimaryCountryId(next[0]);
      }

      return next;
    });
  };

  const selectedProfile = available.find((p: any) => p.id === selectedUserId);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto" dir="rtl">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl my-6">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
              <UserPlus size={18} className="text-blue-700" />
            </div>
            <h2 className="font-bold text-gray-800">ربط مشرف موجود</h2>
          </div>

          <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 text-gray-400">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Select profile */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">اختر المستخدم</label>
            <div className="relative">
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className="input-field text-sm py-3 pr-4"
              >
                <option value="">— اختر مستخدماً —</option>
                {available.map((p: any) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name || 'بدون اسم'} {p.email ? `(${p.email})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {isLoading && (
              <p className="text-xs text-gray-400 mt-2">جارٍ تحميل المستخدمين...</p>
            )}
          </div>

          {/* Summary */}
          {selectedProfile && (
            <div className="flex items-center gap-4 p-4 bg-blue-50 rounded-2xl border border-blue-100">
              <div className="w-12 h-12 bg-blue-200 rounded-2xl flex items-center justify-center flex-shrink-0">
                <span className="text-blue-800 font-black text-lg">
                  {(selectedProfile.full_name || 'م').charAt(0)}
                </span>
              </div>

              <div className="flex-1 min-w-0">
                <p className="font-bold text-gray-800">{selectedProfile.full_name || 'بدون اسم'}</p>
                <p className="text-sm text-gray-500" dir="ltr">
                  {selectedProfile.email || 'لا يوجد بريد'}
                </p>
              </div>

              <RoleBadge role={selectedProfile.role || 'admin'} />
            </div>
          )}

          {/* Countries */}
          <CountryAccessSelector
            countries={countries}
            selectedCountryIds={selectedCountryIds}
            primaryCountryId={primaryCountryId}
            onToggleCountry={toggleCountry}
            onSetPrimary={setPrimaryCountryId}
          />

          {/* Permissions */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <ShieldCheck size={15} className="text-[#0B1F4D]" />
              <h3 className="font-bold text-gray-700">الصلاحيات</h3>
              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-semibold">
                {countActivePerms(perms)} / {PERMISSION_FIELDS.length}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1">
              {PERMISSION_FIELDS.map((field) => {
                const active = perms[field.key];
                return (
                  <label
                    key={field.key}
                    className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all border ${
                      active ? 'bg-blue-50 border-blue-200' : 'hover:bg-gray-50 border-gray-100'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => togglePerm(field.key)}
                      className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                        active ? 'bg-blue-600 border-blue-600' : 'border-gray-300 hover:border-blue-400'
                      }`}
                    >
                      {active && (
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                    <span>{field.icon}</span>
                    <span className={`text-sm ${active ? 'font-semibold text-blue-800' : 'text-gray-700'}`}>
                      {field.label}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="flex justify-between pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">
              إلغاء
            </button>

            <button
              onClick={handleAdd}
              disabled={createMutation.isPending || !selectedUserId || selectedCountryIds.length === 0}
              className="btn-primary flex items-center gap-2 disabled:opacity-50"
            >
              {createMutation.isPending ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <ShieldCheck size={14} />
              )}
              ربط المستخدم كمشرف
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   Create brand-new admin
════════════════════════════════════════════════════════════ */
interface CreateNewAdminModalProps {
  onClose: () => void;
}
function CreateNewAdminModal({ onClose }: CreateNewAdminModalProps) {
  const createMutation = useCreateNewAdminUser();
  const { data: countries = [] } = useAdminCountries();

  const [form, setForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    role: 'admin',
    password: '',
    confirmPassword: '',
  });

  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [perms, setPerms] = useState<AdminPermissions>({ ...DEFAULT_PERMISSIONS });
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedCountryIds, setSelectedCountryIds] = useState<string[]>([]);
  const [primaryCountryId, setPrimaryCountryId] = useState<string | null>(null);

  const selectedRole = ROLE_OPTIONS.find((r) => r.value === form.role);
  const activePermsCount = countActivePerms(perms);

  const togglePerm = (key: keyof AdminPermissions) =>
    setPerms((p) => ({ ...p, [key]: !p[key] }));

  const setAllPerms = (val: boolean) => {
    const next = { ...DEFAULT_PERMISSIONS };
    (Object.keys(next) as (keyof AdminPermissions)[]).forEach((k) => {
      next[k] = val;
    });
    setPerms(next);
  };

  const toggleCountry = (countryId: string) => {
    setSelectedCountryIds((prev) => {
      const exists = prev.includes(countryId);
      const next = exists ? prev.filter((id) => id !== countryId) : [...prev, countryId];

      if (next.length === 0) {
        setPrimaryCountryId(null);
      } else if (!next.includes(primaryCountryId ?? '')) {
        setPrimaryCountryId(next[0]);
      }

      return next;
    });
  };

  const handleNext = (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.full_name.trim()) {
      toast.error('الاسم مطلوب');
      return;
    }

    if (!form.email.trim() || !/^[^@]+@[^@]+\.[^@]+$/.test(form.email)) {
      toast.error('بريد إلكتروني غير صالح');
      return;
    }

    if (form.password.length < 8) {
      toast.error('كلمة المرور يجب 8 أحرف على الأقل');
      return;
    }

    if (form.password !== form.confirmPassword) {
      toast.error('كلمتا المرور غير متطابقتين');
      return;
    }

    setStep(2);
  };

  const handleCreate = async () => {
    if (selectedCountryIds.length === 0) {
      toast.error('اختر دولة واحدة على الأقل');
      return;
    }

    const resolvedPrimary =
      primaryCountryId && selectedCountryIds.includes(primaryCountryId)
        ? primaryCountryId
        : selectedCountryIds[0];

    await createMutation.mutateAsync({
      email: form.email.trim().toLowerCase(),
      password: form.password,
      full_name: form.full_name.trim(),
      phone: form.phone.trim() || undefined,
      role: form.role,
      permissions: perms,
      country_ids: selectedCountryIds,
      primary_country_id: resolvedPrimary,
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto" dir="rtl">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl my-6 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 bg-[#0B1F4D]/5">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-[#0B1F4D] rounded-2xl flex items-center justify-center shadow-md">
              <Shield size={20} className="text-[#D4AF37]" />
            </div>
            <div>
              <h2 className="font-black text-gray-800">إنشاء مشرف جديد</h2>
              <p className="text-xs text-gray-400">صلاحية مالك النظام فقط</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black transition-all ${
                  step === 1 ? 'bg-[#0B1F4D] text-white' : 'bg-green-500 text-white'
                }`}
              >
                {step > 1 ? <Check size={12} /> : '1'}
              </div>

              <div className={`w-8 h-0.5 ${step === 2 ? 'bg-[#0B1F4D]' : 'bg-gray-200'}`} />

              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black transition-all ${
                  step === 2 ? 'bg-[#0B1F4D] text-white' : 'bg-gray-200 text-gray-400'
                }`}
              >
                2
              </div>
            </div>

            <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 text-gray-400">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="p-6">
          {/* ── Step 1: Basic Info ── */}
          {step === 1 && (
            <form onSubmit={handleNext} className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">الاسم الكامل</label>
                  <input
                    value={form.full_name}
                    onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
                    className="input-field"
                    placeholder="اسم المشرف"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">البريد الإلكتروني</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    className="input-field"
                    placeholder="admin@example.com"
                    dir="ltr"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">رقم الهاتف</label>
                  <input
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    className="input-field"
                    placeholder="اختياري"
                    dir="ltr"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">الدور</label>
                  <select
                    value={form.role}
                    onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                    className="input-field"
                  >
                    {ROLE_OPTIONS.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">كلمة المرور</label>
                  <div className="relative">
                    <input
                      type={showPw ? 'text' : 'password'}
                      value={form.password}
                      onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                      className="input-field pl-10"
                      placeholder="8 أحرف على الأقل"
                      dir="ltr"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw((s) => !s)}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                    >
                      {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {form.password && <PasswordStrength password={form.password} />}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">تأكيد كلمة المرور</label>
                  <div className="relative">
                    <input
                      type={showConfirm ? 'text' : 'password'}
                      value={form.confirmPassword}
                      onChange={(e) => setForm((f) => ({ ...f, confirmPassword: e.target.value }))}
                      className="input-field pl-10"
                      placeholder="أعد إدخال كلمة المرور"
                      dir="ltr"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm((s) => !s)}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                    >
                      {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-100 rounded-2xl p-3 flex items-start gap-2.5">
                <span className="text-lg mt-0.5">💡</span>
                <div>
                  <p className="text-xs font-bold text-amber-800">ملاحظة للمالك</p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    سيتم إنشاء الحساب فوراً في Supabase Auth وتفعيله. أبلغ المشرف الجديد بكلمة المرور المؤقتة.
                  </p>
                </div>
              </div>

              <div className="flex justify-between pt-2">
                <button type="button" onClick={onClose} className="btn-secondary">
                  إلغاء
                </button>

                <button
                  type="submit"
                  disabled={
                    !form.full_name ||
                    !form.email ||
                    form.password.length < 8 ||
                    form.password !== form.confirmPassword
                  }
                  className="btn-primary flex items-center gap-2 disabled:opacity-50"
                >
                  التالي: الدول والصلاحيات <ChevronDown size={14} className="rotate-[-90deg]" />
                </button>
              </div>
            </form>
          )}

          {/* ── Step 2: Countries + Permissions ── */}
          {step === 2 && (
            <div className="space-y-5">
              <div className="flex items-center gap-4 p-4 bg-[#0B1F4D]/5 rounded-2xl border border-[#0B1F4D]/10">
                <div className="w-12 h-12 bg-[#0B1F4D] rounded-2xl flex items-center justify-center flex-shrink-0">
                  <span className="text-white font-black text-xl">{form.full_name.charAt(0)}</span>
                </div>

                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-800">{form.full_name}</p>
                  <p className="text-sm text-gray-500" dir="ltr">{form.email}</p>
                </div>

                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${selectedRole?.color}`}>
                  {selectedRole?.label}
                </span>
              </div>

              <CountryAccessSelector
                countries={countries}
                selectedCountryIds={selectedCountryIds}
                primaryCountryId={primaryCountryId}
                onToggleCountry={toggleCountry}
                onSetPrimary={setPrimaryCountryId}
              />

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck size={15} className="text-[#0B1F4D]" />
                  <h3 className="font-bold text-gray-700">الصلاحيات</h3>
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-semibold">
                    {activePermsCount} / {PERMISSION_FIELDS.length}
                  </span>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => setAllPerms(true)}
                    className="text-xs px-2.5 py-1.5 bg-blue-50 text-blue-700 rounded-xl font-semibold hover:bg-blue-100 transition-colors flex items-center gap-1"
                  >
                    <CheckSquare size={11} /> تحديد الكل
                  </button>
                  <button
                    onClick={() => setAllPerms(false)}
                    className="text-xs px-2.5 py-1.5 bg-gray-100 text-gray-600 rounded-xl font-semibold hover:bg-gray-200 transition-colors flex items-center gap-1"
                  >
                    <Square size={11} /> إلغاء الكل
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1">
                {PERMISSION_FIELDS.map((field) => {
                  const active = perms[field.key];
                  return (
                    <label
                      key={field.key}
                      className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all border ${
                        active ? 'bg-blue-50 border-blue-200' : 'hover:bg-gray-50 border-gray-100'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => togglePerm(field.key)}
                        className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                          active ? 'bg-blue-600 border-blue-600' : 'border-gray-300 hover:border-blue-400'
                        }`}
                      >
                        {active && (
                          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </button>

                      <span>{field.icon}</span>
                      <span className={`text-sm ${active ? 'font-semibold text-blue-800' : 'text-gray-700'}`}>
                        {field.label}
                      </span>
                    </label>
                  );
                })}
              </div>

              <div className="flex justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="btn-secondary flex items-center gap-1.5"
                >
                  <ChevronDown size={14} className="rotate-90" /> رجوع
                </button>

                <button
                  onClick={handleCreate}
                  disabled={createMutation.isPending || selectedCountryIds.length === 0}
                  className="btn-primary flex items-center gap-2 disabled:opacity-60 bg-[#0B1F4D] hover:bg-[#162d6e]"
                >
                  {createMutation.isPending ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Shield size={14} />
                  )}
                  {createMutation.isPending ? 'جارٍ الإنشاء...' : 'إنشاء الحساب'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   Admin Profile Edit Modal
════════════════════════════════════════════════════════════ */
interface AdminProfileEditModalProps {
  admin: AdminSetting;
  onClose: () => void;
}

function AdminProfileEditModal({ admin, onClose }: AdminProfileEditModalProps) {
  const name    = admin.profiles?.full_name ?? 'مشرف';
  const email   = admin.profiles?.email ?? null;
  const isOwner = isSystemOwner(email);

  const updateProfile = useUpdateAdminProfile();

  const [form, setForm] = useState({
    full_name: admin.profiles?.full_name ?? '',
    phone:     admin.profiles?.phone     ?? '',
  });

  const [avatarFile,    setAvatarFile]    = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [uploading,     setUploading]     = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('يجب اختيار ملف صورة'); return; }
    if (file.size > 3 * 1024 * 1024)    { toast.error('حجم الصورة يجب أن يكون أقل من 3 ميجابايت'); return; }
    setAvatarFile(file);
    const reader = new FileReader();
    reader.onload = () => setAvatarPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleRemoveAvatar = async () => {
    if (!confirm('هل تريد حذف صورة المشرف؟')) return;
    setAvatarFile(null);
    setAvatarPreview(null);
    await updateProfile.mutateAsync({
      userId:     admin.user_id,
      full_name:  form.full_name.trim() || name,
      phone:      form.phone.trim() || null,
      avatar_url: null,
    });
  };

  const handleSave = async () => {
    if (!form.full_name.trim()) { toast.error('الاسم مطلوب'); return; }
    setUploading(true);
    try {
      let newAvatarUrl: string | undefined = undefined;

      if (avatarFile) {
        const ext  = avatarFile.name.split('.').pop() ?? 'jpg';
        const path = `admins/${admin.user_id}.${ext}`;

        const { error: upErr } = await supabase.storage
          .from('avatars')
          .upload(path, avatarFile, { upsert: true, contentType: avatarFile.type });

        if (upErr) { toast.error('فشل رفع الصورة: ' + upErr.message); return; }

        const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
        newAvatarUrl = urlData.publicUrl + `?v=${Date.now()}`;
      }

      await updateProfile.mutateAsync({
        userId:     admin.user_id,
        full_name:  form.full_name.trim(),
        phone:      form.phone.trim() || null,
        avatar_url: newAvatarUrl,
      });

      onClose();
    } catch {
      /* onError في الـ mutation يعرض الـ toast */
    } finally {
      setUploading(false);
    }
  };

  const busy           = uploading || updateProfile.isPending;
  const currentAvatar  = avatarPreview ?? admin.profiles?.avatar_url ?? null;

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto"
      dir="rtl"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md my-4 overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 bg-gradient-to-l from-[#0B1F4D]/5 to-indigo-50/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#0B1F4D] rounded-xl flex items-center justify-center shadow-sm">
              <Settings size={17} className="text-[#D4AF37]" />
            </div>
            <div>
              <h2 className="font-bold text-gray-800">إعدادات المشرف</h2>
              <p className="text-xs text-gray-400 mt-0.5">{name}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-5">

          {/* ─── Avatar ─── */}
          <div className="flex flex-col items-center gap-3">
            <div className="relative">
              {currentAvatar ? (
                <img
                  src={currentAvatar}
                  alt={name}
                  className="w-24 h-24 rounded-2xl object-cover border-4 border-white shadow-lg"
                />
              ) : (
                <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-blue-100 to-indigo-200 border-4 border-white shadow-lg flex items-center justify-center">
                  <span className="text-[#0B1F4D] font-black text-3xl">{name.charAt(0)}</span>
                </div>
              )}

              {/* Camera button */}
              <label
                className="absolute -bottom-2 -left-2 w-8 h-8 bg-[#0B1F4D] rounded-xl flex items-center justify-center cursor-pointer shadow-md hover:bg-[#162d6e] transition-colors"
                title="تغيير الصورة"
              >
                <Camera size={14} className="text-[#D4AF37]" />
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </label>
            </div>

            <div className="text-center">
              <p className="font-bold text-gray-800 text-sm">{name}</p>
              <p className="text-xs text-gray-400" dir="ltr">{email ?? '—'}</p>
            </div>

            {/* Remove avatar */}
            {(currentAvatar || avatarFile) && (
              <button
                type="button"
                onClick={() => {
                  if (avatarFile) { setAvatarFile(null); setAvatarPreview(null); }
                  else handleRemoveAvatar();
                }}
                disabled={busy}
                className="text-xs text-red-500 hover:text-red-700 font-semibold flex items-center gap-1 disabled:opacity-50"
              >
                <X size={11} />
                {avatarFile ? 'إلغاء اختيار الصورة' : 'حذف الصورة الحالية'}
              </button>
            )}
          </div>

          {/* Upload hint */}
          {avatarFile && (
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 flex items-center gap-2 text-xs text-blue-700 font-semibold">
              <Upload size={13} />
              <span>تم الاختيار: <span className="font-mono">{avatarFile.name}</span> — سيتم الرفع عند الحفظ</span>
            </div>
          )}

          {/* ─── Form ─── */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                الاسم الكامل <span className="text-red-500">*</span>
              </label>
              <input
                value={form.full_name}
                onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
                className="input-field"
                placeholder="اسم المشرف الكامل"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">رقم الهاتف</label>
              <input
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                className="input-field"
                placeholder="اختياري"
                dir="ltr"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">البريد الإلكتروني</label>
              <input
                value={email ?? '—'}
                disabled
                className="input-field bg-gray-50 text-gray-400 cursor-not-allowed select-none"
                dir="ltr"
              />
              <p className="text-xs text-gray-400 mt-1.5">البريد الإلكتروني لا يمكن تغييره من هنا</p>
            </div>
          </div>

          {/* Owner notice */}
          {isOwner && (
            <div className="bg-[#0B1F4D]/5 border border-[#0B1F4D]/10 rounded-2xl p-3 flex items-center gap-2 text-xs text-[#0B1F4D] font-semibold">
              <Lock size={12} />
              هذا حساب مالك النظام — يمكن تعديل الاسم والصورة فقط
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 pb-6 pt-2 border-t border-gray-100">
          <button type="button" onClick={onClose} disabled={busy} className="btn-secondary">
            إلغاء
          </button>
          <button
            onClick={handleSave}
            disabled={busy || !form.full_name.trim()}
            className="btn-primary flex items-center gap-2 disabled:opacity-50"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            {uploading ? 'جارٍ الرفع...' : 'حفظ التغييرات'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   Admin Card
════════════════════════════════════════════════════════════ */
interface AdminCardProps {
  admin: AdminSetting;
  isSelected: boolean;
  onSelect: () => void;
}
function AdminCard({ admin, isSelected, onSelect }: AdminCardProps) {
  const toggleStatus = useToggleAdminStatus();
  const updateRole = useUpdateProfileRole();
  const deleteSetting = useDeleteAdminSetting();

  const [showRoleMenu,     setShowRoleMenu]     = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  const name = admin.profiles?.full_name ?? 'مشرف';
  const role = admin.profiles?.role ?? '';
  const email = admin.profiles?.email ?? null;
  const isOwnerAccount = isSystemOwner(email);
  const isActive = admin.profiles?.is_active ?? true;

  const activeCount = countActivePerms({
    can_manage_products: admin.can_manage_products,
    can_manage_orders: admin.can_manage_orders,
    can_manage_users: admin.can_manage_users,
    can_manage_admins: admin.can_manage_admins,
    can_manage_inventory: admin.can_manage_inventory,
    can_manage_coupons: admin.can_manage_coupons,
    can_manage_shipping: admin.can_manage_shipping,
    can_view_analytics: admin.can_view_analytics,
    can_export: admin.can_export,
    can_view_activity_log: admin.can_view_activity_log,
    can_manage_settings: admin.can_manage_settings,
  });

  const countryBadges = admin.accessible_countries?.length
    ? admin.accessible_countries
    : admin.country_id && admin.countries
    ? [
        {
          country_id: admin.country_id,
          is_primary: true,
          countries: admin.countries,
        },
      ]
    : [];

  return (
    <div
      onClick={onSelect}
      className={`bg-white rounded-2xl p-4 shadow-sm cursor-pointer transition-all hover:shadow-md ${
        isSelected ? 'ring-2 ring-blue-500 shadow-md' : ''
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Avatar */}
        {admin.profiles?.avatar_url ? (
          <img
            src={admin.profiles.avatar_url}
            alt={name}
            className="w-11 h-11 rounded-2xl object-cover flex-shrink-0 border-2 border-gray-100"
          />
        ) : (
          <div
            className={`w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 border-2 ${
              isActive ? 'bg-blue-100 border-blue-200' : 'bg-gray-100 border-gray-200'
            }`}
          >
            <span className={`font-black text-lg ${isActive ? 'text-blue-700' : 'text-gray-400'}`}>
              {name.charAt(0)}
            </span>
          </div>
        )}

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <p className={`text-sm font-bold ${isActive ? 'text-gray-800' : 'text-gray-400'}`}>
              {name}
            </p>

            {!isActive && (
              <span className="text-[10px] bg-red-100 text-red-500 px-1.5 py-0.5 rounded-full font-bold">
                معطّل
              </span>
            )}
          </div>

          <div className="text-xs text-gray-400 truncate mb-1" dir="ltr">
            {email || 'لا يوجد بريد'}
          </div>

          {/* Role badge with dropdown */}
          <div className="relative inline-block" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => !isOwnerAccount && setShowRoleMenu((m) => !m)}
              disabled={isOwnerAccount}
              className={`flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${
                isOwnerAccount ? 'bg-[#0B1F4D] text-white cursor-default' : getRoleColor(role)
              }`}
            >
              {isOwnerAccount ? 'مالك النظام' : getRoleLabel(role)}
              {!isOwnerAccount && <ChevronDown size={9} />}
            </button>

            {showRoleMenu && !isOwnerAccount && (
              <div className="absolute top-full mt-1 right-0 bg-white rounded-xl shadow-xl border border-gray-100 z-10 py-1 min-w-[130px]">
                {ROLE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => {
                      updateRole.mutate({ userId: admin.user_id, role: opt.value, userEmail: email });
                      setShowRoleMenu(false);
                    }}
                    className={`w-full text-right px-3 py-1.5 text-xs font-semibold hover:bg-gray-50 flex items-center gap-2 ${
                      role === opt.value ? 'text-blue-700' : 'text-gray-700'
                    }`}
                  >
                    {role === opt.value && <Check size={10} className="text-blue-600" />}
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Countries */}
          <div className="flex flex-wrap gap-1.5 mt-2">
            {countryBadges.length > 0 ? (
              countryBadges.map((country) => (
                <span
                  key={country.country_id}
                  className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                    country.is_primary
                      ? 'bg-[#0B1F4D]/10 text-[#0B1F4D]'
                      : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {country.countries?.name ?? 'دولة'} {country.is_primary ? '• أساسية' : ''}
                </span>
              ))
            ) : (
              <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-red-50 text-red-500">
                بدون دول
              </span>
            )}
          </div>

          {/* Perms summary */}
          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            <span className="text-xs text-gray-400">{activeCount} صلاحية</span>
            <div className="flex gap-0.5">
              {PERMISSION_FIELDS.map((f) => {
                const on = admin[f.key as keyof AdminSetting] as boolean;
                return (
                  <div
                    key={f.key}
                    title={f.label}
                    className={`w-1.5 h-1.5 rounded-full ${on ? 'bg-blue-500' : 'bg-gray-200'}`}
                  />
                );
              })}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          {/* Settings */}
          <button
            onClick={() => setShowSettingsModal(true)}
            className="p-1.5 rounded-lg hover:bg-indigo-50 text-indigo-400 hover:text-indigo-600 transition-colors"
            title="إعدادات الملف الشخصي"
          >
            <Settings size={13} />
          </button>

          {/* Toggle status */}
          <button
            onClick={() =>
              toggleStatus.mutate({
                userId: admin.user_id,
                isActive: !isActive,
                userEmail: email,
              })
            }
            disabled={isOwnerAccount}
            className={`p-1.5 rounded-lg transition-colors ${
              isOwnerAccount
                ? 'opacity-40 cursor-not-allowed text-gray-300'
                : isActive
                ? 'hover:bg-red-50 text-red-400 hover:text-red-600'
                : 'hover:bg-green-50 text-green-500'
            }`}
            title={isOwnerAccount ? 'لا يمكن تعطيل مالك النظام' : isActive ? 'تعطيل الحساب' : 'تفعيل الحساب'}
          >
            <Power size={13} />
          </button>

          {/* Delete */}
          <button
            onClick={() => {
              if (isOwnerAccount) return;
              if (confirm(`هل تريد حذف صلاحيات ${name}؟`)) {
                deleteSetting.mutate({
                  settingId: admin.id,
                  userId: admin.user_id,
                  userEmail: email,
                });
              }
            }}
            disabled={isOwnerAccount}
            className={`p-1.5 rounded-lg transition-colors ${
              isOwnerAccount
                ? 'opacity-40 cursor-not-allowed text-gray-300'
                : 'hover:bg-red-50 text-red-400 hover:text-red-600'
            }`}
            title={isOwnerAccount ? 'لا يمكن حذف مالك النظام' : 'حذف من المشرفين'}
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {isOwnerAccount && (
        <div className="mt-2 pt-2 border-t border-[#0B1F4D]/10 flex items-center gap-1 text-xs text-[#0B1F4D] font-semibold">
          <Lock size={11} /> هذا الحساب محمي ولا يمكن حذفه أو تعطيله أو تغيير دوره
        </div>
      )}

      {isSelected && !isOwnerAccount && (
        <div className="mt-2 pt-2 border-t border-blue-100 flex items-center gap-1 text-xs text-blue-600 font-semibold">
          <Shield size={11} /> جارٍ تعديل الصلاحيات
        </div>
      )}

      {/* Profile edit modal */}
      {showSettingsModal && (
        <AdminProfileEditModal
          admin={admin}
          onClose={() => setShowSettingsModal(false)}
        />
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   Main Page
════════════════════════════════════════════════════════════ */
export default function AdminSettings() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: admins = [], isLoading, isError } = useAdminSettings();

  const isOwner = isSystemOwner(user?.email);

  const [selectedAdminId, setSelectedAdminId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const filtered = admins.filter((a) => {
    if (!search.trim()) return true;

    const q = search.trim().toLowerCase();
    const name = (a.profiles?.full_name ?? '').toLowerCase();
    const role = getRoleLabel(a.profiles?.role ?? '').toLowerCase();
    const email = (a.profiles?.email ?? '').toLowerCase();
    const countries = (a.accessible_countries ?? [])
      .map((c) => c.countries?.name ?? '')
      .join(' ')
      .toLowerCase();

    return (
      name.includes(q) ||
      role.includes(q) ||
      email.includes(q) ||
      countries.includes(q)
    );
  });

  const selectedAdmin = admins.find((a) => a.id === selectedAdminId) ?? null;

  const roleCounts = {
    super_admin: admins.filter((a) => a.profiles?.role === 'super_admin').length,
    admin: admins.filter((a) => a.profiles?.role === 'admin').length,
    manager: admins.filter((a) => a.profiles?.role === 'manager').length,
    other: admins.filter((a) => !['super_admin', 'admin', 'manager'].includes(a.profiles?.role ?? '')).length,
  };

  return (
    <Layout>
      <div className="fade-in" dir="rtl">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="section-title">إعدادات المشرفين</h1>
            <p className="section-subtitle">
              إدارة صلاحيات المشرفين والدول المسموح بها مباشرة من Supabase — {admins.length} مشرف مسجّل
            </p>
          </div>

          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => {
                qc.invalidateQueries({ queryKey: ['admin-settings'] });
                qc.invalidateQueries({ queryKey: ['admin-countries'] });
                toast.info('جارٍ التحديث...');
              }}
              className="p-2.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-500 transition-colors"
              title="تحديث"
            >
              <RefreshCw size={16} />
            </button>

            {isOwner && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-[#0B1F4D] hover:bg-[#162d6e] text-white font-semibold rounded-xl transition-colors text-sm shadow-md"
                title="إنشاء مشرف جديد — صلاحية مالك النظام"
              >
                <Shield size={15} className="text-[#D4AF37]" />
                إنشاء مشرف جديد
              </button>
            )}

            <button
              onClick={() => setShowAddModal(true)}
              className="btn-primary flex items-center gap-2"
            >
              <Plus size={16} /> ربط مشرف موجود
            </button>
          </div>
        </div>

        {/* Owner notice */}
        <div className="bg-[#0B1F4D]/5 border border-[#0B1F4D]/10 rounded-2xl p-4 mb-6 flex items-start gap-3">
          <div className="w-10 h-10 bg-[#0B1F4D] rounded-2xl flex items-center justify-center flex-shrink-0">
            <Crown size={18} className="text-[#D4AF37]" />
          </div>
          <div>
            <p className="text-sm font-bold text-[#0B1F4D]">حماية مالك النظام مفعّلة</p>
            <p className="text-xs text-[#0B1F4D]/80 mt-1 leading-relaxed">
              الإيميل <span dir="ltr" className="font-bold">faresalsaid780@gmail.com</span> لا يمكن حذفه أو تعطيله أو تغيير دوره مطلقًا.
              أما أي مشرف أو مدير آخر، فيمكن إدارته بشكل طبيعي حسب الصلاحيات.
            </p>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[
            { label: 'مدير النظام', value: roleCounts.super_admin, color: 'text-blue-900', bg: 'bg-blue-50', icon: '👑' },
            { label: 'مشرف', value: roleCounts.admin, color: 'text-indigo-700', bg: 'bg-indigo-50', icon: '🛡️' },
            { label: 'مدير', value: roleCounts.manager, color: 'text-blue-600', bg: 'bg-sky-50', icon: '👤' },
            { label: 'أدوار أخرى', value: roleCounts.other, color: 'text-gray-700', bg: 'bg-gray-50', icon: '🔧' },
          ].map((s, i) => (
            <div key={i} className={`${s.bg} rounded-2xl p-4 text-center`}>
              <div className="text-2xl mb-1">{s.icon}</div>
              <p className={`text-xl font-black ${s.color}`}>{isLoading ? '—' : s.value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Loading / Error */}
        {isLoading && (
          <div className="flex items-center justify-center py-24 gap-3 text-gray-400">
            <Loader2 size={28} className="animate-spin" />
            <span>جارٍ تحميل بيانات المشرفين...</span>
          </div>
        )}

        {isError && (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-red-400">
            <AlertCircle size={32} />
            <span className="font-semibold">تعذّر تحميل البيانات</span>
            <p className="text-sm text-gray-400 text-center max-w-xs">
              تأكد من أنك تمتلك صلاحية "إعدادات المشرفين" (can_manage_admins) للوصول لهذه الصفحة
            </p>
          </div>
        )}

        {!isLoading && !isError && (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            {/* ── Admin List ── */}
            <div className="lg:col-span-2 space-y-3">
              <div className="bg-white rounded-2xl p-3 shadow-sm">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="بحث بالاسم أو الدور أو البريد أو الدولة..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="input-field pr-9 text-sm py-2.5 h-auto"
                  />
                  <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                </div>
              </div>

              {filtered.length === 0 ? (
                <div className="bg-white rounded-2xl p-8 text-center text-gray-400 shadow-sm">
                  <User size={32} className="text-gray-200 mx-auto mb-2" />
                  <p className="text-sm">لا يوجد مشرفون</p>
                  <button
                    onClick={() => setShowAddModal(true)}
                    className="mt-3 btn-primary text-xs flex items-center gap-1.5 mx-auto"
                  >
                    <Plus size={12} /> إضافة أول مشرف
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {filtered.map((admin) => (
                    <AdminCard
                      key={admin.id}
                      admin={admin}
                      isSelected={selectedAdminId === admin.id}
                      onSelect={() => setSelectedAdminId(selectedAdminId === admin.id ? null : admin.id)}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* ── Permissions Panel ── */}
            <div className="lg:col-span-3">
              {selectedAdmin ? (
                <PermissionsPanel key={selectedAdmin.id} admin={selectedAdmin} />
              ) : (
                <div className="bg-white rounded-2xl shadow-sm h-72 flex items-center justify-center">
                  <div className="text-center px-6">
                    <ShieldCheck size={48} className="text-gray-200 mx-auto mb-3" />
                    <p className="text-sm font-semibold text-gray-500">اختر مشرفاً لتعديل صلاحياته</p>
                    <p className="text-xs text-gray-400 mt-1">
                      يمكنك الآن أيضًا تحديد أكثر من دولة للمشرف، مع اختيار دولة أساسية
                    </p>
                  </div>
                </div>
              )}

              {!selectedAdmin && (
                <div className="mt-4 bg-blue-50 rounded-2xl p-4">
                  <p className="text-xs font-bold text-blue-800 mb-3">الصلاحيات المتاحة في النظام:</p>
                  <div className="grid grid-cols-2 gap-2">
                    {PERMISSION_FIELDS.map((f) => (
                      <div key={f.key} className="flex items-center gap-2 text-xs text-blue-700">
                        <span>{f.icon}</span>
                        <span className="font-medium">{f.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Add existing user as admin */}
        {showAddModal && (
          <AddAdminModal
            onClose={() => setShowAddModal(false)}
            existingUserIds={admins.map((a) => a.user_id)}
          />
        )}

        {/* Create brand-new admin (owner only) */}
        {showCreateModal && isOwner && (
          <CreateNewAdminModal onClose={() => setShowCreateModal(false)} />
        )}
      </div>
    </Layout>
  );
}