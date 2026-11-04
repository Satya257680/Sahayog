// Creates the database (if needed), applies sql/schema.sql and upgrades older installs.
// Usage: npm run migrate
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const DB_NAME = process.env.DB_NAME || 'sahayog';

async function columnExists(conn, table, column) {
  const [rows] = await conn.execute(
    'SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?',
    [DB_NAME, table, column]
  );
  return rows.length > 0;
}
async function tableExists(conn, table) {
  const [rows] = await conn.execute('SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?', [DB_NAME, table]);
  return rows.length > 0;
}

async function main() {
  if (!/^[A-Za-z0-9_]+$/.test(DB_NAME)) throw new Error('DB_NAME may only contain letters, numbers and underscores.');
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true,
    charset: 'utf8mb4'
  });
  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await conn.query(`USE \`${DB_NAME}\``);

  let sql = fs.readFileSync(path.join(__dirname, '..', 'sql', 'schema.sql'), 'utf8');

  // Older installs: tables may already exist with a different id type (e.g. signed INT).
  // Foreign-key columns must match exactly, so adapt new tables to the real referenced types.
  const FK_COLUMNS = {
    users: ['user_id', 'participant_one', 'participant_two', 'sender_id'],
    listings: ['listing_id'],
    conversations: ['conversation_id']
  };
  for (const [table, columns] of Object.entries(FK_COLUMNS)) {
    if (!(await tableExists(conn, table))) continue;
    const [[idCol]] = await conn.execute(
      "SELECT COLUMN_TYPE AS t FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = 'id'",
      [DB_NAME, table]
    );
    const idType = String(idCol.t).toUpperCase().replace(/\(\d+\)/, '');
    if (idType === 'INT UNSIGNED') continue;
    const re = new RegExp(`(\\b(?:${columns.join('|')})\\s+)INT UNSIGNED`, 'g');
    sql = sql.replace(re, `$1${idType}`);
  }

  if (await tableExists(conn, 'users')) {
    // Add columns introduced by the auth upgrade.
    const upgrades = [
      ['email_verified', 'ADD COLUMN email_verified TINYINT(1) NOT NULL DEFAULT 0', true],
      ['token_version', 'ADD COLUMN token_version INT UNSIGNED NOT NULL DEFAULT 0'],
      ['last_login_at', 'ADD COLUMN last_login_at DATETIME NULL'],
      ['phone', 'ADD COLUMN phone VARCHAR(30) NULL'],
      ['city', 'ADD COLUMN city VARCHAR(100) NULL'],
      ['state', 'ADD COLUMN state VARCHAR(100) NULL'],
      ['updated_at', 'ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP']
    ];
    for (const [column, ddl, markExistingVerified] of upgrades) {
      if (!(await columnExists(conn, 'users', column))) {
        await conn.query(`ALTER TABLE users ${ddl}`);
        console.log(`  + users.${column}`);
        // Accounts created before email verification existed keep working.
        if (markExistingVerified) await conn.query('UPDATE users SET email_verified = 1');
      }
    }
    // Social-login accounts have no password.
    await conn.query('ALTER TABLE users MODIFY password_hash VARCHAR(255) NULL');
  }

  await conn.query(sql);
  console.log(`Database "${DB_NAME}" is up to date.`);
  await conn.end();
}

main().catch(err => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
