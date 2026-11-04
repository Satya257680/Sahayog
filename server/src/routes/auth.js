const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { withTransaction } = require('../db');
const { config } = require('../config');
const mailer = require('../utils/mailer');
const { requireAuth } = require('../middleware/auth');
const { limits } = require('../middleware/security');
const {
  normalizeEmail, isValidEmail, passwordProblem, generateOtp, hashSecret, safeEqualHex,
  randomToken, setSessionCookie, clearSessionCookie, publicUser
} = require('../utils/security');

const router = express.Router();
const BCRYPT_ROUNDS = 12;
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser-not-a-real-password', BCRYPT_ROUNDS);
const { otp: OTP } = config;

const GENERIC_LOGIN_ERROR = 'Email or password is incorrect.';
const GENERIC_CODE_ERROR = 'This code is invalid or has expired. Please request a new one.';

async function logEvent(event, { userId = null, email = null, req } = {}) {
  try {
    await db.execute('INSERT INTO auth_events (user_id, email, event, ip) VALUES (?, ?, ?, ?)', [userId, email, event, req?.ip?.slice(0, 64) || null]);
  } catch (err) { console.error('auth_events insert failed:', err.message); }
}

const USER_COLUMNS = 'id, name, email, password_hash, email_verified, token_version, phone, city, state, created_at';
async function findUserByEmail(email, conn = db) {
  const [rows] = await conn.execute(`SELECT ${USER_COLUMNS} FROM users WHERE email = ?`, [email]);
  return rows[0] || null;
}
async function findUserById(id, conn = db) {
  const [rows] = await conn.execute(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`, [id]);
  return rows[0] || null;
}

/** Works out whether a new OTP can be sent for a challenge row (cooldown + hourly cap). */
function sendWindow(row) {
  if (!row) return { allowed: true, resetWindow: true };
  const sinceLast = Number(row.since_last);
  const windowAge = Number(row.window_age);
  if (sinceLast < OTP.resendCooldownSeconds) return { allowed: false, retryAfter: OTP.resendCooldownSeconds - sinceLast };
  if (windowAge >= 3600) return { allowed: true, resetWindow: true };
  if (Number(row.send_count) >= OTP.maxSendsPerHour) return { allowed: false, retryAfter: 3600 - windowAge, capped: true };
  return { allowed: true, resetWindow: false };
}
function tooSoon(res, win) {
  res.set('Retry-After', String(win.retryAfter));
  return res.status(429).json({
    message: win.capped
      ? 'You have requested too many codes. Please try again later.'
      : `Please wait ${win.retryAfter} seconds before requesting another code.`,
    retryAfter: win.retryAfter
  });
}
const TIMING_COLUMNS = `TIMESTAMPDIFF(SECOND, last_sent_at, UTC_TIMESTAMP()) AS since_last,
  TIMESTAMPDIFF(SECOND, window_started_at, UTC_TIMESTAMP()) AS window_age,
  (otp_expires_at < UTC_TIMESTAMP()) AS expired`;

// ---------------------------------------------------------------------------
// Providers (lets the UI enable/disable the Google & Facebook buttons honestly)
// ---------------------------------------------------------------------------
router.get('/providers', (req, res) => {
  res.json({
    google: config.google.enabled,
    facebook: config.facebook.enabled,
    password: { minLength: 15, maxLength: 30 },
    otp: { length: OTP.length, ttlMinutes: OTP.ttlMinutes, resendCooldownSeconds: OTP.resendCooldownSeconds }
  });
});

// ---------------------------------------------------------------------------
// Sign up → email OTP → verified account  (F-01, F-02)
// ---------------------------------------------------------------------------
async function issueSignupOtp({ email, name, passwordHash }) {
  const [rows] = await db.execute(`SELECT id, send_count, ${TIMING_COLUMNS} FROM pending_registrations WHERE email = ?`, [email]);
  const win = sendWindow(rows[0]);
  if (!win.allowed) return { win };
  const code = generateOtp();
  const otpHash = hashSecret(code, `signup:${email}`);
  if (!rows[0]) {
    if (!passwordHash) return { missing: true };
    await db.execute(
      `INSERT INTO pending_registrations (email, name, password_hash, otp_hash, otp_expires_at, attempts, send_count, window_started_at, last_sent_at)
       VALUES (?, ?, ?, ?, UTC_TIMESTAMP() + INTERVAL ? MINUTE, 0, 1, UTC_TIMESTAMP(), UTC_TIMESTAMP())`,
      [email, name, passwordHash, otpHash, OTP.ttlMinutes]
    );
  } else {
    await db.execute(
      `UPDATE pending_registrations SET
         name = COALESCE(?, name), password_hash = COALESCE(?, password_hash),
         otp_hash = ?, otp_expires_at = UTC_TIMESTAMP() + INTERVAL ? MINUTE, attempts = 0,
         send_count = IF(?, 1, send_count + 1), window_started_at = IF(?, UTC_TIMESTAMP(), window_started_at),
         last_sent_at = UTC_TIMESTAMP()
       WHERE email = ?`,
      [name || null, passwordHash || null, otpHash, OTP.ttlMinutes, win.resetWindow ? 1 : 0, win.resetWindow ? 1 : 0, email]
    );
  }
  const [[pending]] = await db.execute('SELECT name FROM pending_registrations WHERE email = ?', [email]);
  try {
    await mailer.sendSignupOtp(email, pending.name, code);
  } catch (err) {
    // Let the user retry immediately if delivery failed.
    await db.execute('UPDATE pending_registrations SET last_sent_at = UTC_TIMESTAMP() - INTERVAL 1 DAY, send_count = GREATEST(send_count - 1, 0) WHERE email = ?', [email]);
    throw Object.assign(new Error('We could not send the verification email. Please try again in a moment.'), { status: 503, expose: true, cause: err });
  }
  return { sent: true };
}

router.post('/register', limits.sendOtp, async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim().replace(/\s+/g, ' ');
    const email = normalizeEmail(req.body.email);
    const password = req.body.password;
    if (name.length < 2 || name.length > 100) return res.status(400).json({ message: 'Name must be between 2 and 100 characters.', field: 'name' });
    if (!isValidEmail(email)) return res.status(400).json({ message: 'Enter a valid email address.', field: 'email' });
    const problem = passwordProblem(password);
    if (problem) return res.status(400).json({ message: problem, field: 'password' });

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const generic = { message: `We sent a ${OTP.length}-digit verification code to ${email}.`, email, resendIn: OTP.resendCooldownSeconds, expiresInMinutes: OTP.ttlMinutes };

    const existing = await findUserByEmail(email);
    if (existing) {
      // Do not reveal that the account exists; tell the real owner by email instead.
      mailer.sendAlreadyRegistered(email).catch(err => console.error('already-registered mail failed:', err.message));
      await logEvent('signup_existing_email', { userId: existing.id, email, req });
      return res.json(generic);
    }

    const result = await issueSignupOtp({ email, name, passwordHash });
    if (result.win) return tooSoon(res, result.win);
    await logEvent('signup_otp_sent', { email, req });
    res.json(generic);
  } catch (err) { next(err); }
});

router.post('/register/resend', limits.sendOtp, async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    if (!isValidEmail(email)) return res.status(400).json({ message: 'Enter a valid email address.' });
    const generic = { message: 'If this sign-up is still pending, a new code is on its way.', resendIn: OTP.resendCooldownSeconds };
    const result = await issueSignupOtp({ email });
    if (result.win) return tooSoon(res, result.win);
    if (result.sent) await logEvent('signup_otp_resent', { email, req });
    res.json(generic);
  } catch (err) { next(err); }
});

router.post('/register/verify', limits.verifyOtp, async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    const code = String(req.body.otp || '').trim();
    if (!isValidEmail(email) || !new RegExp(`^\\d{${OTP.length}}$`).test(code)) {
      return res.status(400).json({ message: `Enter the ${OTP.length}-digit code from your email.` });
    }
    const outcome = await withTransaction(async conn => {
      const [rows] = await conn.execute(`SELECT id, name, password_hash, otp_hash, attempts, ${TIMING_COLUMNS} FROM pending_registrations WHERE email = ? FOR UPDATE`, [email]);
      const pending = rows[0];
      if (!pending) return { status: 400, message: GENERIC_CODE_ERROR };
      if (pending.attempts >= OTP.maxAttempts) return { status: 429, message: 'Too many incorrect attempts. Please request a new code.' };
      if (Number(pending.expired)) return { status: 400, message: 'This code has expired. Please request a new one.' };
      if (!safeEqualHex(hashSecret(code, `signup:${email}`), pending.otp_hash)) {
        await conn.execute('UPDATE pending_registrations SET attempts = attempts + 1 WHERE id = ?', [pending.id]);
        const left = OTP.maxAttempts - pending.attempts - 1;
        return { status: 400, commit: true, message: left > 0 ? `Incorrect code. ${left} attempt${left === 1 ? '' : 's'} left.` : 'Too many incorrect attempts. Please request a new code.' };
      }
      if (await findUserByEmail(email, conn)) {
        await conn.execute('DELETE FROM pending_registrations WHERE id = ?', [pending.id]);
        return { status: 409, commit: true, message: 'This email is already registered. Please log in.' };
      }
      const [ins] = await conn.execute(
        'INSERT INTO users (name, email, password_hash, email_verified, last_login_at) VALUES (?, ?, ?, 1, UTC_TIMESTAMP())',
        [pending.name, email, pending.password_hash]
      );
      await conn.execute('DELETE FROM pending_registrations WHERE id = ?', [pending.id]);
      return { userId: ins.insertId };
    });
    if (!outcome.userId) return res.status(outcome.status).json({ message: outcome.message });
    const user = await findUserById(outcome.userId);
    setSessionCookie(res, user);
    await logEvent('signup_verified', { userId: user.id, email, req });
    res.status(201).json({ user: publicUser(user), message: 'Your email is verified. Welcome to Sahayog!' });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// Login / logout / session
// ---------------------------------------------------------------------------
router.post('/login', limits.loginIp, limits.login, async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    if (!isValidEmail(email) || !password) return res.status(400).json({ message: 'Enter your email and password.' });

    const user = await findUserByEmail(email);
    const ok = await bcrypt.compare(password, user?.password_hash || DUMMY_HASH);
    if (!user || !user.password_hash || !ok) {
      // Signed up but never verified? Only tell them if they proved the password.
      if (!user) {
        const [pending] = await db.execute('SELECT password_hash FROM pending_registrations WHERE email = ?', [email]);
        if (pending[0] && await bcrypt.compare(password, pending[0].password_hash)) {
          return res.status(403).json({ message: 'Please verify your email to finish creating your account.', needsVerification: true, email });
        }
      }
      await logEvent('login_failed', { userId: user?.id || null, email, req });
      return res.status(401).json({ message: GENERIC_LOGIN_ERROR });
    }
    if (!user.email_verified) return res.status(401).json({ message: GENERIC_LOGIN_ERROR });

    await db.execute('UPDATE users SET last_login_at = UTC_TIMESTAMP() WHERE id = ?', [user.id]);
    setSessionCookie(res, user);
    await logEvent('login_success', { userId: user.id, email, req });
    res.json({ user: publicUser(user) });
  } catch (err) { next(err); }
});

router.post('/logout', async (req, res) => {
  clearSessionCookie(res);
  res.json({ message: 'You have been logged out.' });
});

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await findUserById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found.' });
    const [ids] = await db.execute('SELECT provider FROM oauth_identities WHERE user_id = ?', [user.id]);
    res.json({ user: { ...publicUser(user), providers: ids.map(r => r.provider) } });
  } catch (err) { next(err); }
});

router.patch('/me', requireAuth, async (req, res, next) => {
  try {
    const clean = (v, max) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
    const name = clean(req.body.name, 100);
    const phone = clean(req.body.phone, 30);
    const city = clean(req.body.city, 100);
    const state = clean(req.body.state, 100);
    if (name.length < 2) return res.status(400).json({ message: 'Name must be between 2 and 100 characters.', field: 'name' });
    if (phone && !/^[+0-9 ()-]{6,30}$/.test(phone)) return res.status(400).json({ message: 'Enter a valid phone number.', field: 'phone' });
    await db.execute('UPDATE users SET name = ?, phone = ?, city = ?, state = ? WHERE id = ?', [name, phone || null, city || null, state || null, req.user.id]);
    const user = await findUserById(req.user.id);
    res.json({ user: publicUser(user), message: 'Profile saved.' });
  } catch (err) { next(err); }
});

router.post('/password/change', requireAuth, limits.verifyOtp, async (req, res, next) => {
  try {
    const user = await findUserById(req.user.id);
    const current = typeof req.body.currentPassword === 'string' ? req.body.currentPassword : '';
    const next_ = req.body.newPassword;
    if (user.password_hash && !(await bcrypt.compare(current, user.password_hash))) {
      return res.status(400).json({ message: 'Your current password is incorrect.', field: 'currentPassword' });
    }
    const problem = passwordProblem(next_);
    if (problem) return res.status(400).json({ message: problem, field: 'newPassword' });
    const hash = await bcrypt.hash(next_, BCRYPT_ROUNDS);
    await db.execute('UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?', [hash, user.id]);
    const updated = await findUserById(user.id);
    setSessionCookie(res, updated); // keep this device signed in, revoke all others
    mailer.sendPasswordChanged(user.email).catch(() => {});
    await logEvent('password_changed', { userId: user.id, email: user.email, req });
    res.json({ message: 'Password updated. Other devices have been signed out.', user: publicUser(updated) });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// Forgot password → email OTP → reset token → new password  (F-04)
// ---------------------------------------------------------------------------
router.post('/password/forgot', limits.sendOtp, async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    if (!isValidEmail(email)) return res.status(400).json({ message: 'Enter a valid email address.' });
    const generic = { message: `If an account exists for ${email}, we sent a ${OTP.length}-digit code to it.`, resendIn: OTP.resendCooldownSeconds, expiresInMinutes: OTP.ttlMinutes };

    const user = await findUserByEmail(email);
    if (!user) { await logEvent('reset_unknown_email', { email, req }); return res.json(generic); }

    const [rows] = await db.execute(`SELECT id, send_count, ${TIMING_COLUMNS} FROM password_resets WHERE user_id = ?`, [user.id]);
    const win = sendWindow(rows[0]);
    if (!win.allowed) return res.json(generic); // silently skip, response must look the same

    const code = generateOtp();
    const otpHash = hashSecret(code, `reset:${user.id}`);
    if (!rows[0]) {
      await db.execute(
        `INSERT INTO password_resets (user_id, otp_hash, otp_expires_at, attempts, send_count, window_started_at, last_sent_at)
         VALUES (?, ?, UTC_TIMESTAMP() + INTERVAL ? MINUTE, 0, 1, UTC_TIMESTAMP(), UTC_TIMESTAMP())`,
        [user.id, otpHash, OTP.ttlMinutes]
      );
    } else {
      await db.execute(
        `UPDATE password_resets SET otp_hash = ?, otp_expires_at = UTC_TIMESTAMP() + INTERVAL ? MINUTE, attempts = 0,
           send_count = IF(?, 1, send_count + 1), window_started_at = IF(?, UTC_TIMESTAMP(), window_started_at),
           last_sent_at = UTC_TIMESTAMP(), reset_token_hash = NULL, reset_token_expires_at = NULL
         WHERE user_id = ?`,
        [otpHash, OTP.ttlMinutes, win.resetWindow ? 1 : 0, win.resetWindow ? 1 : 0, user.id]
      );
    }
    try {
      await mailer.sendResetOtp(email, code);
      await logEvent('reset_otp_sent', { userId: user.id, email, req });
    } catch (err) {
      console.error('reset mail failed:', err.message);
      await db.execute('UPDATE password_resets SET last_sent_at = UTC_TIMESTAMP() - INTERVAL 1 DAY WHERE user_id = ?', [user.id]);
    }
    res.json(generic);
  } catch (err) { next(err); }
});

router.post('/password/verify', limits.verifyOtp, async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    const code = String(req.body.otp || '').trim();
    if (!isValidEmail(email) || !new RegExp(`^\\d{${OTP.length}}$`).test(code)) {
      return res.status(400).json({ message: `Enter the ${OTP.length}-digit code from your email.` });
    }
    const user = await findUserByEmail(email);
    if (!user) return res.status(400).json({ message: GENERIC_CODE_ERROR });

    const outcome = await withTransaction(async conn => {
      const [rows] = await conn.execute(`SELECT id, otp_hash, attempts, reset_token_hash, ${TIMING_COLUMNS} FROM password_resets WHERE user_id = ? FOR UPDATE`, [user.id]);
      const reset = rows[0];
      if (!reset || reset.reset_token_hash) return { status: 400, message: GENERIC_CODE_ERROR }; // already used
      if (reset.attempts >= OTP.maxAttempts) return { status: 429, message: 'Too many incorrect attempts. Please request a new code.' };
      if (Number(reset.expired)) return { status: 400, message: 'This code has expired. Please request a new one.' };
      if (!safeEqualHex(hashSecret(code, `reset:${user.id}`), reset.otp_hash)) {
        await conn.execute('UPDATE password_resets SET attempts = attempts + 1 WHERE id = ?', [reset.id]);
        const left = OTP.maxAttempts - reset.attempts - 1;
        return { status: 400, message: left > 0 ? `Incorrect code. ${left} attempt${left === 1 ? '' : 's'} left.` : 'Too many incorrect attempts. Please request a new code.' };
      }
      const token = randomToken();
      // Burn the OTP (single use) and issue a short-lived reset token instead.
      await conn.execute(
        `UPDATE password_resets SET otp_hash = ?, otp_expires_at = UTC_TIMESTAMP() - INTERVAL 1 SECOND,
           reset_token_hash = ?, reset_token_expires_at = UTC_TIMESTAMP() + INTERVAL ? MINUTE WHERE id = ?`,
        [hashSecret(randomToken(), 'burned'), hashSecret(token, `reset-token:${user.id}`), OTP.resetTokenMinutes, reset.id]
      );
      return { token };
    });
    if (!outcome.token) return res.status(outcome.status).json({ message: outcome.message });
    await logEvent('reset_otp_verified', { userId: user.id, email, req });
    res.json({ resetToken: outcome.token, expiresInMinutes: OTP.resetTokenMinutes, message: 'Code verified. Choose a new password.' });
  } catch (err) { next(err); }
});

router.post('/password/reset', limits.verifyOtp, async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    const token = String(req.body.resetToken || '');
    const password = req.body.password;
    const problem = passwordProblem(password);
    if (problem) return res.status(400).json({ message: problem, field: 'password' });
    const user = await findUserByEmail(email);
    if (!user || !token) return res.status(400).json({ message: 'Your reset session has expired. Please start again.' });

    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const ok = await withTransaction(async conn => {
      const [rows] = await conn.execute(
        'SELECT id, reset_token_hash, (reset_token_expires_at < UTC_TIMESTAMP()) AS expired FROM password_resets WHERE user_id = ? FOR UPDATE',
        [user.id]
      );
      const reset = rows[0];
      if (!reset || !reset.reset_token_hash || Number(reset.expired) || !safeEqualHex(hashSecret(token, `reset-token:${user.id}`), reset.reset_token_hash)) return false;
      // New password, revoke every existing session, and invalidate the reset challenge.
      await conn.execute('UPDATE users SET password_hash = ?, email_verified = 1, token_version = token_version + 1 WHERE id = ?', [hash, user.id]);
      await conn.execute('DELETE FROM password_resets WHERE id = ?', [reset.id]);
      return true;
    });
    if (!ok) return res.status(400).json({ message: 'Your reset session has expired. Please start again.' });
    clearSessionCookie(res);
    mailer.sendPasswordChanged(email).catch(() => {});
    await logEvent('password_reset', { userId: user.id, email, req });
    res.json({ message: 'Password updated. Please log in with your new password.' });
  } catch (err) { next(err); }
});

module.exports = router;
module.exports.findUserById = findUserById;
module.exports.logEvent = logEvent;
