// Mirrors the server policy in server/src/utils/security.js. The server is authoritative.
export const PASSWORD_MIN = 15;
export const PASSWORD_MAX = 30;

export const PASSWORD_RULES = [
  { id: 'length', label: `${PASSWORD_MIN}–${PASSWORD_MAX} characters`, test: p => { const n = [...p].length; return n >= PASSWORD_MIN && n <= PASSWORD_MAX; } },
  { id: 'upper', label: 'One uppercase letter (A–Z)', test: p => /[A-Z]/.test(p) },
  { id: 'lower', label: 'One lowercase letter (a–z)', test: p => /[a-z]/.test(p) },
  { id: 'number', label: 'One number (0–9)', test: p => /[0-9]/.test(p) },
  { id: 'special', label: 'One special character (! @ # $ % …)', test: p => /[^A-Za-z0-9\s]/.test(p) }
];

export function passwordIsValid(p) { return PASSWORD_RULES.every(r => r.test(p || '')); }

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export function emailIsValid(e) { return EMAIL_RE.test(String(e || '').trim()); }
