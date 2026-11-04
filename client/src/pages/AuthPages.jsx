import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff, HeartHandshake, ArrowLeft, Check, X, Mail, ShieldCheck, KeyRound } from 'lucide-react';
import { api, apiUrl } from '../api';
import { useAuth, FullPageLoader } from '../auth';
import { Field, category } from '../shared';
import { PASSWORD_MAX, PASSWORD_RULES, passwordIsValid, emailIsValid } from '../password';

const OTP_LENGTH = 6;

// ───────────────────────── Building blocks ─────────────────────────

/** Password field with an eye button that shows / hides the value (F-03). */
export const PasswordInput = React.forwardRef(function PasswordInput({ id, value, onChange, autoComplete = 'current-password', placeholder, name = 'password', ...rest }, ref) {
  const [visible, setVisible] = useState(false);
  return <div className="password-input">
    <input
      ref={ref} id={id} name={name} type={visible ? 'text' : 'password'} value={value} onChange={onChange}
      autoComplete={autoComplete} placeholder={placeholder} spellCheck="false" autoCapitalize="off" maxLength={PASSWORD_MAX + 20}
      {...rest}
    />
    <button
      type="button" className="eye-btn" onClick={() => setVisible(v => !v)}
      aria-label={visible ? 'Hide password' : 'Show password'} aria-pressed={visible} aria-controls={id}
      title={visible ? 'Hide password' : 'Show password'}
    >{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button>
  </div>;
});

export function PasswordChecklist({ password, confirm, showConfirm = false }) {
  const rules = PASSWORD_RULES.map(r => ({ ...r, ok: r.test(password || '') }));
  if (showConfirm) rules.push({ id: 'match', label: 'Both passwords match', ok: Boolean(password) && password === confirm });
  const met = rules.filter(r => r.ok).length;
  return <div className="pw-check" aria-live="polite">
    <div className="pw-meter" aria-hidden="true"><span style={{ width: `${(met / rules.length) * 100}%` }} data-level={met === rules.length ? 'done' : met >= 3 ? 'mid' : 'low'} /></div>
    <ul>{rules.map(r => <li key={r.id} className={r.ok ? 'ok' : ''}>{r.ok ? <Check size={14} aria-hidden="true" /> : <X size={14} aria-hidden="true" />}<span>{r.label}<span className="sr-only">{r.ok ? ' — done' : ' — missing'}</span></span></li>)}</ul>
  </div>;
}

/** Six single-digit boxes; supports typing, backspace, arrow keys and pasting the whole code. */
export function OtpInput({ value, onChange, onComplete, disabled, autoFocus = true }) {
  const refs = useRef([]);
  // Blank boxes are stored as spaces so each digit keeps its position.
  const digits = Array.from({ length: OTP_LENGTH }, (_, i) => (value[i] && value[i] !== ' ' ? value[i] : ''));
  const pack = arr => arr.map(d => d || ' ').join('').replace(/\s+$/, '');
  useEffect(() => { if (autoFocus) refs.current[0]?.focus(); }, [autoFocus]);

  function setAt(index, digit) {
    const next = digits.slice();
    next[index] = digit;
    const joined = pack(next);
    onChange(joined);
    if (/^\d{6}$/.test(joined)) onComplete?.(joined);
  }
  function handleChange(i, e) {
    const raw = e.target.value.replace(/\D/g, '');
    if (!raw) { setAt(i, ''); return; }
    if (raw.length > 1) { fill(raw, i); return; }
    setAt(i, raw);
    if (i < OTP_LENGTH - 1) refs.current[i + 1]?.focus();
  }
  function fill(raw, start = 0) {
    const next = digits.slice();
    raw.slice(0, OTP_LENGTH - start).split('').forEach((d, k) => { next[start + k] = d; });
    const joined = pack(next);
    onChange(joined);
    refs.current[Math.min(start + raw.length, OTP_LENGTH - 1)]?.focus();
    if (/^\d{6}$/.test(joined)) onComplete?.(joined);
  }
  function handleKey(i, e) {
    if (e.key === 'Backspace' && !digits[i] && i > 0) { e.preventDefault(); refs.current[i - 1]?.focus(); setAt(i - 1, ''); }
    if (e.key === 'ArrowLeft' && i > 0) { e.preventDefault(); refs.current[i - 1]?.focus(); }
    if (e.key === 'ArrowRight' && i < OTP_LENGTH - 1) { e.preventDefault(); refs.current[i + 1]?.focus(); }
  }
  function handlePaste(e) {
    const raw = (e.clipboardData.getData('text') || '').replace(/\D/g, '');
    if (!raw) return;
    e.preventDefault();
    fill(raw, 0);
  }
  return <div className="otp-input" role="group" aria-label={`${OTP_LENGTH}-digit verification code`}>
    {digits.map((d, i) => <input
      key={i} ref={el => { refs.current[i] = el; }} value={d} disabled={disabled}
      onChange={e => handleChange(i, e)} onKeyDown={e => handleKey(i, e)} onPaste={handlePaste} onFocus={e => e.target.select()}
      inputMode="numeric" pattern="[0-9]*" maxLength={OTP_LENGTH} autoComplete={i === 0 ? 'one-time-code' : 'off'}
      aria-label={`Digit ${i + 1}`}
    />)}
  </div>;
}

/** Countdown used for "Resend code" cooldowns. */
function useCountdown(initial) {
  const [left, setLeft] = useState(initial);
  useEffect(() => {
    if (left <= 0) return undefined;
    const t = setTimeout(() => setLeft(l => l - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  return [left, setLeft];
}

function useProviders() {
  const [providers, setProviders] = useState(null);
  useEffect(() => { api('/auth/providers').then(setProviders).catch(() => setProviders({ google: false, facebook: false })); }, []);
  return providers;
}

/** Google / Facebook buttons. Disabled with a clear note when the server has no credentials (F-05). */
export function SocialButtons({ next = '/dashboard', verb = 'Continue' }) {
  const providers = useProviders();
  const items = [
    { id: 'google', label: 'Google', mark: <span className="brand-dot google" aria-hidden="true">G</span> },
    { id: 'facebook', label: 'Facebook', mark: <span className="brand-dot facebook" aria-hidden="true">f</span> }
  ];
  const missing = providers ? items.filter(i => !providers[i.id]).map(i => i.label) : [];
  return <div className="social">
    <div className="social-row">
      {items.map(i => providers?.[i.id]
        ? <a key={i.id} className="btn social-btn" href={apiUrl(`/auth/oauth/${i.id}?next=${encodeURIComponent(next)}`)}>{i.mark}{verb} with {i.label}</a>
        : <button key={i.id} type="button" className="btn social-btn" disabled aria-describedby="social-note">{i.mark}{verb} with {i.label}</button>)}
    </div>
    {missing.length > 0 && <p id="social-note" className="social-note">{missing.join(' and ')} sign-in isn't switched on for this site yet. Use your email for now.</p>}
  </div>;
}

function FormError({ message }) {
  if (!message) return null;
  return <div className="form-alert" role="alert">{message}</div>;
}

// ───────────────────────── Layout ─────────────────────────

const AUTH_COPY = {
  login: ['Welcome back.', 'Pick up where you left off — your listings, saved items and messages are waiting.'],
  signup: ['Join people who share.', 'Give what you no longer need, ask for what you do. It is always free.'],
  forgot: ['Locked out? It happens.', 'We will email you a one-time code so you can choose a new password.']
};

/** Split layout. The left side shows real, live listings from the community (not stock copy). */
function AuthLayout({ variant, children }) {
  const [listings, setListings] = useState([]);
  useEffect(() => {
    const ctrl = new AbortController();
    api('/listings?limit=4', { signal: ctrl.signal }).then(d => setListings(d.listings || [])).catch(() => {});
    return () => ctrl.abort();
  }, []);
  const [title, line] = AUTH_COPY[variant];
  return <div className="auth-page">
    <aside className="auth-side">
      <Link to="/" className="auth-brand"><span className="brand-mark"><HeartHandshake size={26} /></span><span><strong>Sahayog</strong><small>Give · Receive · Be Kind</small></span></Link>
      <div className="auth-side-copy">
        <h2>{title}</h2>
        <p>{line}</p>
      </div>
      <div className="auth-feed" aria-label="Recently shared on Sahayog">
        {listings.length > 0 && <p className="auth-feed-head">Shared on Sahayog recently</p>}
        {listings.map(l => {
          const c = category(l.category);
          return <div className="auth-feed-item" key={l.id}>
            <span className="auth-feed-emoji" aria-hidden="true">{c.emoji}</span>
            <span><strong>{l.title}</strong><small>{l.type === 'need' ? 'Needs help' : 'Free to give'} · {l.location}</small></span>
          </div>;
        })}
      </div>
    </aside>
    <main className="auth-main">
      <Link to="/" className="auth-back"><ArrowLeft size={16} /> Back to home</Link>
      <div className="auth-card">{children}</div>
    </main>
  </div>;
}

// ───────────────────────── Login ─────────────────────────

const OAUTH_ERRORS = {
  not_configured: 'That sign-in option is not set up yet. Please use your email and password.',
  cancelled: 'Sign-in was cancelled.',
  invalid_state: 'Your sign-in link expired. Please try again.',
  provider_error: 'We could not confirm your account with the provider. Please try again.',
  email_required: 'Your social account did not share an email address, which Sahayog needs. Please sign up with email.',
  account_exists: 'An account with this email already exists. Log in with your password, then connect Facebook from your profile.',
  identity_in_use: 'That social account is already connected to another Sahayog account.',
  login_required: 'Please log in first.',
  unknown_provider: 'Unknown sign-in option.'
};

export function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const from = location.state?.from && location.state.from !== '/login' ? location.state.from : '/dashboard';
  const [form, setForm] = useState({ email: location.state?.email || '', password: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(params.get('oauthError') ? (OAUTH_ERRORS[params.get('oauthError')] || 'Sign-in failed. Please try again.') : '');
  const [busy, setBusy] = useState(false);
  const notice = location.state?.notice;

  function change(e) { setForm(f => ({ ...f, [e.target.name]: e.target.value })); setErrors(er => ({ ...er, [e.target.name]: '' })); }

  async function submit(e) {
    e.preventDefault();
    const nextErrors = {};
    if (!form.email.trim()) nextErrors.email = 'Enter your email address.';
    else if (!emailIsValid(form.email)) nextErrors.email = 'Enter a valid email address, like name@example.com.';
    if (!form.password) nextErrors.password = 'Enter your password.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setBusy(true); setFormError('');
    try {
      const d = await api('/auth/login', { method: 'POST', body: { email: form.email.trim(), password: form.password } });
      signIn(d.user);
      navigate(from, { replace: true });
    } catch (err) {
      if (err.data?.needsVerification) {
        navigate('/signup', { state: { verifyEmail: err.data.email } });
        return;
      }
      setFormError(err.message);
      setForm(f => ({ ...f, password: '' }));
    } finally { setBusy(false); }
  }

  return <AuthLayout variant="login">
    <h1>Log in</h1>
    <p className="auth-sub">New to Sahayog? <Link to="/signup" state={location.state}>Create an account</Link></p>
    {notice && <div className="form-notice" role="status">{notice}</div>}
    <FormError message={formError} />
    <form onSubmit={submit} noValidate>
      <Field label="Email address" error={errors.email}>
        <input type="email" name="email" value={form.email} onChange={change} autoComplete="email" placeholder="you@example.com" autoFocus />
      </Field>
      <Field label="Password" error={errors.password}>
        <PasswordInput value={form.password} onChange={change} autoComplete="current-password" placeholder="Your password" />
      </Field>
      <div className="forgot-row"><Link to="/forgot-password" state={{ email: form.email }} className="small-link">Forgot password?</Link></div>
      <button className="btn btn-primary auth-submit" disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</button>
    </form>
    <div className="divider"><span>or</span></div>
    <SocialButtons next={from} verb="Log in" />
  </AuthLayout>;
}

// ───────────────────────── Sign up + OTP ─────────────────────────

export function SignupPage() {
  const { signIn, notify } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from || '/dashboard';
  const [step, setStep] = useState(location.state?.verifyEmail ? 'verify' : 'details');
  const [form, setForm] = useState({ name: '', email: location.state?.verifyEmail || '', password: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [otp, setOtp] = useState('');
  const [cooldown, setCooldown] = useCountdown(location.state?.verifyEmail ? 0 : 0);
  const [info, setInfo] = useState(location.state?.verifyEmail ? 'Your sign-up is waiting for email verification. Request a code below if you need a new one.' : '');

  function change(e) { setForm(f => ({ ...f, [e.target.name]: e.target.value })); setErrors(er => ({ ...er, [e.target.name]: '' })); }

  async function submitDetails(e) {
    e.preventDefault();
    const er = {};
    if (form.name.trim().length < 2) er.name = 'Enter your name (at least 2 characters).';
    if (!emailIsValid(form.email)) er.email = 'Enter a valid email address, like name@example.com.';
    if (!passwordIsValid(form.password)) er.password = 'Your password does not meet all the rules below yet.';
    if (form.password !== form.confirm) er.confirm = 'Passwords do not match.';
    setErrors(er);
    if (Object.keys(er).length) return;
    setBusy(true); setFormError('');
    try {
      const d = await api('/auth/register', { method: 'POST', body: { name: form.name.trim(), email: form.email.trim(), password: form.password } });
      setForm(f => ({ ...f, email: d.email || f.email.trim().toLowerCase(), password: '', confirm: '' }));
      setInfo(d.message);
      setCooldown(d.resendIn || 60);
      setOtp('');
      setStep('verify');
    } catch (err) {
      if (err.status === 429 && err.data.retryAfter) { setCooldown(err.data.retryAfter); setStep('verify'); setInfo('We already sent you a code. Check your inbox.'); }
      else if (err.data?.field) setErrors({ [err.data.field]: err.message });
      else setFormError(err.message);
    } finally { setBusy(false); }
  }

  async function verify(code = otp) {
    if (busy) return;
    if (!/^\d{6}$/.test(code)) { setFormError('Enter all 6 digits from the email.'); return; }
    setBusy(true); setFormError('');
    try {
      const d = await api('/auth/register/verify', { method: 'POST', body: { email: form.email, otp: code } });
      signIn(d.user);
      notify('Email verified. Welcome to Sahayog!', 'success');
      navigate(from, { replace: true });
    } catch (err) {
      setFormError(err.message);
      setOtp('');
    } finally { setBusy(false); }
  }

  async function resend() {
    setBusy(true); setFormError('');
    try {
      const d = await api('/auth/register/resend', { method: 'POST', body: { email: form.email } });
      setInfo(`A new code is on its way to ${form.email}.`);
      setCooldown(d.resendIn || 60);
      setOtp('');
    } catch (err) {
      if (err.data?.retryAfter) setCooldown(err.data.retryAfter);
      setFormError(err.message);
    } finally { setBusy(false); }
  }

  if (step === 'verify') {
    return <AuthLayout variant="signup">
      <div className="auth-icon"><Mail size={22} /></div>
      <h1>Check your email</h1>
      <p className="auth-sub">Enter the 6-digit code we sent to <strong>{form.email}</strong>. It expires in 10 minutes.</p>
      {info && <div className="form-notice" role="status">{info}</div>}
      <FormError message={formError} />
      <form onSubmit={e => { e.preventDefault(); verify(); }}>
        <OtpInput value={otp} onChange={setOtp} onComplete={verify} disabled={busy} />
        <button className="btn btn-primary auth-submit" disabled={busy || !/^\d{6}$/.test(otp)}>{busy ? 'Verifying…' : 'Verify email'}</button>
      </form>
      <div className="otp-actions">
        <button type="button" className="link-btn" onClick={resend} disabled={busy || cooldown > 0}>{cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}</button>
        <button type="button" className="link-btn" onClick={() => { setStep('details'); setFormError(''); setInfo(''); }}>Use a different email</button>
      </div>
      <p className="fine-print">Can't find it? Check your spam or promotions folder.</p>
    </AuthLayout>;
  }

  return <AuthLayout variant="signup">
    <h1>Create your account</h1>
    <p className="auth-sub">Already a member? <Link to="/login" state={location.state}>Log in</Link></p>
    <FormError message={formError} />
    <SocialButtons next={from} verb="Sign up" />
    <div className="divider"><span>or sign up with email</span></div>
    <form onSubmit={submitDetails} noValidate>
      <Field label="Full name" error={errors.name}>
        <input name="name" value={form.name} onChange={change} autoComplete="name" maxLength={100} placeholder="Your name" />
      </Field>
      <Field label="Email address" error={errors.email}>
        <input type="email" name="email" value={form.email} onChange={change} autoComplete="email" placeholder="you@example.com" />
      </Field>
      <Field label="Password" error={errors.password}>
        <PasswordInput value={form.password} onChange={change} autoComplete="new-password" placeholder="15–30 characters" />
      </Field>
      <Field label="Confirm password" error={errors.confirm}>
        <PasswordInput name="confirm" value={form.confirm} onChange={change} autoComplete="new-password" placeholder="Type it again" />
      </Field>
      <PasswordChecklist password={form.password} confirm={form.confirm} showConfirm />
      <button className="btn btn-primary auth-submit" disabled={busy}>{busy ? 'Sending code…' : 'Send verification code'}</button>
      <p className="fine-print">By creating an account you agree to share kindly and keep exchanges safe.</p>
    </form>
  </AuthLayout>;
}

// ───────────────────────── Forgot password ─────────────────────────

export function ForgotPasswordPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [step, setStep] = useState('email'); // email → code → password
  const [email, setEmail] = useState(location.state?.email || '');
  const [otp, setOtp] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [pw, setPw] = useState({ password: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useCountdown(0);

  async function requestCode(e) {
    e?.preventDefault();
    if (!emailIsValid(email)) { setErrors({ email: 'Enter a valid email address, like name@example.com.' }); return; }
    setBusy(true); setFormError(''); setErrors({});
    try {
      const d = await api('/auth/password/forgot', { method: 'POST', body: { email: email.trim() } });
      setEmail(email.trim().toLowerCase());
      setInfo(d.message);
      setCooldown(d.resendIn || 60);
      setOtp('');
      setStep('code');
    } catch (err) { setFormError(err.message); } finally { setBusy(false); }
  }

  async function verify(code = otp) {
    if (busy) return;
    if (!/^\d{6}$/.test(code)) { setFormError('Enter all 6 digits from the email.'); return; }
    setBusy(true); setFormError('');
    try {
      const d = await api('/auth/password/verify', { method: 'POST', body: { email, otp: code } });
      setResetToken(d.resetToken);
      setStep('password');
    } catch (err) { setFormError(err.message); setOtp(''); } finally { setBusy(false); }
  }

  async function savePassword(e) {
    e.preventDefault();
    const er = {};
    if (!passwordIsValid(pw.password)) er.password = 'Your new password does not meet all the rules below yet.';
    if (pw.password !== pw.confirm) er.confirm = 'Passwords do not match.';
    setErrors(er);
    if (Object.keys(er).length) return;
    setBusy(true); setFormError('');
    try {
      const d = await api('/auth/password/reset', { method: 'POST', body: { email, resetToken, password: pw.password } });
      navigate('/login', { replace: true, state: { email, notice: d.message } });
    } catch (err) {
      if (err.data?.field) setErrors({ [err.data.field]: err.message });
      else { setFormError(err.message); if (/expired|start again/i.test(err.message)) { setStep('email'); setResetToken(''); } }
    } finally { setBusy(false); }
  }

  const stepIndex = { email: 1, code: 2, password: 3 }[step];
  return <AuthLayout variant="forgot">
    <p className="step-indicator">Step {stepIndex} of 3</p>
    {step === 'email' && <>
      <div className="auth-icon"><KeyRound size={22} /></div>
      <h1>Reset your password</h1>
      <p className="auth-sub">Enter the email you signed up with. We'll send you a 6-digit code.</p>
      <FormError message={formError} />
      <form onSubmit={requestCode} noValidate>
        <Field label="Email address" error={errors.email}>
          <input type="email" value={email} onChange={e => { setEmail(e.target.value); setErrors({}); }} autoComplete="email" placeholder="you@example.com" autoFocus />
        </Field>
        <button className="btn btn-primary auth-submit" disabled={busy}>{busy ? 'Sending…' : 'Send code'}</button>
      </form>
    </>}

    {step === 'code' && <>
      <div className="auth-icon"><Mail size={22} /></div>
      <h1>Enter the code</h1>
      <p className="auth-sub">{info}</p>
      <FormError message={formError} />
      <form onSubmit={e => { e.preventDefault(); verify(); }}>
        <OtpInput value={otp} onChange={setOtp} onComplete={verify} disabled={busy} />
        <button className="btn btn-primary auth-submit" disabled={busy || !/^\d{6}$/.test(otp)}>{busy ? 'Checking…' : 'Verify code'}</button>
      </form>
      <div className="otp-actions">
        <button type="button" className="link-btn" onClick={() => requestCode()} disabled={busy || cooldown > 0}>{cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}</button>
        <button type="button" className="link-btn" onClick={() => { setStep('email'); setFormError(''); }}>Change email</button>
      </div>
    </>}

    {step === 'password' && <>
      <div className="auth-icon"><ShieldCheck size={22} /></div>
      <h1>Choose a new password</h1>
      <p className="auth-sub">For <strong>{email}</strong>. You'll be signed out on every device and asked to log in again.</p>
      <FormError message={formError} />
      <form onSubmit={savePassword} noValidate>
        <Field label="New password" error={errors.password}>
          <PasswordInput value={pw.password} onChange={e => { setPw(p => ({ ...p, password: e.target.value })); setErrors({}); }} autoComplete="new-password" placeholder="15–30 characters" autoFocus />
        </Field>
        <Field label="Confirm new password" error={errors.confirm}>
          <PasswordInput name="confirm" value={pw.confirm} onChange={e => { setPw(p => ({ ...p, confirm: e.target.value })); setErrors({}); }} autoComplete="new-password" placeholder="Type it again" />
        </Field>
        <PasswordChecklist password={pw.password} confirm={pw.confirm} showConfirm />
        <button className="btn btn-primary auth-submit" disabled={busy}>{busy ? 'Saving…' : 'Save new password'}</button>
      </form>
    </>}
    <p className="auth-sub auth-foot">Remembered it? <Link to="/login">Back to log in</Link></p>
  </AuthLayout>;
}

// ───────────────────────── OAuth return ─────────────────────────

export function AuthCallback() {
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  useEffect(() => {
    const next = params.get('next') || '/dashboard';
    const safe = next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';
    refresh().then(u => navigate(u ? safe : '/login?oauthError=provider_error', { replace: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <FullPageLoader label="Signing you in…" />;
}
