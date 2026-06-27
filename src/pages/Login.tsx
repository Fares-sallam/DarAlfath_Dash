import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLogo } from '@/contexts/LogoContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import {
  Mail,
  ArrowLeft,
  KeyRound,
  RefreshCw,
  BookOpen,
  Loader2,
  ShieldCheck,
  Eye,
  EyeOff,
  Lock,
  CheckCircle2,
} from 'lucide-react';

type Step = 'emailPassword' | 'otp' | 'setPassword';
type Mode = 'login' | 'firstTime' | 'forgotPassword';

function passwordStrength(
  pw: string
): { score: number; label: string; color: string } {
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;

  const map: Record<number, { label: string; color: string }> = {
    0: { label: 'ضعيفة جداً', color: 'bg-red-400' },
    1: { label: 'ضعيفة', color: 'bg-orange-400' },
    2: { label: 'متوسطة', color: 'bg-yellow-400' },
    3: { label: 'جيدة', color: 'bg-blue-500' },
    4: { label: 'قوية', color: 'bg-green-500' },
  };

  return { score, ...map[score] };
}

export default function Login() {
  const navigate = useNavigate();
  const { logoUrl } = useLogo();
  const { user, loading: authLoading } = useAuth();

  const emailInputRef = useRef<HTMLInputElement | null>(null);
  const passwordInputRef = useRef<HTMLInputElement | null>(null);

  const [step, setStep] = useState<Step>('emailPassword');
  const [mode, setMode] = useState<Mode>('login');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');

  const [showPw, setShowPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);

  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(0);

  const pwStrength = passwordStrength(newPw);

  useEffect(() => {
    if (mode === 'login' && step === 'emailPassword' && !authLoading && user) {
      navigate('/', { replace: true });
    }
  }, [user, authLoading, mode, step, navigate]);

  const getEffectiveEmail = () =>
    (emailInputRef.current?.value || email || '').trim().toLowerCase();

  const getEffectivePassword = () =>
    passwordInputRef.current?.value || password || '';

  /* ──────────────────────────────────────────
     Normal login
  ────────────────────────────────────────── */
  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const formData = new FormData(e.currentTarget);
    const formEmail = String(formData.get('email') ?? '');
    const formPassword = String(formData.get('password') ?? '');

    const rawEmail = (formEmail || getEffectiveEmail()).trim().toLowerCase();
    const rawPassword = formPassword || getEffectivePassword();

    if (!rawEmail || !rawPassword) {
      toast.error('أدخل البريد الإلكتروني وكلمة المرور');
      return;
    }

    setEmail(rawEmail);
    setPassword(rawPassword);
    setLoading(true);

    try {
      // بوابة الدخول الآمنة: قفل البريد دقيقتين بعد 5 محاولات فاشلة (ضد التخمين).
      const { data: fnData, error: fnError } = await supabase.functions.invoke('secure-login', {
        body: { email: rawEmail, password: rawPassword },
      });

      let loginError: string | null = null;
      if (fnError) {
        loginError = 'تعذر تسجيل الدخول';
        try {
          const ctx = (fnError as { context?: Response }).context;
          if (ctx) { const b = await ctx.json(); if (b?.error) loginError = b.error; }
        } catch { /* ignore */ }
      } else if (fnData?.error) {
        loginError = fnData.error as string;
      } else if (!fnData?.access_token || !fnData?.refresh_token) {
        loginError = 'تعذر تسجيل الدخول';
      }

      if (loginError) {
        toast.error(loginError);
        return;
      }

      const { data: sessionData, error: setErr } = await supabase.auth.setSession({
        access_token: fnData.access_token,
        refresh_token: fnData.refresh_token,
      });
      if (setErr) {
        toast.error(setErr.message);
        return;
      }

      const userId = sessionData.user?.id ?? fnData.user?.id;
      if (!userId) {
        await supabase.auth.signOut();
        toast.error('تعذّر التحقق من الحساب');
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('is_active')
        .eq('id', userId)
        .maybeSingle();

      if (profileError) {
        console.error('[Login] profile check error:', profileError);
        await supabase.auth.signOut();
        toast.error('تعذّر التحقق من حالة الحساب');
        return;
      }

      if (profile?.is_active === false) {
        await supabase.auth.signOut();
        toast.error('تم تعطيل حسابك. تواصل مع مالك النظام.');
        return;
      }

      toast.success('تم تسجيل الدخول بنجاح');
    } catch (err) {
      console.error('[Login] unexpected error:', err);
      toast.error('خطأ في الاتصال، تحقق من الإنترنت');
    } finally {
      setLoading(false);
    }
  };

  /* ──────────────────────────────────────────
     Send OTP / Recovery code
  ────────────────────────────────────────── */
  const handleSendOtp = async () => {
    const normalizedEmail = getEffectiveEmail();

    if (!normalizedEmail) {
      toast.error('أدخل بريدك الإلكتروني أولاً');
      return;
    }

    setEmail(normalizedEmail);
    setLoading(true);

    try {
      const { data: exists, error: existsError } = await supabase.rpc(
        'check_admin_email_exists',
        {
          p_email: normalizedEmail,
        }
      );

      if (existsError) {
        console.error('[OTP] check_admin_email_exists error:', existsError);
        toast.error('تعذر التحقق من البريد الإلكتروني');
        return;
      }

      if (!exists) {
        toast.error('هذا البريد الإلكتروني غير مسجل في النظام');
        return;
      }

      if (mode === 'forgotPassword') {
        const { error } = await supabase.auth.resetPasswordForEmail(
          normalizedEmail,
          {
            redirectTo: `${window.location.origin}/login`,
          }
        );

        if (error) {
          const lowerMessage = error.message?.toLowerCase() || '';

          if (lowerMessage.includes('rate') || lowerMessage.includes('limit')) {
            toast.error('انتظر دقيقة ثم حاول مجددًا');
          } else {
            toast.error('فشل إرسال كود الاستعادة: ' + error.message);
          }
          return;
        }

        toast.success(`تم إرسال كود الاستعادة إلى ${normalizedEmail}`);
        setStep('otp');
        startResendCountdown();
        return;
      }

      const { error } = await supabase.auth.signInWithOtp({
        email: normalizedEmail,
        options: {
          shouldCreateUser: false,
        },
      });

      if (error) {
        const lowerMessage = error.message?.toLowerCase() || '';

        if (lowerMessage.includes('rate') || lowerMessage.includes('limit')) {
          toast.error('كثير من المحاولات، انتظر دقيقة ثم حاول مجددًا');
        } else {
          toast.error('فشل إرسال الكود: ' + error.message);
        }
        return;
      }

      toast.success(`تم إرسال كود التحقق إلى ${normalizedEmail}`);
      setStep('otp');
      startResendCountdown();
    } catch (err) {
      console.error('[OTP] send error:', err);
      toast.error('حدث خطأ أثناء إرسال الكود');
    } finally {
      setLoading(false);
    }
  };

  const startResendCountdown = () => {
    setResendCountdown(60);

    const iv = setInterval(() => {
      setResendCountdown((p) => {
        if (p <= 1) {
          clearInterval(iv);
          return 0;
        }
        return p - 1;
      });
    }, 1000);
  };

  /* ──────────────────────────────────────────
     Verify OTP / Recovery token
  ────────────────────────────────────────── */
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();

    const token = otp.join('');
    if (token.length < 6) {
      toast.error('أدخل الكود المكون من 6 أرقام');
      return;
    }

    setLoading(true);

    try {
      const verificationType: 'email' | 'recovery' =
        mode === 'forgotPassword' ? 'recovery' : 'email';

      const { error } = await supabase.auth.verifyOtp({
        email: getEffectiveEmail(),
        token,
        type: verificationType,
      });

      if (error) {
        console.error('[OTP] verify error:', error);
        toast.error('الكود غير صحيح أو انتهت صلاحيته');
        return;
      }

      toast.success('تم التحقق من الكود بنجاح');
      setStep('setPassword');
    } catch (err) {
      console.error('[OTP] verify unexpected error:', err);
      toast.error('حدث خطأ أثناء التحقق من الكود');
    } finally {
      setLoading(false);
    }
  };

  /* ──────────────────────────────────────────
     Set Password
  ────────────────────────────────────────── */
  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPw.length < 8) {
      toast.error('كلمة المرور يجب أن تكون 8 أحرف على الأقل');
      return;
    }

    if (newPw !== confirmPw) {
      toast.error('كلمتا المرور غير متطابقتين');
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPw,
        data: { has_password: true },
      });

      if (error) {
        console.error('[Password] updateUser error:', error);
        toast.error('فشل تعيين كلمة المرور: ' + error.message);
        return;
      }

      toast.success(
        mode === 'forgotPassword'
          ? 'تم تغيير كلمة المرور بنجاح!'
          : 'تم تعيين كلمة المرور بنجاح!'
      );

      navigate('/', { replace: true });
    } catch (err) {
      console.error('[Password] unexpected error:', err);
      toast.error('حدث خطأ أثناء حفظ كلمة المرور');
    } finally {
      setLoading(false);
    }
  };

  /* ──────────────────────────────────────────
     OTP helpers
  ────────────────────────────────────────── */
  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;

    const updated = [...otp];
    updated[index] = value.slice(-1);
    setOtp(updated);

    if (value && index < 5) {
      document.getElementById(`otp-${index + 1}`)?.focus();
    }

    if (updated.every((d) => d) && updated.join('').length === 6) {
      setTimeout(() => {
        (
          document.getElementById('otp-form') as HTMLFormElement | null
        )?.requestSubmit();
      }, 100);
    }
  };

  const handleOtpKeyDown = (
    index: number,
    e: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      document.getElementById(`otp-${index - 1}`)?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData
      .getData('text')
      .replace(/\D/g, '')
      .slice(0, 6);

    if (pasted.length === 6) {
      setOtp(pasted.split(''));
      e.preventDefault();
    }
  };

  const resetToMain = () => {
    setStep('emailPassword');
    setMode('login');
    setOtp(['', '', '', '', '', '']);
    setNewPw('');
    setConfirmPw('');
    setPassword('');
  };

  const steps: Step[] =
    mode === 'login'
      ? ['emailPassword']
      : ['emailPassword', 'otp', 'setPassword'];

  const currentIdx = steps.indexOf(step);

  return (
    <div className="min-h-screen flex" dir="rtl">
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-[#0B1F4D] via-[#102A66] to-[#16377A] items-center justify-center p-12 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-64 h-64 rounded-full bg-white/5 -translate-x-1/2 -translate-y-1/2" />
        <div className="absolute bottom-0 right-0 w-96 h-96 rounded-full bg-white/5 translate-x-1/3 translate-y-1/3" />
        <div className="absolute top-1/2 left-1/2 w-48 h-48 rounded-full bg-[#D4AF37]/10 -translate-x-1/2 -translate-y-1/2" />

        <div className="relative z-10 text-center max-w-sm">
          <div className="w-20 h-20 rounded-2xl bg-white/15 flex items-center justify-center mx-auto mb-6 shadow-2xl overflow-hidden">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt="شعار دار الفتح"
                className="w-full h-full object-cover"
              />
            ) : (
              <BookOpen size={40} className="text-[#D4AF37]" />
            )}
          </div>

          <h1 className="text-4xl font-black text-white mb-2">دار الفتح</h1>
          <p className="text-blue-200/80 text-lg mb-8">للنشر والتوزيع</p>

          <div className="space-y-4 text-right">
            {[
              { icon: '📚', text: 'إدارة شاملة لآلاف الكتب الورقية والرقمية' },
              { icon: '📦', text: 'متابعة الطلبات والشحن لجميع محافظات مصر' },
              { icon: '📊', text: 'تحليلات متقدمة وتقارير فورية' },
            ].map((item, i) => (
              <div
                key={i}
                className="flex items-center gap-3 bg-white/10 rounded-2xl px-4 py-3"
              >
                <span className="text-2xl">{item.icon}</span>
                <span className="text-white/90 text-sm font-medium">
                  {item.text}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center bg-gray-50 p-6">
        <div className="w-full max-w-md">
          <div className="lg:hidden text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-[#0B1F4D] flex items-center justify-center mx-auto mb-3 overflow-hidden">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt="شعار دار الفتح"
                  className="w-full h-full object-cover"
                />
              ) : (
                <BookOpen size={30} className="text-[#D4AF37]" />
              )}
            </div>
            <h1 className="text-2xl font-black text-[#0B1F4D]">دار الفتح</h1>
          </div>

          <div className="bg-white rounded-3xl shadow-xl p-8">
            {step === 'emailPassword' && (
              <>
                <div className="mb-7">
                  <div className="flex items-center gap-3 mb-1">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                      {mode === 'forgotPassword' ? (
                        <Lock size={18} className="text-blue-700" />
                      ) : (
                        <Mail size={18} className="text-blue-700" />
                      )}
                    </div>
                    <h2 className="text-xl font-black text-gray-900">
                      {mode === 'forgotPassword'
                        ? 'استعادة كلمة المرور'
                        : mode === 'firstTime'
                        ? 'تسجيل أول دخول'
                        : 'تسجيل الدخول'}
                    </h2>
                  </div>

                  <p className="text-sm text-gray-500 mt-1">
                    {mode === 'forgotPassword'
                      ? 'أدخل بريدك وسنرسل كود تحقق لإعادة تعيين كلمة المرور'
                      : mode === 'firstTime'
                      ? 'أدخل بريدك وسنرسل كود التحقق لتعيين كلمة المرور لأول مرة'
                      : 'أدخل بريدك الإلكتروني وكلمة المرور'}
                  </p>
                </div>

                {mode === 'login' && (
                  <form onSubmit={handleLogin} className="space-y-5" autoComplete="on">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        البريد الإلكتروني
                      </label>
                      <div className="relative">
                        <input
                          ref={emailInputRef}
                          type="email"
                          name="email"
                          autoComplete="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="admin@darelfath.com"
                          required
                          autoFocus
                          className="w-full h-12 pr-11 pl-4 rounded-2xl border-2 border-gray-200 bg-gray-50 text-sm focus:outline-none focus:border-blue-600 transition-colors"
                          dir="ltr"
                        />
                        <Mail
                          size={17}
                          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        كلمة المرور
                      </label>
                      <div className="relative">
                        <input
                          ref={passwordInputRef}
                          type={showPw ? 'text' : 'password'}
                          name="password"
                          autoComplete="current-password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="••••••••"
                          required
                          className="w-full h-12 pr-11 pl-10 rounded-2xl border-2 border-gray-200 bg-gray-50 text-sm focus:outline-none focus:border-blue-600 transition-colors"
                          dir="ltr"
                        />
                        <Lock
                          size={17}
                          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPw((s) => !s)}
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                          {showPw ? <EyeOff size={17} /> : <Eye size={17} />}
                        </button>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={loading || authLoading}
                      className="w-full h-12 bg-[#0B1F4D] hover:bg-[#162d6e] disabled:opacity-60 text-white font-bold rounded-2xl flex items-center justify-center gap-2 transition-colors"
                    >
                      {loading || authLoading ? (
                        <Loader2 size={18} className="animate-spin" />
                      ) : (
                        <KeyRound size={18} />
                      )}
                      {loading || authLoading
                        ? 'جارٍ تسجيل الدخول...'
                        : 'تسجيل الدخول'}
                    </button>

                    <div className="flex items-center justify-between pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setMode('forgotPassword');
                          setPassword('');
                        }}
                        className="text-sm text-blue-700 font-semibold hover:underline"
                      >
                        نسيت كلمة المرور؟
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setMode('firstTime');
                          setPassword('');
                        }}
                        className="text-sm text-gray-500 font-semibold hover:underline"
                      >
                        أول مرة؟ تعيين كلمة مرور
                      </button>
                    </div>
                  </form>
                )}

                {(mode === 'forgotPassword' || mode === 'firstTime') && (
                  <div className="space-y-5">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        البريد الإلكتروني
                      </label>
                      <div className="relative">
                        <input
                          ref={emailInputRef}
                          type="email"
                          name="email"
                          autoComplete="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="admin@darelfath.com"
                          required
                          autoFocus
                          className="w-full h-12 pr-11 pl-4 rounded-2xl border-2 border-gray-200 bg-gray-50 text-sm focus:outline-none focus:border-blue-600 transition-colors"
                          dir="ltr"
                        />
                        <Mail
                          size={17}
                          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400"
                        />
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleSendOtp}
                      disabled={loading}
                      className="w-full h-12 bg-[#0B1F4D] hover:bg-[#162d6e] disabled:opacity-60 text-white font-bold rounded-2xl flex items-center justify-center gap-2 transition-colors"
                    >
                      {loading ? (
                        <Loader2 size={18} className="animate-spin" />
                      ) : (
                        <Mail size={18} />
                      )}
                      {loading
                        ? 'جارٍ الإرسال...'
                        : mode === 'forgotPassword'
                        ? 'إرسال كود الاستعادة'
                        : 'إرسال كود التحقق'}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setMode('login');
                        setStep('emailPassword');
                        setOtp(['', '', '', '', '', '']);
                        setNewPw('');
                        setConfirmPw('');
                      }}
                      className="w-full flex items-center justify-center gap-1.5 text-sm text-gray-500 font-semibold hover:underline"
                    >
                      <ArrowLeft size={13} /> العودة لتسجيل الدخول
                    </button>
                  </div>
                )}
              </>
            )}

            {step === 'otp' && (
              <>
                <div className="mb-7">
                  <button
                    onClick={resetToMain}
                    className="flex items-center gap-1.5 text-gray-400 hover:text-gray-600 text-sm mb-4 transition-colors"
                  >
                    <ArrowLeft size={14} /> تغيير البريد
                  </button>

                  <div className="flex items-center gap-3 mb-1">
                    <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center">
                      <ShieldCheck size={18} className="text-green-600" />
                    </div>
                    <h2 className="text-xl font-black text-gray-900">
                      {mode === 'forgotPassword' ? 'كود الاستعادة' : 'كود التحقق'}
                    </h2>
                  </div>

                  <p className="text-sm text-gray-500 mt-1">
                    تم إرسال كود مكون من{' '}
                    <span className="font-bold text-blue-700">6 أرقام</span> إلى
                  </p>
                  <p className="text-sm font-bold text-gray-800 mt-0.5" dir="ltr">
                    {email}
                  </p>
                </div>

                <form id="otp-form" onSubmit={handleVerifyOtp} className="space-y-6">
                  <div className="flex justify-center gap-3" dir="ltr">
                    {otp.map((digit, i) => (
                      <input
                        key={i}
                        id={`otp-${i}`}
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        value={digit}
                        onChange={(e) => handleOtpChange(i, e.target.value)}
                        onKeyDown={(e) => handleOtpKeyDown(i, e)}
                        onPaste={handleOtpPaste}
                        className={`w-12 h-14 text-center text-xl font-black rounded-2xl border-2 transition-all focus:outline-none ${
                          digit
                            ? 'border-blue-600 bg-blue-50 text-blue-800'
                            : 'border-gray-200 bg-gray-50 focus:border-blue-400'
                        }`}
                      />
                    ))}
                  </div>

                  <button
                    type="submit"
                    disabled={loading || otp.join('').length < 6}
                    className="w-full h-12 bg-[#0B1F4D] hover:bg-[#162d6e] disabled:opacity-60 text-white font-bold rounded-2xl flex items-center justify-center gap-2 transition-colors"
                  >
                    {loading ? (
                      <Loader2 size={18} className="animate-spin" />
                    ) : (
                      <KeyRound size={18} />
                    )}
                    {loading ? 'جارٍ التحقق...' : 'تأكيد الكود'}
                  </button>

                  <div className="text-center">
                    {resendCountdown > 0 ? (
                      <p className="text-sm text-gray-400">
                        إعادة الإرسال بعد{' '}
                        <span className="font-bold text-blue-700">
                          {resendCountdown}
                        </span>{' '}
                        ثانية
                      </p>
                    ) : (
                      <button
                        type="button"
                        onClick={handleSendOtp}
                        className="text-sm text-blue-700 font-semibold hover:underline flex items-center gap-1.5 mx-auto"
                      >
                        <RefreshCw size={13} /> لم تستلم الكود؟ إعادة الإرسال
                      </button>
                    )}
                  </div>
                </form>

                <div className="mt-5 bg-amber-50 border border-amber-100 rounded-2xl p-3 flex items-start gap-2">
                  <span className="text-lg mt-0.5">💡</span>
                  <p className="text-xs text-amber-800">
                    افحص مجلد <strong>Spam</strong> أو <strong>Junk</strong> إذا لم يصل الكود
                  </p>
                </div>
              </>
            )}

            {step === 'setPassword' && (
              <>
                <div className="mb-7">
                  <div className="flex items-center gap-3 mb-1">
                    <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center">
                      <Lock size={18} className="text-purple-700" />
                    </div>
                    <h2 className="text-xl font-black text-gray-900">
                      {mode === 'forgotPassword'
                        ? 'كلمة مرور جديدة'
                        : 'تعيين كلمة المرور'}
                    </h2>
                  </div>

                  <div className="mt-2 flex items-center gap-1.5 text-xs text-green-600 font-semibold">
                    <CheckCircle2 size={13} /> تم التحقق من البريد الإلكتروني
                  </div>
                </div>

                <form onSubmit={handleSetPassword} className="space-y-5">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      كلمة المرور
                    </label>
                    <div className="relative">
                      <input
                        type={showNewPw ? 'text' : 'password'}
                        value={newPw}
                        onChange={(e) => setNewPw(e.target.value)}
                        placeholder="8 أحرف على الأقل"
                        required
                        autoFocus
                        autoComplete="new-password"
                        className="w-full h-12 pr-11 pl-10 rounded-2xl border-2 border-gray-200 bg-gray-50 text-sm focus:outline-none focus:border-purple-500 transition-colors"
                        dir="ltr"
                      />
                      <Lock
                        size={17}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPw((s) => !s)}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showNewPw ? <EyeOff size={17} /> : <Eye size={17} />}
                      </button>
                    </div>

                    {newPw && (
                      <div className="mt-2">
                        <div className="flex gap-1 mb-1">
                          {[0, 1, 2, 3].map((i) => (
                            <div
                              key={i}
                              className={`h-1.5 flex-1 rounded-full transition-all ${
                                i < pwStrength.score ? pwStrength.color : 'bg-gray-100'
                              }`}
                            />
                          ))}
                        </div>
                        <p className="text-xs text-gray-500">
                          قوة: <span className="font-semibold">{pwStrength.label}</span>
                        </p>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      تأكيد كلمة المرور
                    </label>
                    <div className="relative">
                      <input
                        type={showConfirmPw ? 'text' : 'password'}
                        value={confirmPw}
                        onChange={(e) => setConfirmPw(e.target.value)}
                        placeholder="أعد إدخال كلمة المرور"
                        required
                        autoComplete="new-password"
                        className={`w-full h-12 pr-11 pl-10 rounded-2xl border-2 bg-gray-50 text-sm focus:outline-none transition-colors ${
                          confirmPw && newPw !== confirmPw
                            ? 'border-red-400'
                            : confirmPw && newPw === confirmPw
                            ? 'border-green-400'
                            : 'border-gray-200 focus:border-purple-500'
                        }`}
                        dir="ltr"
                      />
                      <Lock
                        size={17}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPw((s) => !s)}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showConfirmPw ? <EyeOff size={17} /> : <Eye size={17} />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading || newPw.length < 8 || newPw !== confirmPw}
                    className="w-full h-12 bg-[#0B1F4D] hover:bg-[#162d6e] disabled:opacity-60 text-white font-bold rounded-2xl flex items-center justify-center gap-2 transition-colors"
                  >
                    {loading ? (
                      <Loader2 size={18} className="animate-spin" />
                    ) : (
                      <Lock size={18} />
                    )}
                    {loading
                      ? 'جارٍ الحفظ...'
                      : mode === 'forgotPassword'
                      ? 'تغيير كلمة المرور'
                      : 'تعيين كلمة المرور والدخول'}
                  </button>
                </form>
              </>
            )}

            {mode !== 'login' && (
              <div className="flex justify-center gap-2 mt-6">
                {steps.map((s, i) => {
                  const isActive = step === s;
                  const isDone = i < currentIdx;

                  return (
                    <div
                      key={s}
                      className={`rounded-full transition-all ${
                        isActive
                          ? 'w-6 h-2 bg-[#0B1F4D]'
                          : isDone
                          ? 'w-2 h-2 bg-[#D4AF37]'
                          : 'w-2 h-2 bg-gray-200'
                      }`}
                    />
                  );
                })}
              </div>
            )}
          </div>

          <p className="text-center text-xs text-gray-400 mt-4">
            دار الفتح للنشر والتوزيع · © 2025 جميع الحقوق محفوظة
          </p>
        </div>
      </div>
    </div>
  );
}