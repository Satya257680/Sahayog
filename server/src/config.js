// Central configuration. Validates required environment variables at startup (fixes F-09)
// so a missing/weak secret stops the server instead of causing runtime auth failures.
require('dotenv').config();

const isProd = process.env.NODE_ENV === 'production';

function list(value, fallback) {
  return String(value || fallback || '')
    .split(',')
    .map(s => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

function int(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

const config = {
  isProd,
  port: int(process.env.PORT, 5000),
  jwtSecret: process.env.JWT_SECRET || '',
  otpSecret: process.env.OTP_SECRET || process.env.JWT_SECRET || '',
  // Explicit allow-list of browser origins (fixes F-14). First entry is used for redirects.
  allowedOrigins: list(process.env.CLIENT_URLS || process.env.CLIENT_URL, 'http://localhost:5173'),
  // Public base URL of the API as the *browser* sees it (used to build OAuth callback URLs).
  // In development the Vite proxy serves the API under the client origin, so cookies stay first-party.
  publicApiUrl: (process.env.PUBLIC_API_URL || 'http://localhost:5173/api').replace(/\/+$/, ''),
  cookieName: 'sahayog_session',
  sessionDays: int(process.env.SESSION_DAYS, 7),
  cookieSecure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : isProd,
  trustProxy: process.env.TRUST_PROXY ? Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY : (isProd ? 1 : false),
  serveClient: process.env.SERVE_CLIENT === 'true',

  otp: {
    length: 6,
    ttlMinutes: int(process.env.OTP_TTL_MINUTES, 10),
    maxAttempts: int(process.env.OTP_MAX_ATTEMPTS, 5),
    resendCooldownSeconds: int(process.env.OTP_RESEND_COOLDOWN_SECONDS, 60),
    maxSendsPerHour: int(process.env.OTP_MAX_SENDS_PER_HOUR, 5),
    resetTokenMinutes: 15
  },

  mail: {
    host: process.env.SMTP_HOST || '',
    port: int(process.env.SMTP_PORT, 587),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM || 'Sahayog <no-reply@sahayog.local>',
    // Development only: print outgoing emails to the server console when SMTP is not configured.
    devConsole: !isProd && process.env.MAIL_DEV_CONSOLE === 'true'
  },

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || ''
  },
  facebook: {
    appId: process.env.FACEBOOK_APP_ID || '',
    appSecret: process.env.FACEBOOK_APP_SECRET || '',
    graphVersion: process.env.FACEBOOK_GRAPH_VERSION || 'v19.0'
  }
};

config.clientUrl = config.allowedOrigins[0];
config.mail.configured = Boolean(config.mail.host);
config.google.enabled = Boolean(config.google.clientId && config.google.clientSecret);
config.facebook.enabled = Boolean(config.facebook.appId && config.facebook.appSecret);

function validateConfig() {
  const problems = [];
  const weak = ['change-me', 'changeme', 'secret', 'your-secret', 'replace-with-a-long-random-string'];
  if (!config.jwtSecret) problems.push('JWT_SECRET is missing.');
  else if (config.jwtSecret.length < 32 || weak.includes(config.jwtSecret.toLowerCase())) problems.push('JWT_SECRET must be a random string of at least 32 characters.');
  if (process.env.OTP_SECRET && process.env.OTP_SECRET.length < 32) problems.push('OTP_SECRET must be at least 32 characters (or remove it to reuse JWT_SECRET).');
  if (isProd && !config.mail.configured) problems.push('SMTP_HOST (and SMTP credentials) are required in production so OTP emails can be delivered.');
  if (isProd && config.allowedOrigins.some(o => o === '*')) problems.push('CLIENT_URLS cannot contain "*" because the API uses credentialed cookies.');
  if (!config.mail.configured && !config.mail.devConsole) {
    console.warn('[config] SMTP is not configured and MAIL_DEV_CONSOLE is not enabled — OTP emails cannot be delivered.');
  }
  if (problems.length) {
    console.error('\n[config] Sahayog API cannot start:\n - ' + problems.join('\n - ') + '\nSee server/.env.example.\n');
    process.exit(1);
  }
}

module.exports = { config, validateConfig };
