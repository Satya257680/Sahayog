// Central configuration. Validates required environment variables at startup (fixes F-09)
// so a missing/weak secret stops the server instead of causing runtime auth failures.
require("dotenv").config();

const isProd = process.env.NODE_ENV === "production";

function list(value, fallback) {
  return String(value || fallback || "")
    .split(",")
    .map((s) => s.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

function int(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

const config = {
  isProd,
  port: int(process.env.PORT, 5000),
  jwtSecret: process.env.JWT_SECRET || "",
  otpSecret: process.env.OTP_SECRET || process.env.JWT_SECRET || "",
  // Explicit allow-list of browser origins (fixes F-14). First entry is used for redirects.
  allowedOrigins: list(
    process.env.CLIENT_URLS || process.env.CLIENT_URL,
    "http://localhost:5173",
  ),
  // Public base URL of the API as the *browser* sees it (used to build OAuth callback URLs).
  // In development the Vite proxy serves the API under the client origin, so cookies stay first-party.
  publicApiUrl: (
    process.env.PUBLIC_API_URL || "http://localhost:5173/api"
  ).replace(/\/+$/, ""),
  cookieName: "sahayog_session",
  // Non-secret companion cookie ("1") readable by JavaScript. It only tells the SPA that a session
  // cookie *may* exist, so public pages don't call the protected /api/auth/me endpoint for visitors.
  // The HttpOnly session cookie remains the only thing that authenticates a request.
  sessionHintCookieName: "sahayog_auth",
  sessionDays: int(process.env.SESSION_DAYS, 7),
  cookieSecure: process.env.COOKIE_SECURE
    ? process.env.COOKIE_SECURE === "true"
    : isProd,
  // Development: the Vite dev server proxies /api from 127.0.0.1 and adds X-Forwarded-For (xfwd: true).
  // Trusting only loopback gives rate limiting the real client IP instead of keying everyone to the proxy.
  trustProxy: process.env.TRUST_PROXY
    ? Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY
    : isProd
      ? 1
      : "loopback",
  serveClient: process.env.SERVE_CLIENT === "true",

  // Single source of truth for the password length rule (frontend mirrors it in client/src/password.js).
  password: { minLength: 8, maxLength: 30 },

  // Email password-reset links (replaces the old 6-digit email OTP flow).
  passwordReset: {
    ttlMinutes: int(process.env.PASSWORD_RESET_TTL_MINUTES, 30),
    resendCooldownSeconds: int(process.env.PASSWORD_RESET_COOLDOWN_SECONDS, 60),
    maxEmailsPerHour: int(process.env.PASSWORD_RESET_MAX_PER_HOUR, 3),
  },

  mail: {
    host: process.env.SMTP_HOST || "",
    port: int(process.env.SMTP_PORT, 587),
    secure: process.env.SMTP_SECURE === "true",
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    from: process.env.MAIL_FROM || "Sahayog <no-reply@sahayog.local>",
    // Development only: print outgoing emails to the server console when SMTP is not configured.
    devConsole: !isProd && process.env.MAIL_DEV_CONSOLE === "true",
  },

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
  },
  facebook: {
    appId: process.env.FACEBOOK_APP_ID || "",
    appSecret: process.env.FACEBOOK_APP_SECRET || "",
    graphVersion: process.env.FACEBOOK_GRAPH_VERSION || "v19.0",
  },
};

config.clientUrl = config.allowedOrigins[0];
config.mail.configured = Boolean(config.mail.host);
config.google.enabled = Boolean(
  config.google.clientId && config.google.clientSecret,
);
config.facebook.enabled = Boolean(
  config.facebook.appId && config.facebook.appSecret,
);

function validateConfig() {
  const problems = [];
  const weak = [
    "change-me",
    "changeme",
    "secret",
    "your-secret",
    "replace-with-a-long-random-string",
  ];
  if (!config.jwtSecret) problems.push("JWT_SECRET is missing.");
  else if (
    config.jwtSecret.length < 32 ||
    weak.includes(config.jwtSecret.toLowerCase())
  )
    problems.push(
      "JWT_SECRET must be a random string of at least 32 characters.",
    );
  if (process.env.OTP_SECRET && process.env.OTP_SECRET.length < 32)
    problems.push(
      "OTP_SECRET must be at least 32 characters (or remove it to reuse JWT_SECRET).",
    );
  if (isProd && !config.mail.configured)
    problems.push(
      "SMTP_HOST (and SMTP credentials) are required in production so password-reset emails can be delivered.",
    );
  if (isProd && config.allowedOrigins.some((o) => o === "*"))
    problems.push(
      'CLIENT_URLS cannot contain "*" because the API uses credentialed cookies.',
    );
  if (!config.mail.configured && !config.mail.devConsole) {
    console.warn(
      "[config] SMTP is not configured and MAIL_DEV_CONSOLE is not enabled — password-reset emails cannot be delivered. /api/auth/password/forgot will return 503 until SMTP_HOST is set.",
    );
  }
  if (problems.length) {
    console.error(
      "\n[config] Sahayog API cannot start:\n - " +
        problems.join("\n - ") +
        "\nSee server/.env.example.\n",
    );
    process.exit(1);
  }
}

module.exports = { config, validateConfig };
