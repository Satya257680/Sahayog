const jwt = require('jsonwebtoken');
const db = require('../db');
const { config } = require('../config');
const { clearSessionCookie } = require('../utils/security');

/**
 * Reads the HttpOnly session cookie, verifies the JWT and re-checks the user in MySQL.
 * token_version lets us revoke every session for a user (password reset / logout everywhere).
 */
async function loadSessionUser(req) {
  const token = req.cookies?.[config.cookieName];
  if (!token) return null;
  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
  } catch {
    return { invalid: true };
  }
  const [rows] = await db.execute(
    'SELECT id, name, email, email_verified, token_version FROM users WHERE id = ?',
    [Number(payload.sub)]
  );
  const row = rows[0];
  if (!row || !row.email_verified || Number(row.token_version) !== Number(payload.tv)) return { invalid: true };
  return { id: Number(row.id), name: row.name, email: row.email };
}

async function requireAuth(req, res, next) {
  try {
    const user = await loadSessionUser(req);
    if (!user) return res.status(401).json({ message: 'Please log in to continue.' });
    if (user.invalid) {
      clearSessionCookie(res);
      return res.status(401).json({ message: 'Your session has expired. Please log in again.' });
    }
    req.user = user;
    next();
  } catch (err) { next(err); }
}

/** Attaches req.user when a valid session exists, but never blocks the request. */
async function optionalAuth(req, res, next) {
  try {
    const user = await loadSessionUser(req);
    if (user && !user.invalid) req.user = user;
    next();
  } catch (err) { next(err); }
}

module.exports = { requireAuth, optionalAuth };
