const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db");
const { withTransaction } = require("../db");
const { config } = require("../config");
const mailer = require("../utils/mailer");
const { requireAuth } = require("../middleware/auth");
const { limits } = require("../middleware/security");
const {
  normalizeEmail,
  isValidEmail,
  passwordProblem,
  randomToken,
  isResetTokenShape,
  hashResetToken,
  setSessionCookie,
  clearSessionCookie,
  publicUser,
} = require("../utils/security");

const router = express.Router();
const BCRYPT_ROUNDS = 12;
const DUMMY_HASH = bcrypt.hashSync(
  "timing-equaliser-not-a-real-password",
  BCRYPT_ROUNDS,
);
const RESET = config.passwordReset;

const GENERIC_LOGIN_ERROR = "Email or password is incorrect.";
const INVALID_RESET_LINK =
  "This reset link is invalid or has expired. Please request a new one.";

async function logEvent(event, { userId = null, email = null, req } = {}) {
  try {
    await db.execute(
      "INSERT INTO auth_events (user_id, email, event, ip) VALUES (?, ?, ?, ?)",
      [userId, email, event, req?.ip?.slice(0, 64) || null],
    );
  } catch (err) {
    console.error("auth_events insert failed:", err.message);
  }
}

const USER_COLUMNS =
  "id, name, email, password_hash, email_verified, token_version, phone, city, state, created_at";
async function findUserByEmail(email, conn = db) {
  const [rows] = await conn.execute(
    `SELECT ${USER_COLUMNS} FROM users WHERE email = ?`,
    [email],
  );
  return rows[0] || null;
}
async function findUserById(id, conn = db) {
  const [rows] = await conn.execute(
    `SELECT ${USER_COLUMNS} FROM users WHERE id = ?`,
    [id],
  );
  return rows[0] || null;
}

// ---------------------------------------------------------------------------
// Providers (lets the UI enable/disable the Google & Facebook buttons honestly)
// ---------------------------------------------------------------------------
router.get("/providers", (req, res) => {
  res.json({
    google: config.google.enabled,
    facebook: config.facebook.enabled,
    password: {
      minLength: config.password.minLength,
      maxLength: config.password.maxLength,
    },
    passwordReset: {
      available: mailer.isConfigured(),
      ttlMinutes: RESET.ttlMinutes,
    },
  });
});

// ---------------------------------------------------------------------------
// Sign up (email + password). The email/SMS OTP step is disabled for this release:
// the account is created immediately and the user is signed in.
// ---------------------------------------------------------------------------
router.post("/register", limits.register, async (req, res, next) => {
  try {
    const name = String(req.body.name || "")
      .trim()
      .replace(/\s+/g, " ");
    const email = normalizeEmail(req.body.email);
    const password = req.body.password;
    if (name.length < 2 || name.length > 100)
      return res
        .status(400)
        .json({
          message: "Name must be between 2 and 100 characters.",
          field: "name",
        });
    if (!isValidEmail(email))
      return res
        .status(400)
        .json({ message: "Enter a valid email address.", field: "email" });
    const problem = passwordProblem(password);
    if (problem)
      return res.status(400).json({ message: problem, field: "password" });

    const taken = {
      message:
        'An account with this email already exists. Log in, or use "Forgot password?" to reset it.',
      field: "email",
    };
    if (await findUserByEmail(email)) {
      await logEvent("signup_existing_email", { email, req });
      return res.status(409).json(taken);
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    let userId;
    try {
      // email_verified stays 0: ownership is proven later (e.g. by using an emailed reset link).
      const [ins] = await db.execute(
        "INSERT INTO users (name, email, password_hash, email_verified, last_login_at) VALUES (?, ?, ?, 0, UTC_TIMESTAMP())",
        [name, email, passwordHash],
      );
      userId = ins.insertId;
    } catch (err) {
      if (err.code === "ER_DUP_ENTRY") return res.status(409).json(taken); // concurrent sign-up race
      throw err;
    }
    // Clean up any half-finished sign-up from the old OTP flow (table may not exist on new installs).
    db.execute("DELETE FROM pending_registrations WHERE email = ?", [
      email,
    ]).catch(() => {});

    const user = await findUserById(userId);
    setSessionCookie(res, user);
    await logEvent("signup_success", { userId: user.id, email, req });
    res
      .status(201)
      .json({
        user: publicUser(user),
        message: "Welcome to Sahayog! Your account is ready.",
      });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Login / logout / session
// ---------------------------------------------------------------------------
router.post("/login", limits.loginIp, limits.login, async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password =
      typeof req.body.password === "string" ? req.body.password : "";
    if (!isValidEmail(email) || !password)
      return res
        .status(400)
        .json({ message: "Enter your email and password." });

    const user = await findUserByEmail(email);
    // Always run bcrypt so response time doesn't reveal whether the account exists.
    const ok = await bcrypt.compare(
      password,
      user?.password_hash || DUMMY_HASH,
    );
    if (!user || !user.password_hash || !ok) {
      await logEvent("login_failed", { userId: user?.id || null, email, req });
      return res.status(401).json({ message: GENERIC_LOGIN_ERROR });
    }

    await db.execute(
      "UPDATE users SET last_login_at = UTC_TIMESTAMP() WHERE id = ?",
      [user.id],
    );
    setSessionCookie(res, user);
    await logEvent("login_success", { userId: user.id, email, req });
    res.json({ user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

router.post("/logout", async (req, res) => {
  clearSessionCookie(res);
  res.json({ message: "You have been logged out." });
});

router.get("/me", requireAuth, async (req, res, next) => {
  try {
    const user = await findUserById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found." });
    const [ids] = await db.execute(
      "SELECT provider FROM oauth_identities WHERE user_id = ?",
      [user.id],
    );
    res.json({
      user: { ...publicUser(user), providers: ids.map((r) => r.provider) },
    });
  } catch (err) {
    next(err);
  }
});

router.patch("/me", requireAuth, async (req, res, next) => {
  try {
    const clean = (v, max) =>
      String(v ?? "")
        .trim()
        .replace(/\s+/g, " ")
        .slice(0, max);
    const name = clean(req.body.name, 100);
    const phone = clean(req.body.phone, 30);
    const city = clean(req.body.city, 100);
    const state = clean(req.body.state, 100);
    if (name.length < 2)
      return res
        .status(400)
        .json({
          message: "Name must be between 2 and 100 characters.",
          field: "name",
        });
    if (phone && !/^[+0-9 ()-]{6,30}$/.test(phone))
      return res
        .status(400)
        .json({ message: "Enter a valid phone number.", field: "phone" });
    await db.execute(
      "UPDATE users SET name = ?, phone = ?, city = ?, state = ? WHERE id = ?",
      [name, phone || null, city || null, state || null, req.user.id],
    );
    const user = await findUserById(req.user.id);
    res.json({ user: publicUser(user), message: "Profile saved." });
  } catch (err) {
    next(err);
  }
});

/** Signed-in password change (profile page). Requires the current password when one exists. */
router.post(
  "/password/change",
  requireAuth,
  limits.passwordChange,
  async (req, res, next) => {
    try {
      const user = await findUserById(req.user.id);
      const current =
        typeof req.body.currentPassword === "string"
          ? req.body.currentPassword
          : "";
      const next_ = req.body.newPassword;
      if (
        user.password_hash &&
        !(await bcrypt.compare(current, user.password_hash))
      ) {
        return res
          .status(400)
          .json({
            message: "Your current password is incorrect.",
            field: "currentPassword",
          });
      }
      const problem = passwordProblem(next_);
      if (problem)
        return res.status(400).json({ message: problem, field: "newPassword" });
      const hash = await bcrypt.hash(next_, BCRYPT_ROUNDS);
      await db.execute(
        "UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?",
        [hash, user.id],
      );
      await db.execute(
        "UPDATE password_reset_tokens SET expires_at = UTC_TIMESTAMP() WHERE user_id = ? AND used_at IS NULL AND expires_at > UTC_TIMESTAMP()",
        [user.id],
      );
      const updated = await findUserById(user.id);
      setSessionCookie(res, updated); // keep this device signed in, revoke all others
      mailer
        .sendPasswordChanged(user.email)
        .catch((err) =>
          console.error("password-changed mail failed:", err.message),
        );
      await logEvent("password_changed", {
        userId: user.id,
        email: user.email,
        req,
      });
      res.json({
        message: "Password updated. Other devices have been signed out.",
        user: publicUser(updated),
      });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// Forgot password → emailed one-time link → new password
//   POST /password/forgot        { email }            → always the same generic 200 response
//   POST /password/reset/check   { token }            → 200 { valid: true } or 400
//   POST /password/reset         { token, password }  → 200, password changed, all sessions revoked
// The raw token only ever exists in the email link; the database stores an HMAC of it.
// ---------------------------------------------------------------------------

/** Creates a reset token and emails the link. Runs after the HTTP response so timing can't reveal accounts. */
async function issuePasswordReset(user, req) {
  // Per-account throttle (on top of the per-IP/email rate limiters).
  const [[stats]] = await db.execute(
    `SELECT COUNT(*) AS sent_last_hour,
            COALESCE(MIN(TIMESTAMPDIFF(SECOND, created_at, UTC_TIMESTAMP())), 999999) AS since_last
       FROM password_reset_tokens
      WHERE user_id = ? AND created_at > UTC_TIMESTAMP() - INTERVAL 1 HOUR`,
    [user.id],
  );
  if (
    Number(stats.since_last) < RESET.resendCooldownSeconds ||
    Number(stats.sent_last_hour) >= RESET.maxEmailsPerHour
  ) {
    await logEvent("reset_throttled", {
      userId: user.id,
      email: user.email,
      req,
    });
    return;
  }

  const token = randomToken(32);
  const [ins] = await withTransaction(async (conn) => {
    // Only the newest link works: expire any outstanding ones.
    await conn.execute(
      "UPDATE password_reset_tokens SET expires_at = UTC_TIMESTAMP() WHERE user_id = ? AND used_at IS NULL AND expires_at > UTC_TIMESTAMP()",
      [user.id],
    );
    return conn.execute(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, created_at, request_ip)
       VALUES (?, ?, UTC_TIMESTAMP() + INTERVAL ? MINUTE, UTC_TIMESTAMP(), ?)`,
      [
        user.id,
        hashResetToken(token),
        RESET.ttlMinutes,
        req.ip?.slice(0, 64) || null,
      ],
    );
  });

  // Token goes in the URL fragment (#), so it isn't sent to servers in requests, logs or Referer headers.
  const link = `${config.clientUrl}/reset-password#token=${token}`;
  try {
    await mailer.sendPasswordResetLink(user.email, link, RESET.ttlMinutes);
    await logEvent("reset_link_sent", {
      userId: user.id,
      email: user.email,
      req,
    });
  } catch (err) {
    console.error("[password-reset] email delivery failed:", err.message); // never log the link/token
    await db.execute("DELETE FROM password_reset_tokens WHERE id = ?", [
      ins.insertId,
    ]);
    await logEvent("reset_link_failed", {
      userId: user.id,
      email: user.email,
      req,
    });
  }
}

router.post(
  "/password/forgot",
  limits.resetRequestIp,
  limits.resetRequest,
  async (req, res, next) => {
    try {
      const email = normalizeEmail(req.body.email);
      if (!isValidEmail(email))
        return res
          .status(400)
          .json({ message: "Enter a valid email address.", field: "email" });

      if (!mailer.isConfigured()) {
        // Operator problem, identical for every email address, so it reveals nothing about accounts.
        console.error(
          "[password-reset] Request rejected: email delivery is not configured (set SMTP_HOST / SMTP_USER / SMTP_PASS / MAIL_FROM).",
        );
        return res
          .status(503)
          .json({
            message:
              "Password reset by email is temporarily unavailable. Please try again later or contact support.",
            code: "email_unavailable",
          });
      }

      const generic = {
        message: `If an account exists for ${email}, we've sent a link to reset the password. It expires in ${RESET.ttlMinutes} minutes.`,
        expiresInMinutes: RESET.ttlMinutes,
      };
      res.json(generic);

      // Everything below happens after the response, so existing and unknown emails look identical.
      setImmediate(async () => {
        try {
          // Housekeeping: drop links that expired more than a day ago.
          await db.execute(
            "DELETE FROM password_reset_tokens WHERE expires_at < UTC_TIMESTAMP() - INTERVAL 1 DAY LIMIT 500",
          );
          const user = await findUserByEmail(email);
          if (!user) {
            await logEvent("reset_unknown_email", { email, req });
            return;
          }
          await issuePasswordReset(user, req);
        } catch (err) {
          console.error("[password-reset] request failed:", err.message);
        }
      });
    } catch (err) {
      next(err);
    }
  },
);

/** Returns the token row when the token exists, is unused and not expired. */
async function findUsableResetToken(token, conn = db, lock = false) {
  const [rows] = await conn.execute(
    `SELECT id, user_id, used_at, (expires_at <= UTC_TIMESTAMP()) AS expired,
            GREATEST(TIMESTAMPDIFF(MINUTE, UTC_TIMESTAMP(), expires_at), 0) AS minutes_left
       FROM password_reset_tokens WHERE token_hash = ?${lock ? " FOR UPDATE" : ""}`,
    [hashResetToken(token)],
  );
  const row = rows[0];
  if (!row || row.used_at || Number(row.expired)) return null;
  return row;
}

router.post(
  "/password/reset/check",
  limits.resetConfirm,
  async (req, res, next) => {
    try {
      const token = req.body.token;
      if (!isResetTokenShape(token))
        return res
          .status(400)
          .json({ message: INVALID_RESET_LINK, code: "invalid_token" });
      const row = await findUsableResetToken(token);
      if (!row)
        return res
          .status(400)
          .json({ message: INVALID_RESET_LINK, code: "invalid_token" });
      res.json({ valid: true, expiresInMinutes: Number(row.minutes_left) });
    } catch (err) {
      next(err);
    }
  },
);

router.post("/password/reset", limits.resetConfirm, async (req, res, next) => {
  try {
    const token = req.body.token;
    const password = req.body.password;
    if (!isResetTokenShape(token))
      return res
        .status(400)
        .json({ message: INVALID_RESET_LINK, code: "invalid_token" });
    const problem = passwordProblem(password);
    if (problem)
      return res.status(400).json({ message: problem, field: "password" });
    // Cheap check first so an invalid link doesn't cost a bcrypt hash.
    if (!(await findUsableResetToken(token)))
      return res
        .status(400)
        .json({ message: INVALID_RESET_LINK, code: "invalid_token" });

    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const userId = await withTransaction(async (conn) => {
      const row = await findUsableResetToken(token, conn, true); // re-check under lock: single use
      if (!row) return null;
      // New password + revoke every existing session (token_version) + the link proved email ownership.
      await conn.execute(
        "UPDATE users SET password_hash = ?, email_verified = 1, token_version = token_version + 1 WHERE id = ?",
        [hash, row.user_id],
      );
      await conn.execute(
        "UPDATE password_reset_tokens SET used_at = UTC_TIMESTAMP() WHERE id = ?",
        [row.id],
      );
      await conn.execute(
        "UPDATE password_reset_tokens SET expires_at = UTC_TIMESTAMP() WHERE user_id = ? AND used_at IS NULL AND expires_at > UTC_TIMESTAMP()",
        [row.user_id],
      );
      return Number(row.user_id);
    });
    if (!userId)
      return res
        .status(400)
        .json({ message: INVALID_RESET_LINK, code: "invalid_token" });

    const user = await findUserById(userId);
    clearSessionCookie(res);
    mailer
      .sendPasswordChanged(user.email)
      .catch((err) =>
        console.error("password-changed mail failed:", err.message),
      );
    await logEvent("password_reset", { userId, email: user.email, req });
    res.json({
      message:
        "Your password has been updated. Please log in with your new password.",
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
module.exports.findUserById = findUserById;
module.exports.logEvent = logEvent;
