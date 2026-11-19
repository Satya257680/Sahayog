// Test harness: a disposable MySQL/MariaDB database + the real Express app on a random port.
// SAFETY: refuses to run unless the database name ends with "_test", because it DROPs that database.
const path = require("path");
const { execFileSync } = require("child_process");

const TEST_DB = process.env.TEST_DB_NAME || "sahayog_test";
if (!/^[A-Za-z0-9_]+_test$/.test(TEST_DB)) {
  throw new Error(
    `Refusing to run: TEST_DB_NAME must end with "_test" (got "${TEST_DB}").`,
  );
}

// Configure the app for tests *before* any server module is loaded.
Object.assign(process.env, {
  NODE_ENV: "test",
  DB_HOST: process.env.TEST_DB_HOST || process.env.DB_HOST || "localhost",
  DB_PORT: process.env.TEST_DB_PORT || process.env.DB_PORT || "3306",
  DB_USER: process.env.TEST_DB_USER || process.env.DB_USER || "root",
  DB_PASSWORD: process.env.TEST_DB_PASSWORD ?? process.env.DB_PASSWORD ?? "",
  DB_NAME: TEST_DB,
  JWT_SECRET: "test-only-jwt-secret-0123456789abcdefghijklmnop",
  CLIENT_URLS: "http://localhost:5173",
  SMTP_HOST: "",
  MAIL_DEV_CONSOLE: "true", // mail is intercepted below; nothing is actually sent or printed
  PASSWORD_RESET_COOLDOWN_SECONDS: "60",
  PASSWORD_RESET_MAX_PER_HOUR: "3",
});

const mysql = require("mysql2/promise");

/**
 * Minimal reconstruction of the pre-existing tables the auth code touches. server/sql/schema.sql is
 * git-ignored and was not in the project ZIP, so these mirror the columns referenced by the code.
 * password_reset_tokens is NOT created here — migrate.js must create it (that is under test).
 */
const LEGACY_SCHEMA = `
CREATE TABLE users (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(190) NOT NULL,
  password_hash VARCHAR(255) NULL,
  email_verified TINYINT(1) NOT NULL DEFAULT 0,
  token_version INT UNSIGNED NOT NULL DEFAULT 0,
  last_login_at DATETIME NULL,
  phone VARCHAR(30) NULL, city VARCHAR(100) NULL, state VARCHAR(100) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE auth_events (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, user_id INT UNSIGNED NULL, email VARCHAR(190) NULL,
  event VARCHAR(60) NOT NULL, ip VARCHAR(64) NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE oauth_identities (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, user_id INT UNSIGNED NOT NULL, provider VARCHAR(20) NOT NULL,
  provider_user_id VARCHAR(190) NOT NULL, email VARCHAR(190) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE pending_registrations (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, email VARCHAR(190) NOT NULL UNIQUE, name VARCHAR(100) NOT NULL,
  password_hash VARCHAR(255) NOT NULL, otp_hash CHAR(64) NOT NULL, otp_expires_at DATETIME NOT NULL,
  attempts INT NOT NULL DEFAULT 0, send_count INT NOT NULL DEFAULT 0, window_started_at DATETIME NOT NULL, last_sent_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;

async function resetDatabase() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    multipleStatements: true,
  });
  await conn.query(`DROP DATABASE IF EXISTS \`${TEST_DB}\``);
  await conn.query(
    `CREATE DATABASE \`${TEST_DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  );
  await conn.query(`USE \`${TEST_DB}\``);
  await conn.query(LEGACY_SCHEMA);
  await conn.end();
  // Run the real migration script (upgrade path: schema.sql absent, tables present).
  return execFileSync(
    process.execPath,
    [path.join(__dirname, "..", "src", "migrate.js")],
    { env: process.env, encoding: "utf8" },
  );
}

async function startApp() {
  const mailer = require("../src/utils/mailer");
  const outbox = [];
  mailer.sendPasswordResetLink = async (to, link, minutes) => {
    outbox.push({ type: "reset", to, link, minutes });
  };
  mailer.sendPasswordChanged = async (to) => {
    outbox.push({ type: "changed", to });
  };
  const { app } = require("../src/server");
  const db = require("../src/db");
  const server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  return {
    base,
    db,
    mailer,
    outbox,
    async close() {
      await new Promise((r) => server.close(r));
      await db.end();
    },
  };
}

/** Minimal cookie-aware client that sends the CSRF header like the real SPA. */
function client(base) {
  const jar = new Map();
  async function call(method, p, body, extraHeaders = {}) {
    const headers = {
      "X-Requested-With": "sahayog",
      Origin: "http://localhost:5173",
      ...extraHeaders,
    };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (jar.size)
      headers.Cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
    const res = await fetch(base + p, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    for (const c of res.headers.getSetCookie()) {
      const [pair, ...attrs] = c.split(";");
      const [k, ...v] = pair.split("=");
      const value = v.join("=");
      const expired =
        !value || attrs.some((a) => /expires=thu, 01 jan 1970/i.test(a.trim()));
      if (expired) jar.delete(k.trim());
      else jar.set(k.trim(), value);
    }
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data, headers: res.headers };
  }
  return {
    jar,
    get: (p) => call("GET", p),
    post: (p, b, h) => call("POST", p, b ?? {}, h),
    patch: (p, b) => call("PATCH", p, b ?? {}),
  };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = { resetDatabase, startApp, client, wait, TEST_DB };
