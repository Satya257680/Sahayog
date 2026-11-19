import React, { useEffect, useRef, useState } from "react";
import {
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import {
  Eye,
  EyeOff,
  Check,
  X,
  Mail,
  Lock,
  UserRound,
  AlertTriangle,
} from "lucide-react";
import { api, apiUrl } from "../api";
import { useAuth, FullPageLoader } from "../auth";
import { Field, Loading } from "../shared";
import { BrandLogo } from "../brand";
import { PublicHeader, usePublicMenu } from "./PublicPages";
import {
  PASSWORD_MAX,
  PASSWORD_HINT,
  PASSWORD_RULES,
  passwordIsValid,
  emailIsValid,
} from "../password";

// ───────────────────────── Building blocks ─────────────────────────

/** Text/email input with a decorative leading icon. Field passes id / aria-* through to the <input>. */
const IconInput = React.forwardRef(function IconInput(
  { icon: Icon, className = "", ...rest },
  ref,
) {
  return (
    <div className={`icon-input ${className}`.trim()}>
      {Icon && (
        <Icon className="icon-input__icon" size={18} aria-hidden="true" />
      )}
      <input ref={ref} {...rest} />
    </div>
  );
});

/** Password field with an eye button that shows / hides the value (F-03). `icon` adds a leading lock icon. */
export const PasswordInput = React.forwardRef(function PasswordInput(
  {
    id,
    value,
    onChange,
    autoComplete = "current-password",
    placeholder,
    name = "password",
    icon: Icon,
    ...rest
  },
  ref,
) {
  const [visible, setVisible] = useState(false);
  return (
    <div className={`password-input${Icon ? " icon-input" : ""}`}>
      {Icon && (
        <Icon className="icon-input__icon" size={18} aria-hidden="true" />
      )}
      <input
        ref={ref}
        id={id}
        name={name}
        type={visible ? "text" : "password"}
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
        placeholder={placeholder}
        spellCheck="false"
        autoCapitalize="off"
        maxLength={PASSWORD_MAX + 20}
        {...rest}
      />
      <button
        type="button"
        className="eye-btn"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        aria-controls={id}
        title={visible ? "Hide password" : "Show password"}
      >
        {visible ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
});

export function PasswordChecklist({ password, confirm, showConfirm = false }) {
  const rules = PASSWORD_RULES.map((r) => ({
    ...r,
    ok: r.test(password || ""),
  }));
  if (showConfirm)
    rules.push({
      id: "match",
      label: "Both passwords match",
      ok: Boolean(password) && password === confirm,
    });
  const met = rules.filter((r) => r.ok).length;
  return (
    <div className="pw-check" aria-live="polite">
      <div className="pw-meter" aria-hidden="true">
        <span
          style={{ width: `${(met / rules.length) * 100}%` }}
          data-level={met === rules.length ? "done" : met >= 3 ? "mid" : "low"}
        />
      </div>
      <ul>
        {rules.map((r) => (
          <li key={r.id} className={r.ok ? "ok" : ""}>
            {r.ok ? (
              <Check size={14} aria-hidden="true" />
            ) : (
              <X size={14} aria-hidden="true" />
            )}
            <span>
              {r.label}
              <span className="sr-only">{r.ok ? " — done" : " — missing"}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Countdown used for the "Resend link" cooldown. */
function useCountdown(initial) {
  const [left, setLeft] = useState(initial);
  useEffect(() => {
    if (left <= 0) return undefined;
    const t = setTimeout(() => setLeft((l) => l - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  return [left, setLeft];
}

function useProviders() {
  const [providers, setProviders] = useState(null);
  useEffect(() => {
    const ctrl = new AbortController();
    api("/auth/providers", { signal: ctrl.signal })
      .then(setProviders)
      .catch((err) => {
        if (err.name !== "AbortError")
          setProviders({ google: false, facebook: false });
      });
    return () => ctrl.abort();
  }, []);
  return providers;
}

/**
 * Google / Facebook buttons. They only become links when the server reports the provider as configured;
 * otherwise they are disabled and a note says so (never a control that looks live but does nothing).
 */
export function SocialButtons({ next = "/dashboard", verb = "Continue" }) {
  const providers = useProviders();
  const items = [
    {
      id: "google",
      label: "Google",
      mark: (
        <span className="brand-dot google" aria-hidden="true">
          G
        </span>
      ),
    },
    {
      id: "facebook",
      label: "Facebook",
      mark: (
        <span className="brand-dot facebook" aria-hidden="true">
          f
        </span>
      ),
    },
  ];
  const missing = providers
    ? items.filter((i) => !providers[i.id]).map((i) => i.label)
    : [];
  return (
    <div className="social">
      <div className="social-row">
        {items.map((i) =>
          providers?.[i.id] ? (
            <a
              key={i.id}
              className="btn social-btn"
              href={apiUrl(
                `/auth/oauth/${i.id}?next=${encodeURIComponent(next)}`,
              )}
            >
              {i.mark}
              {verb} with {i.label}
            </a>
          ) : (
            <button
              key={i.id}
              type="button"
              className="btn social-btn"
              disabled
              aria-describedby={missing.length ? "social-note" : undefined}
            >
              {i.mark}
              {verb} with {i.label}
            </button>
          ),
        )}
      </div>
      {missing.length > 0 && (
        <p id="social-note" className="social-note">
          {missing.join(" and ")} sign-in isn't switched on for this site yet.
          Use your email for now.
        </p>
      )}
    </div>
  );
}

function FormError({ message }) {
  if (!message) return null;
  return (
    <div className="form-alert" role="alert">
      {message}
    </div>
  );
}

// ───────────────────────── Layout ─────────────────────────

/**
 * Public navbar + one centered card. The approved logo sits at the top of the card, above the heading.
 * No split screen, no decorative background shapes.
 */
function AuthLayout({ children, wide = false }) {
  const [menuOpen, setMenuOpen] = usePublicMenu();
  return (
    <div className="app-shell auth-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <PublicHeader menuOpen={menuOpen} setMenuOpen={setMenuOpen} />
      <main className="auth-center" id="main" tabIndex={-1}>
        <div className={`auth-panel${wide ? " auth-panel--wide" : ""}`}>
          <Link to="/" className="auth-panel__logo" aria-label="Sahayog home">
            <BrandLogo size={72} alt="" />
          </Link>
          {children}
        </div>
      </main>
    </div>
  );
}

/** Drops any password the browser restored when the user navigates away (bfcache). */
function useClearOnHide(clear) {
  const ref = useRef(clear);
  ref.current = clear;
  useEffect(() => {
    const onHide = () => ref.current();
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, []);
}

// ───────────────────────── Login ─────────────────────────

const OAUTH_ERRORS = {
  not_configured:
    "That sign-in option is not set up yet. Please use your email and password.",
  cancelled: "Sign-in was cancelled.",
  invalid_state: "Your sign-in link expired. Please try again.",
  provider_error:
    "We could not confirm your account with the provider. Please try again.",
  email_required:
    "Your social account did not share an email address, which Sahayog needs. Please sign up with email.",
  account_exists:
    "An account with this email already exists. Log in with your password, then connect Facebook from your profile.",
  identity_in_use:
    "That social account is already connected to another Sahayog account.",
  login_required: "Please log in first.",
  unknown_provider: "Unknown sign-in option.",
};

export function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const from =
    location.state?.from && location.state.from !== "/login"
      ? location.state.from
      : "/dashboard";
  const [form, setForm] = useState({
    email: location.state?.email || "",
    password: "",
  });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(
    params.get("oauthError")
      ? OAUTH_ERRORS[params.get("oauthError")] ||
          "Sign-in failed. Please try again."
      : "",
  );
  const [busy, setBusy] = useState(false);
  const notice = location.state?.notice;
  useClearOnHide(() => setForm((f) => ({ ...f, password: "" })));

  function change(e) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
    setErrors((er) => ({ ...er, [e.target.name]: "" }));
  }

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    const nextErrors = {};
    if (!form.email.trim()) nextErrors.email = "Enter your email address.";
    else if (!emailIsValid(form.email))
      nextErrors.email = "Enter a valid email address, like name@example.com.";
    if (!form.password) nextErrors.password = "Enter your password.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setBusy(true);
    setFormError("");
    try {
      const d = await api("/auth/login", {
        method: "POST",
        body: { email: form.email.trim(), password: form.password },
      });
      signIn(d.user);
      navigate(from, { replace: true });
    } catch (err) {
      setFormError(err.message);
      setForm((f) => ({ ...f, password: "" }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout>
      <h1>Log in</h1>
      <p className="auth-sub">
        New to Sahayog?{" "}
        <Link to="/signup" state={location.state}>
          Create an account
        </Link>
      </p>
      {notice && (
        <div className="form-notice" role="status">
          {notice}
        </div>
      )}
      <FormError message={formError} />
      <form onSubmit={submit} noValidate>
        <Field label="Email address" error={errors.email}>
          <IconInput
            icon={Mail}
            type="email"
            name="email"
            value={form.email}
            onChange={change}
            autoComplete="email"
            inputMode="email"
            placeholder="you@example.com"
            autoFocus
            required
          />
        </Field>
        <Field label="Password" error={errors.password}>
          <PasswordInput
            icon={Lock}
            value={form.password}
            onChange={change}
            autoComplete="current-password"
            placeholder="Your password"
            required
          />
        </Field>
        <div className="forgot-row">
          <Link
            to="/forgot-password"
            state={{ email: form.email }}
            className="small-link"
          >
            Forgot password?
          </Link>
        </div>
        <button
          type="submit"
          className="btn btn-primary auth-submit"
          disabled={busy}
          aria-busy={busy}
        >
          {busy ? "Logging in…" : "Log in"}
        </button>
      </form>
      <div className="divider">
        <span>or</span>
      </div>
      <SocialButtons next={from} verb="Log in" />
    </AuthLayout>
  );
}

// ───────────────────────── Sign up (no OTP step in this release) ─────────────────────────

export function SignupPage() {
  const { signIn, notify } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from || "/dashboard";
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirm: "",
  });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  useClearOnHide(() => setForm((f) => ({ ...f, password: "", confirm: "" })));

  function change(e) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
    setErrors((er) => ({ ...er, [e.target.name]: "" }));
  }

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    const er = {};
    const name = form.name.trim();
    if (name.length < 2)
      er.name = "Enter your full name (at least 2 characters).";
    else if (name.length > 100)
      er.name = "Name must be 100 characters or fewer.";
    if (!form.email.trim()) er.email = "Enter your email address.";
    else if (!emailIsValid(form.email))
      er.email = "Enter a valid email address, like name@example.com.";
    if (!passwordIsValid(form.password))
      er.password = "Your password does not meet all the rules below yet.";
    if (!form.confirm) er.confirm = "Confirm your password.";
    else if (form.password !== form.confirm)
      er.confirm = "Passwords do not match.";
    setErrors(er);
    if (Object.keys(er).length) return;
    setBusy(true);
    setFormError("");
    try {
      const d = await api("/auth/register", {
        method: "POST",
        body: { name, email: form.email.trim(), password: form.password },
      });
      signIn(d.user);
      notify(
        d.message || "Welcome to Sahayog! Your account is ready.",
        "success",
      );
      navigate(from, { replace: true });
    } catch (err) {
      if (err.data?.field) setErrors({ [err.data.field]: err.message });
      else setFormError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const showRules = Boolean(form.password) || Boolean(errors.password);
  return (
    <AuthLayout>
      <h1>Create your account</h1>
      <p className="auth-sub">
        Already a member?{" "}
        <Link to="/login" state={location.state}>
          Log in
        </Link>
      </p>
      <FormError message={formError} />
      <SocialButtons next={from} verb="Continue" />
      <div className="divider">
        <span>or sign up with email</span>
      </div>
      <form onSubmit={submit} noValidate>
        <Field label="Full name" error={errors.name}>
          <IconInput
            icon={UserRound}
            name="name"
            value={form.name}
            onChange={change}
            autoComplete="name"
            maxLength={100}
            placeholder="Your name"
            required
          />
        </Field>
        <Field label="Email address" error={errors.email}>
          <IconInput
            icon={Mail}
            type="email"
            name="email"
            value={form.email}
            onChange={change}
            autoComplete="email"
            inputMode="email"
            placeholder="you@example.com"
            required
          />
        </Field>
        <Field
          label="Password"
          error={errors.password}
          hint={
            showRules
              ? undefined
              : `${PASSWORD_HINT}, with an uppercase letter, a lowercase letter, a number and a symbol.`
          }
        >
          <PasswordInput
            icon={Lock}
            value={form.password}
            onChange={change}
            autoComplete="new-password"
            placeholder={PASSWORD_HINT}
            required
          />
        </Field>
        <Field label="Confirm password" error={errors.confirm}>
          <PasswordInput
            icon={Lock}
            name="confirm"
            value={form.confirm}
            onChange={change}
            autoComplete="new-password"
            placeholder="Type it again"
            required
          />
        </Field>
        {showRules && (
          <PasswordChecklist
            password={form.password}
            confirm={form.confirm}
            showConfirm
          />
        )}
        <button
          type="submit"
          className="btn btn-primary auth-submit"
          disabled={busy}
          aria-busy={busy}
        >
          {busy ? "Creating account…" : "Create account"}
        </button>
        <p className="fine-print">
          By creating an account, you agree to our{" "}
          <Link to="/terms" target="_blank" rel="noopener">
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link to="/privacy" target="_blank" rel="noopener">
            Privacy Policy
          </Link>
          .
        </p>
      </form>
    </AuthLayout>
  );
}

// ───────────────────────── Forgot password (email link) ─────────────────────────

const RESEND_SECONDS = 60;

export function ForgotPasswordPage() {
  const location = useLocation();
  const [email, setEmail] = useState(location.state?.email || "");
  const [sentTo, setSentTo] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useCountdown(0);

  async function request(e) {
    e?.preventDefault();
    if (busy) return;
    const value = (sentTo || email).trim();
    if (!value) {
      setError("Enter your email address.");
      return;
    }
    if (!emailIsValid(value)) {
      setError("Enter a valid email address, like name@example.com.");
      return;
    }
    setBusy(true);
    setError("");
    setFormError("");
    try {
      const d = await api("/auth/password/forgot", {
        method: "POST",
        body: { email: value },
      });
      setSentTo(value.toLowerCase());
      setMessage(d.message);
      setCooldown(RESEND_SECONDS);
    } catch (err) {
      if (err.data?.field === "email") setError(err.message);
      else setFormError(err.message);
      if (err.status === 429) setCooldown(RESEND_SECONDS);
    } finally {
      setBusy(false);
    }
  }

  if (sentTo) {
    return (
      <AuthLayout>
        <h1>Check your email</h1>
        <p className="auth-sub" role="status">
          {message}
        </p>
        <FormError message={formError} />
        <ul className="auth-steps">
          <li>
            Open the email from Sahayog and select{" "}
            <strong>Choose a new password</strong>.
          </li>
          <li>
            The link works once. Can't find it? Check your spam or promotions
            folder.
          </li>
        </ul>
        <div className="otp-actions">
          <button
            type="button"
            className="link-btn"
            onClick={() => request()}
            disabled={busy || cooldown > 0}
          >
            {cooldown > 0
              ? `Resend link in ${cooldown}s`
              : busy
                ? "Sending…"
                : "Resend link"}
          </button>
          <button
            type="button"
            className="link-btn"
            onClick={() => {
              setEmail(sentTo);
              setSentTo("");
              setFormError("");
            }}
          >
            Use a different email
          </button>
        </div>
        <p className="auth-sub auth-foot">
          Remembered it?{" "}
          <Link to="/login" state={{ email: sentTo }}>
            Back to log in
          </Link>
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <h1>Forgot your password?</h1>
      <p className="auth-sub">
        Enter the email you signed up with and we'll send you a link to choose a
        new password.
      </p>
      <FormError message={formError} />
      <form onSubmit={request} noValidate>
        <Field label="Email address" error={error}>
          <IconInput
            icon={Mail}
            type="email"
            name="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError("");
            }}
            autoComplete="email"
            inputMode="email"
            placeholder="you@example.com"
            autoFocus
            required
          />
        </Field>
        <button
          type="submit"
          className="btn btn-primary auth-submit"
          disabled={busy || cooldown > 0}
          aria-busy={busy}
        >
          {busy
            ? "Sending…"
            : cooldown > 0
              ? `Try again in ${cooldown}s`
              : "Send reset link"}
        </button>
      </form>
      <p className="auth-sub auth-foot">
        Remembered it? <Link to="/login">Back to log in</Link>
      </p>
    </AuthLayout>
  );
}

// ───────────────────────── Reset password (from the emailed link) ─────────────────────────

/** Reads the one-time token from the URL fragment (#token=…), falling back to ?token= for old mail clients. */
function readResetToken() {
  const fromHash = new URLSearchParams(
    window.location.hash.replace(/^#/, ""),
  ).get("token");
  const fromQuery = new URLSearchParams(window.location.search).get("token");
  return fromHash || fromQuery || "";
}

export function ResetPasswordPage() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const [token] = useState(readResetToken);
  const [status, setStatus] = useState(token ? "checking" : "invalid"); // checking | ready | invalid
  const [pw, setPw] = useState({ password: "", confirm: "" });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  useClearOnHide(() => setPw({ password: "", confirm: "" }));

  useEffect(() => {
    // Remove the token from the address bar / history as soon as it has been read.
    if (window.location.hash || window.location.search)
      window.history.replaceState(
        window.history.state,
        "",
        window.location.pathname,
      );
    if (!token) return undefined;
    const ctrl = new AbortController();
    api("/auth/password/reset/check", {
      method: "POST",
      body: { token },
      signal: ctrl.signal,
    })
      .then(() => setStatus("ready"))
      .catch((err) => {
        if (err.name !== "AbortError") setStatus("invalid");
      });
    return () => ctrl.abort();
  }, [token]);

  async function save(e) {
    e.preventDefault();
    if (busy) return;
    const er = {};
    if (!passwordIsValid(pw.password))
      er.password = "Your new password does not meet all the rules below yet.";
    if (!pw.confirm) er.confirm = "Confirm your new password.";
    else if (pw.password !== pw.confirm) er.confirm = "Passwords do not match.";
    setErrors(er);
    if (Object.keys(er).length) return;
    setBusy(true);
    setFormError("");
    try {
      const d = await api("/auth/password/reset", {
        method: "POST",
        body: { token, password: pw.password },
      });
      if (user) await refresh(); // the server signed this device out too
      navigate("/login", { replace: true, state: { notice: d.message } });
    } catch (err) {
      if (err.data?.code === "invalid_token") setStatus("invalid");
      else if (err.data?.field)
        setErrors({
          [err.data.field === "password" ? "password" : "confirm"]: err.message,
        });
      else setFormError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (status === "checking")
    return (
      <AuthLayout>
        <Loading label="Checking your reset link…" />
      </AuthLayout>
    );

  if (status === "invalid") {
    return (
      <AuthLayout>
        <div className="auth-icon auth-icon--warn">
          <AlertTriangle size={22} aria-hidden="true" />
        </div>
        <h1>This link can't be used</h1>
        <p className="auth-sub">
          Password reset links expire after a short time and work only once.
          Request a new link and use the most recent email.
        </p>
        <Link to="/forgot-password" className="btn btn-primary auth-submit">
          Request a new link
        </Link>
        <p className="auth-sub auth-foot">
          <Link to="/login">Back to log in</Link>
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <h1>Choose a new password</h1>
      <p className="auth-sub">
        You'll be signed out on every device and asked to log in again.
      </p>
      <FormError message={formError} />
      <form onSubmit={save} noValidate>
        <Field label="New password" error={errors.password}>
          <PasswordInput
            icon={Lock}
            value={pw.password}
            onChange={(e) => {
              setPw((p) => ({ ...p, password: e.target.value }));
              setErrors({});
            }}
            autoComplete="new-password"
            placeholder={PASSWORD_HINT}
            autoFocus
            required
          />
        </Field>
        <Field label="Confirm new password" error={errors.confirm}>
          <PasswordInput
            icon={Lock}
            name="confirm"
            value={pw.confirm}
            onChange={(e) => {
              setPw((p) => ({ ...p, confirm: e.target.value }));
              setErrors({});
            }}
            autoComplete="new-password"
            placeholder="Type it again"
            required
          />
        </Field>
        <PasswordChecklist
          password={pw.password}
          confirm={pw.confirm}
          showConfirm
        />
        <button
          type="submit"
          className="btn btn-primary auth-submit"
          disabled={busy}
          aria-busy={busy}
        >
          {busy ? "Saving…" : "Save new password"}
        </button>
      </form>
    </AuthLayout>
  );
}

// ───────────────────────── OAuth return ─────────────────────────

export function AuthCallback() {
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  useEffect(() => {
    const next = params.get("next") || "/dashboard";
    const safe =
      next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
    refresh({ force: true }).then((u) =>
      navigate(u ? safe : "/login?oauthError=provider_error", {
        replace: true,
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <FullPageLoader label="Signing you in…" />;
}
