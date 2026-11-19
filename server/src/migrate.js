// Creates the database (if needed), applies sql/schema.sql and upgrades older installs.
// Every step is idempotent (safe to re-run). Nothing is dropped or truncated.
// Usage: npm run migrate
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");

const DB_NAME = process.env.DB_NAME || "sahayog";

async function columnExists(conn, table, column) {
  const [rows] = await conn.execute(
    "SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?",
    [DB_NAME, table, column],
  );
  return rows.length > 0;
}
async function tableExists(conn, table) {
  const [rows] = await conn.execute(
    "SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?",
    [DB_NAME, table],
  );
  return rows.length > 0;
}

async function indexExists(conn, table, index) {
  const [rows] = await conn.execute(
    "SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1",
    [DB_NAME, table, index],
  );
  return rows.length > 0;
}

/**
 * 2026-11 — email password-reset links.
 * One row per emailed link. Only an HMAC-SHA256 of the token is stored (token_hash), never the token.
 * Rows are single-use (used_at), time-limited (expires_at) and cleaned up a day after expiry by the API.
 * The legacy OTP tables (password_resets, pending_registrations) are left untouched; see MIGRATION notes.
 * Rollback: DROP TABLE password_reset_tokens;  (no other table is modified by this step)
 */
async function ensurePasswordResetTokens(conn) {
  const [[users]] = await conn.execute(
    `SELECT c.COLUMN_TYPE AS idType, t.ENGINE AS engine
       FROM information_schema.COLUMNS c JOIN information_schema.TABLES t
         ON t.TABLE_SCHEMA = c.TABLE_SCHEMA AND t.TABLE_NAME = c.TABLE_NAME
      WHERE c.TABLE_SCHEMA = ? AND c.TABLE_NAME = 'users' AND c.COLUMN_NAME = 'id'`,
    [DB_NAME],
  );
  // The FK column must match users.id exactly (older installs may use signed INT).
  const idType = String(users.idType)
    .toUpperCase()
    .replace(/\s+ZEROFILL/, "");
  if (!/^(TINY|SMALL|MEDIUM|BIG)?INT(\(\d+\))?( UNSIGNED)?$/.test(idType))
    throw new Error(`Unexpected users.id type: ${users.idType}`);
  const fk =
    String(users.engine).toUpperCase() === "INNODB"
      ? ",\n      CONSTRAINT fk_prt_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE"
      : "";

  if (!(await tableExists(conn, "password_reset_tokens"))) {
    await conn.query(`CREATE TABLE password_reset_tokens (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_id ${idType} NOT NULL,
      token_hash CHAR(64) NOT NULL,
      expires_at DATETIME NOT NULL,
      used_at DATETIME NULL,
      created_at DATETIME NOT NULL,
      request_ip VARCHAR(64) NULL,
      UNIQUE KEY uq_prt_token_hash (token_hash),
      KEY idx_prt_user_created (user_id, created_at),
      KEY idx_prt_expires (expires_at)${fk}
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    console.log("  + password_reset_tokens");
  } else if (
    !(await indexExists(conn, "password_reset_tokens", "uq_prt_token_hash"))
  ) {
    await conn.query(
      "ALTER TABLE password_reset_tokens ADD UNIQUE KEY uq_prt_token_hash (token_hash)",
    );
    console.log("  + password_reset_tokens.uq_prt_token_hash");
  }
}

async function main() {
  if (!/^[A-Za-z0-9_]+$/.test(DB_NAME))
    throw new Error(
      "DB_NAME may only contain letters, numbers and underscores.",
    );
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    multipleStatements: true,
    charset: "utf8mb4",
  });
  await conn.query(
    `CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  );
  await conn.query(`USE \`${DB_NAME}\``);

  // sql/ is git-ignored, so a fresh clone may not have schema.sql. Existing databases can still be upgraded.
  const schemaPath = path.join(__dirname, "..", "sql", "schema.sql");
  const hasSchema = fs.existsSync(schemaPath);
  if (!hasSchema && !(await tableExists(conn, "users"))) {
    throw new Error(
      `Base schema not found at ${schemaPath} and the database has no "users" table. Restore server/sql/schema.sql (it is git-ignored) and run again.`,
    );
  }
  if (!hasSchema)
    console.warn(
      `  ! ${schemaPath} not found — skipping base schema, applying upgrades only.`,
    );
  let sql = hasSchema ? fs.readFileSync(schemaPath, "utf8") : "";

  // Older installs: tables may already exist with a different id type (e.g. signed INT).
  // Foreign-key columns must match exactly, so adapt new tables to the real referenced types.
  const FK_COLUMNS = {
    users: ["user_id", "participant_one", "participant_two", "sender_id"],
    listings: ["listing_id"],
    conversations: ["conversation_id"],
  };
  for (const [table, columns] of Object.entries(FK_COLUMNS)) {
    if (!(await tableExists(conn, table))) continue;
    const [[idCol]] = await conn.execute(
      "SELECT COLUMN_TYPE AS t FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = 'id'",
      [DB_NAME, table],
    );
    const idType = String(idCol.t)
      .toUpperCase()
      .replace(/\(\d+\)/, "");
    if (idType === "INT UNSIGNED") continue;
    const re = new RegExp(`(\\b(?:${columns.join("|")})\\s+)INT UNSIGNED`, "g");
    sql = sql.replace(re, `$1${idType}`);
  }

  if (await tableExists(conn, "users")) {
    // Add columns introduced by the auth upgrade.
    const upgrades = [
      [
        "email_verified",
        "ADD COLUMN email_verified TINYINT(1) NOT NULL DEFAULT 0",
        true,
      ],
      [
        "token_version",
        "ADD COLUMN token_version INT UNSIGNED NOT NULL DEFAULT 0",
      ],
      ["last_login_at", "ADD COLUMN last_login_at DATETIME NULL"],
      ["phone", "ADD COLUMN phone VARCHAR(30) NULL"],
      ["city", "ADD COLUMN city VARCHAR(100) NULL"],
      ["state", "ADD COLUMN state VARCHAR(100) NULL"],
      [
        "updated_at",
        "ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP",
      ],
    ];
    for (const [column, ddl, markExistingVerified] of upgrades) {
      if (!(await columnExists(conn, "users", column))) {
        await conn.query(`ALTER TABLE users ${ddl}`);
        console.log(`  + users.${column}`);
        // Accounts created before email verification existed keep working.
        if (markExistingVerified)
          await conn.query("UPDATE users SET email_verified = 1");
      }
    }
    // Social-login accounts have no password.
    await conn.query(
      "ALTER TABLE users MODIFY password_hash VARCHAR(255) NULL",
    );
  }

  if (sql.trim()) await conn.query(sql);

  await ensurePasswordResetTokens(conn);

  console.log(`Database "${DB_NAME}" is up to date.`);
  await conn.end();
}

main().catch((err) => {
  console.error("Migration failed:", err.message);
  process.exit(1);
});
