const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { config } = require("../config");

// ---------- Validation ----------
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
function normalizeEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}
function isValidEmail(email) {
  return email.length <= 190 && EMAIL_RE.test(email);
}

/**
 * Password policy: 8–30 characters (config.password), at least one uppercase, one lowercase,
 * one digit and one special character. The password is never trimmed or modified.
 * Returns an error message, or null when the password is valid.
 */
function passwordProblem(password) {
  const { minLength, maxLength } = config.password;
  if (typeof password !== "string" || password.length === 0)
    return "Password is required.";
  const length = [...password].length;
  if (length < minLength || length > maxLength)
    return `Password must be ${minLength}–${maxLength} characters long.`;
  if (!/[A-Z]/.test(password))
    return "Password must include at least one uppercase letter.";
  if (!/[a-z]/.test(password))
    return "Password must include at least one lowercase letter.";
  if (!/[0-9]/.test(password))
    return "Password must include at least one number.";
  if (!/[^A-Za-z0-9\s]/.test(password))
    return "Password must include at least one special character (e.g. ! @ # $ %).";
  return null;
}

function positiveId(value) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 && String(value).trim() === String(n)
    ? n
    : null;
}

// ---------- Secrets / tokens ----------
/** Secrets (reset tokens) are stored as HMAC-SHA256 keyed with a server secret, never in plain text. */
function hashSecret(value, purpose) {
  return crypto
    .createHmac("sha256", config.otpSecret)
    .update(`${purpose}:${value}`)
    .digest("hex");
}
function safeEqualHex(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}
function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

// Password-reset tokens: 32 random bytes → 43 base64url chars. Only the keyed hash is stored.
const RESET_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
function isResetTokenShape(token) {
  return typeof token === "string" && RESET_TOKEN_RE.test(token);
}
function hashResetToken(token) {
  return hashSecret(token, "password-reset");
}

// ---------- Session (HttpOnly cookie, fixes F-08) ----------
function signSession(user) {
  return jwt.sign(
    { sub: String(user.id), tv: Number(user.token_version || 0) },
    config.jwtSecret,
    { expiresIn: `${config.sessionDays}d`, algorithm: "HS256" },
  );
}
function cookieOptions() {
  return {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: "lax",
    path: "/",
    maxAge: config.sessionDays * 24 * 60 * 60 * 1000,
  };
}
/** Same lifetime/scope as the session, but readable by JS and carrying no secret (value is "1"). */
function hintCookieOptions() {
  return { ...cookieOptions(), httpOnly: false };
}
function setSessionHintCookie(res) {
  res.cookie(config.sessionHintCookieName, "1", hintCookieOptions());
}
function setSessionCookie(res, user) {
  res.cookie(config.cookieName, signSession(user), cookieOptions());
  setSessionHintCookie(res);
}
function clearSessionCookie(res) {
  const { maxAge, ...opts } = cookieOptions();
  res.clearCookie(config.cookieName, opts);
  clearSessionHintCookie(res);
}
function clearSessionHintCookie(res) {
  const { maxAge, ...opts } = hintCookieOptions();
  res.clearCookie(config.sessionHintCookieName, opts);
}

function publicUser(row) {
  return {
    id: Number(row.id),
    name: row.name,
    email: row.email,
    phone: row.phone || "",
    city: row.city || "",
    state: row.state || "",
    hasPassword: Boolean(row.password_hash),
    createdAt: row.created_at,
  };
}

module.exports = {
  normalizeEmail,
  isValidEmail,
  passwordProblem,
  positiveId,
  hashSecret,
  safeEqualHex,
  randomToken,
  isResetTokenShape,
  hashResetToken,
  signSession,
  setSessionCookie,
  clearSessionCookie,
  setSessionHintCookie,
  clearSessionHintCookie,
  publicUser,
};
