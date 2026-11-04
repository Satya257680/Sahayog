const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { config } = require('../config');

// ---------- Validation ----------
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
function normalizeEmail(value) { return String(value || '').trim().toLowerCase(); }
function isValidEmail(email) { return email.length <= 190 && EMAIL_RE.test(email); }

/**
 * Password policy (F-02): 15–30 characters, at least one uppercase, one lowercase,
 * one digit and one special character. The password is never trimmed or modified.
 * Returns an error message, or null when the password is valid.
 */
function passwordProblem(password) {
  if (typeof password !== 'string') return 'Password is required.';
  const length = [...password].length;
  if (length < 15 || length > 30) return 'Password must be 15–30 characters long.';
  if (!/[A-Z]/.test(password)) return 'Password must include at least one uppercase letter.';
  if (!/[a-z]/.test(password)) return 'Password must include at least one lowercase letter.';
  if (!/[0-9]/.test(password)) return 'Password must include at least one number.';
  if (!/[^A-Za-z0-9\s]/.test(password)) return 'Password must include at least one special character (e.g. ! @ # $ %).';
  return null;
}

function positiveId(value) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 && String(value).trim() === String(n) ? n : null;
}

// ---------- OTP ----------
function generateOtp() {
  return String(crypto.randomInt(0, 10 ** config.otp.length)).padStart(config.otp.length, '0');
}
/** OTPs are stored as HMAC-SHA256 (keyed with a server secret), never in plain text. */
function hashSecret(value, purpose) {
  return crypto.createHmac('sha256', config.otpSecret).update(`${purpose}:${value}`).digest('hex');
}
function safeEqualHex(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}
function randomToken(bytes = 32) { return crypto.randomBytes(bytes).toString('base64url'); }

// ---------- Session (HttpOnly cookie, fixes F-08) ----------
function signSession(user) {
  return jwt.sign(
    { sub: String(user.id), tv: Number(user.token_version || 0) },
    config.jwtSecret,
    { expiresIn: `${config.sessionDays}d`, algorithm: 'HS256' }
  );
}
function cookieOptions() {
  return {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'lax',
    path: '/',
    maxAge: config.sessionDays * 24 * 60 * 60 * 1000
  };
}
function setSessionCookie(res, user) {
  res.cookie(config.cookieName, signSession(user), cookieOptions());
}
function clearSessionCookie(res) {
  const { maxAge, ...opts } = cookieOptions();
  res.clearCookie(config.cookieName, opts);
}

function publicUser(row) {
  return {
    id: Number(row.id),
    name: row.name,
    email: row.email,
    phone: row.phone || '',
    city: row.city || '',
    state: row.state || '',
    hasPassword: Boolean(row.password_hash),
    createdAt: row.created_at
  };
}

module.exports = {
  normalizeEmail, isValidEmail, passwordProblem, positiveId,
  generateOtp, hashSecret, safeEqualHex, randomToken,
  signSession, setSessionCookie, clearSessionCookie, publicUser
};
