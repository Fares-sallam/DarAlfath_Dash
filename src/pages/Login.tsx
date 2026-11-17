import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { AUTH_CAPTCHA_ERROR, getAuthCaptchaToken, isCaptchaError } from '@/lib/authCaptcha';
import { toast } from 'sonner';
import {
  Mail,
  ArrowLeft,
  KeyRound,
  RefreshCw,
  BookOpen,
  Truck,
  BarChart3,
  Lightbulb,
  Loader2,
  ShieldCheck,
  Eye,
  EyeOff,
  Lock,
  CheckCircle2,
} from 'lucide-react';
import '@/components/links/linksPageFonts.css';
import './login.css';

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

  // the four steps run from a warning red through the house colours
  const map: Record<number, { label: string; color: string }> = {
    0: { label: 'ضعيفة جداً', color: '#d96a6a' },
    1: { label: 'ضعيفة', color: '#e39a52' },
    2: { label: 'متوسطة', color: '#2aa3ab' },
    3: { label: 'جيدة', color: '#054180' },
    4: { label: 'قوية', color: '#067e70' },
  };

  return { score, ...map[score] };
}

export default function Login() {
  const navigate = useNavigate();
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
      const captchaToken = await getAuthCaptchaToken();
      const { data: fnData, error: fnError } = await supabase.functions.invoke('secure-login', {
        body: { email: rawEmail, password: rawPassword, captchaToken },
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
        const captchaToken = await getAuthCaptchaToken();
        const { error } = await supabase.auth.resetPasswordForEmail(
          normalizedEmail,
          {
            redirectTo: `${window.location.origin}/login`,
            captchaToken,
          }
        );

        if (error) {
          const lowerMessage = error.message?.toLowerCase() || '';

          if (isCaptchaError(lowerMessage)) {
            toast.error(AUTH_CAPTCHA_ERROR);
          } else if (lowerMessage.includes('rate') || lowerMessage.includes('limit')) {
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

      const otpCaptchaToken = await getAuthCaptchaToken();
      const { error } = await supabase.auth.signInWithOtp({
        email: normalizedEmail,
        options: {
          shouldCreateUser: false,
          captchaToken: otpCaptchaToken,
        },
      });

      if (error) {
        const lowerMessage = error.message?.toLowerCase() || '';

        if (isCaptchaError(lowerMessage)) {
          toast.error(AUTH_CAPTCHA_ERROR);
        } else if (lowerMessage.includes('rate') || lowerMessage.includes('limit')) {
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

  const FEATURES = [
    { icon: BookOpen, text: 'إدارة شاملة لآلاف الكتب الورقية والرقمية' },
    { icon: Truck, text: 'متابعة الطلبات والشحن لجميع محافظات مصر' },
    { icon: BarChart3, text: 'تحليلات متقدمة وتقارير فورية' },
  ];

  const EmailField = (
    <div>
      <label className="lg-label" htmlFor="login-email">البريد الإلكتروني</label>
      <div className="lg-input">
        <input
          id="login-email"
          ref={emailInputRef}
          type="email"
          name="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="admin@darelfath.com"
          required
          autoFocus
          className="lg-input__el"
          dir="ltr"
        />
        <Mail size={18} className="lg-input__icon" />
      </div>
    </div>
  );

  return (
    <div className="lg-root" dir="rtl">
      <aside className="lg-brand">
        <div className="lg-brand__pattern" aria-hidden="true" />
        <div className="lg-brand__inner">
          <img className="lg-brand__logo lg-rise" style={{ '--i': 0 } as React.CSSProperties} src="/branding/logo-horizontal-dark.svg" alt="دار الفتح للنشر والتوزيع" width={3214} height={850} />
          <h1 className="lg-brand__title lg-rise" style={{ '--i': 1 } as React.CSSProperties}>
            المكتبة والمتجر والطلبات،<br /><em>في لوحة واحدة</em>
          </h1>
          <ul className="lg-brand__list">
            {FEATURES.map(({ icon: Icon, text }, i) => (
              <li key={text} className="lg-brand__item lg-rise" style={{ '--i': i + 2 } as React.CSSProperties}>
                <span><Icon size={19} aria-hidden="true" /></span>
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <main className="lg-main">
        <div className="lg-wash" aria-hidden="true" />
        <div className="lg-wash lg-wash--end" aria-hidden="true" />

        <div className="lg-col">
          <img className="lg-mobile-logo lg-rise" src="/branding/logo-horizontal.svg" alt="دار الفتح للنشر والتوزيع" width={3214} height={850} />

          <section className="lg-card lg-rise" style={{ '--i': 1 } as React.CSSProperties}>
            {step === 'emailPassword' && (
              <div className="lg-step" key={`main-${mode}`}>
                <div className="lg-head">
                  <div className="lg-head__row">
                    <div className="lg-chip">
                      {mode === 'forgotPassword' ? <Lock size={20} /> : <Mail size={20} />}
                    </div>
                    <h2 className="lg-title">
                      {mode === 'forgotPassword'
                        ? 'استعادة كلمة المرور'
                        : mode === 'firstTime'
                        ? 'تسجيل أول دخول'
                        : 'تسجيل الدخول'}
                    </h2>
                  </div>
                  <p className="lg-sub">
                    {mode === 'forgotPassword'
                      ? 'أدخل بريدك وسنرسل كود تحقق لإعادة تعيين كلمة المرور'
                      : mode === 'firstTime'
                      ? 'أدخل بريدك وسنرسل كود التحقق لتعيين كلمة المرور لأول مرة'
                      : 'أدخل بريدك الإلكتروني وكلمة المرور'}
                  </p>
                </div>

                {mode === 'login' && (
                  <form onSubmit={handleLogin} className="lg-form" autoComplete="on">
                    {EmailField}

                    <div>
                      <label className="lg-label" htmlFor="login-password">كلمة المرور</label>
                      <div className="lg-input">
                        <input
                          id="login-password"
                          ref={passwordInputRef}
                          type={showPw ? 'text' : 'password'}
                          name="password"
                          autoComplete="current-password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="••••••••"
                          required
                          className="lg-input__el lg-input__el--eye"
                          dir="ltr"
                        />
                        <Lock size={18} className="lg-input__icon" />
                        <button
                          type="button"
                          onClick={() => setShowPw((v) => !v)}
                          className="lg-input__eye"
                          aria-label={showPw ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                        >
                          {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                      </div>
                    </div>

                    <button type="submit" disabled={loading || authLoading} className="lg-btn">
                      {loading || authLoading ? <Loader2 size={19} className="animate-spin" /> : <KeyRound size={19} />}
                      {loading || authLoading ? 'جارٍ تسجيل الدخول...' : 'تسجيل الدخول'}
                    </button>

                    <div className="lg-links">
                      <button
                        type="button"
                        onClick={() => {
                          setMode('forgotPassword');
                          setPassword('');
                        }}
                        className="lg-link"
                      >
                        نسيت كلمة المرور؟
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setMode('firstTime');
                          setPassword('');
                        }}
                        className="lg-link lg-link--muted"
                      >
                        أول مرة؟ تعيين كلمة مرور
                      </button>
                    </div>
                  </form>
                )}

                {(mode === 'forgotPassword' || mode === 'firstTime') && (
                  <div className="lg-form">
                    {EmailField}

                    <button type="button" onClick={handleSendOtp} disabled={loading} className="lg-btn">
                      {loading ? <Loader2 size={19} className="animate-spin" /> : <Mail size={19} />}
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
                      className="lg-link lg-link--muted lg-link--center"
                    >
                      <ArrowLeft size={14} /> العودة لتسجيل الدخول
                    </button>
                  </div>
                )}
              </div>
            )}

            {step === 'otp' && (
              <div className="lg-step" key="otp">
                <div className="lg-head">
                  <button type="button" onClick={resetToMain} className="lg-back">
                    <ArrowLeft size={14} /> تغيير البريد
                  </button>
                  <div className="lg-head__row">
                    <div className="lg-chip lg-chip--teal"><ShieldCheck size={20} /></div>
                    <h2 className="lg-title">{mode === 'forgotPassword' ? 'كود الاستعادة' : 'كود التحقق'}</h2>
                  </div>
                  <p className="lg-sub">
                    تم إرسال كود مكون من <strong style={{ color: '#054180' }}>6 أرقام</strong> إلى
                    <br />
                    <span dir="ltr" style={{ fontWeight: 700, color: '#0e2542' }}>{email}</span>
                  </p>
                </div>

                <form id="otp-form" onSubmit={handleVerifyOtp} className="lg-form" style={{ gap: 22 }}>
                  <div className="lg-otp" dir="ltr">
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
                        aria-label={`الرقم ${i + 1} من الكود`}
                        className={`lg-otp__el${digit ? ' lg-otp__el--filled' : ''}`}
                      />
                    ))}
                  </div>

                  <button type="submit" disabled={loading || otp.join('').length < 6} className="lg-btn">
                    {loading ? <Loader2 size={19} className="animate-spin" /> : <KeyRound size={19} />}
                    {loading ? 'جارٍ التحقق...' : 'تأكيد الكود'}
                  </button>

                  <div style={{ textAlign: 'center' }}>
                    {resendCountdown > 0 ? (
                      <p style={{ margin: 0, fontSize: 13.5, color: '#7d93a8' }}>
                        إعادة الإرسال بعد <strong style={{ color: '#054180' }}>{resendCountdown}</strong> ثانية
                      </p>
                    ) : (
                      <button type="button" onClick={handleSendOtp} className="lg-link lg-link--center">
                        <RefreshCw size={14} /> لم تستلم الكود؟ إعادة الإرسال
                      </button>
                    )}
                  </div>
                </form>

                <div className="lg-tip">
                  <Lightbulb size={16} />
                  <p style={{ margin: 0 }}>افحص مجلد <strong>Spam</strong> أو <strong>Junk</strong> إذا لم يصل الكود</p>
                </div>
              </div>
            )}

            {step === 'setPassword' && (
              <div className="lg-step" key="setPassword">
                <div className="lg-head">
                  <div className="lg-head__row">
                    <div className="lg-chip"><Lock size={20} /></div>
                    <h2 className="lg-title">{mode === 'forgotPassword' ? 'كلمة مرور جديدة' : 'تعيين كلمة المرور'}</h2>
                  </div>
                  <div className="lg-ok"><CheckCircle2 size={15} /> تم التحقق من البريد الإلكتروني</div>
                </div>

                <form onSubmit={handleSetPassword} className="lg-form">
                  <div>
                    <label className="lg-label" htmlFor="new-password">كلمة المرور</label>
                    <div className="lg-input">
                      <input
                        id="new-password"
                        type={showNewPw ? 'text' : 'password'}
                        value={newPw}
                        onChange={(e) => setNewPw(e.target.value)}
                        placeholder="8 أحرف على الأقل"
                        required
                        autoFocus
                        autoComplete="new-password"
                        className="lg-input__el lg-input__el--eye"
                        dir="ltr"
                      />
                      <Lock size={18} className="lg-input__icon" />
                      <button
                        type="button"
                        onClick={() => setShowNewPw((v) => !v)}
                        className="lg-input__eye"
                        aria-label={showNewPw ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                      >
                        {showNewPw ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>

                    {newPw && (
                      <>
                        <div className="lg-strength" aria-hidden="true">
                          {[0, 1, 2, 3].map((i) => (
                            <i key={i} style={i < pwStrength.score ? { background: pwStrength.color } : undefined} />
                          ))}
                        </div>
                        <p className="lg-strength-note">
                          قوة: <strong style={{ color: pwStrength.color }}>{pwStrength.label}</strong>
                        </p>
                      </>
                    )}
                  </div>

                  <div>
                    <label className="lg-label" htmlFor="confirm-password">تأكيد كلمة المرور</label>
                    <div className="lg-input">
                      <input
                        id="confirm-password"
                        type={showConfirmPw ? 'text' : 'password'}
                        value={confirmPw}
                        onChange={(e) => setConfirmPw(e.target.value)}
                        placeholder="أعد إدخال كلمة المرور"
                        required
                        autoComplete="new-password"
                        className={`lg-input__el lg-input__el--eye${
                          confirmPw && newPw !== confirmPw ? ' lg-input__el--bad' : confirmPw && newPw === confirmPw ? ' lg-input__el--good' : ''
                        }`}
                        dir="ltr"
                      />
                      <Lock size={18} className="lg-input__icon" />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPw((v) => !v)}
                        className="lg-input__eye"
                        aria-label={showConfirmPw ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                      >
                        {showConfirmPw ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>

                  <button type="submit" disabled={loading || newPw.length < 8 || newPw !== confirmPw} className="lg-btn">
                    {loading ? <Loader2 size={19} className="animate-spin" /> : <Lock size={19} />}
                    {loading
                      ? 'جارٍ الحفظ...'
                      : mode === 'forgotPassword'
                      ? 'تغيير كلمة المرور'
                      : 'تعيين كلمة المرور والدخول'}
                  </button>
                </form>
              </div>
            )}

            {mode !== 'login' && (
              <div className="lg-dots" aria-hidden="true">
                {steps.map((s, i) => (
                  <i key={s} data-on={step === s ? 'active' : i < currentIdx ? 'done' : 'idle'} />
                ))}
              </div>
            )}
          </section>

          <p className="lg-foot lg-rise" style={{ '--i': 2 } as React.CSSProperties}>
            دار الفتح للنشر والتوزيع · © 2025 جميع الحقوق محفوظة
          </p>
        </div>
      </main>
    </div>
  );
}
