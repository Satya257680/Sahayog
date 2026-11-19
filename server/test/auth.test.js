// Integration tests for signup, login, session (/me), and email-link password reset.
// Requires a reachable MySQL/MariaDB. Run: npm test (from server/). See CHANGES.md for env vars.
const test = require("node:test");
const assert = require("node:assert/strict");
const { resetDatabase, startApp, client, wait } = require("./helpers");

const GOOD_PW = "Kind#2026"; // 9 chars, meets every rule
const NEW_PW = "Sahayog@Reset9";
let env;

test.before(async () => {
  const migrateOutput = await resetDatabase();
  assert.match(migrateOutput, /\+ password_reset_tokens/);
  env = await startApp();
});
test.after(async () => {
  await env?.close();
});

async function resetLinkFor(email) {
  for (let i = 0; i < 40; i++) {
    // the email is sent after the HTTP response
    const hit = [...env.outbox]
      .reverse()
      .find((m) => m.type === "reset" && m.to === email);
    if (hit) return hit;
    await wait(25);
  }
  return null;
}
const tokenOf = (link) => new URL(link).hash.replace(/^#token=/, "");

test("migration is idempotent and stores only hashed tokens", async () => {
  const { execFileSync } = require("child_process");
  const second = execFileSync(
    process.execPath,
    [require("path").join(__dirname, "..", "src", "migrate.js")],
    { env: process.env, encoding: "utf8" },
  );
  assert.doesNotMatch(second, /\+ password_reset_tokens/);
  const [cols] = await env.db.query("SHOW COLUMNS FROM password_reset_tokens");
  assert.deepEqual(
    cols.map((c) => c.Field),
    [
      "id",
      "user_id",
      "token_hash",
      "expires_at",
      "used_at",
      "created_at",
      "request_ip",
    ],
  );
});

test("GET /auth/me without a session is 401 and does not set a session hint", async () => {
  const c = client(env.base);
  const r = await c.get("/auth/me");
  assert.equal(r.status, 401);
  assert.equal(r.data.message, "Please log in to continue.");
  assert.equal(c.jar.has("sahayog_auth"), false);
});

test("GET /auth/me with only a stale hint cookie clears the hint", async () => {
  const c = client(env.base);
  c.jar.set("sahayog_auth", "1");
  const r = await c.get("/auth/me");
  assert.equal(r.status, 401);
  assert.equal(c.jar.has("sahayog_auth"), false);
});

test("providers endpoint reports the 8–30 rule and no OTP settings", async () => {
  const r = await client(env.base).get("/auth/providers");
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.password, { minLength: 8, maxLength: 30 });
  assert.equal("otp" in r.data, false);
  assert.equal(r.data.google, false);
  assert.equal(r.data.facebook, false);
});

test("signup enforces 8–30 characters on the server", async () => {
  const c = client(env.base);
  const base = { name: "Len Test", email: "len@example.com" };
  const seven = await c.post("/auth/register", {
    ...base,
    password: "Ab1!xyz",
  });
  assert.equal(seven.status, 400);
  assert.equal(seven.data.field, "password");
  assert.match(seven.data.message, /8–30/);
  const thirtyOne = await c.post("/auth/register", {
    ...base,
    password: "Ab1!" + "x".repeat(27),
  });
  assert.equal(thirtyOne.status, 400);
  assert.match(thirtyOne.data.message, /8–30/);
  const thirty = await c.post("/auth/register", {
    ...base,
    email: "len30@example.com",
    password: "Ab1!" + "x".repeat(26),
  });
  assert.equal(thirty.status, 201, JSON.stringify(thirty.data));
  const eight = await client(env.base).post("/auth/register", {
    ...base,
    email: "len8@example.com",
    password: "Ab1!wxyz",
  });
  assert.equal(eight.status, 201);
});

test("signup creates the account immediately (no OTP), signs in, and /me works", async () => {
  const c = client(env.base);
  const r = await c.post("/auth/register", {
    name: "Asha Rao",
    email: "Asha@Example.com",
    password: GOOD_PW,
  });
  assert.equal(r.status, 201);
  assert.equal(r.data.user.email, "asha@example.com");
  assert.equal(c.jar.has("sahayog_session"), true);
  assert.equal(c.jar.get("sahayog_auth"), "1");
  const me = await c.get("/auth/me");
  assert.equal(me.status, 200);
  assert.equal(me.data.user.name, "Asha Rao");
  const [[row]] = await env.db.query(
    "SELECT password_hash, email_verified FROM users WHERE email = 'asha@example.com'",
  );
  assert.notEqual(row.password_hash, GOOD_PW);
  assert.match(row.password_hash, /^\$2[aby]\$12\$/);
  assert.equal(Number(row.email_verified), 0);
});

test("signup with an existing email returns 409 without creating a duplicate", async () => {
  const r = await client(env.base).post("/auth/register", {
    name: "Someone",
    email: "asha@example.com",
    password: GOOD_PW,
  });
  assert.equal(r.status, 409);
  assert.equal(r.data.field, "email");
  const [[{ n }]] = await env.db.query(
    "SELECT COUNT(*) AS n FROM users WHERE email = 'asha@example.com'",
  );
  assert.equal(Number(n), 1);
});

test("login: valid credentials work, wrong ones get a generic 401", async () => {
  const ok = client(env.base);
  const r = await ok.post("/auth/login", {
    email: "asha@example.com",
    password: GOOD_PW,
  });
  assert.equal(r.status, 200);
  assert.equal((await ok.get("/auth/me")).status, 200);
  const bad = await client(env.base).post("/auth/login", {
    email: "asha@example.com",
    password: "Wrong#2026",
  });
  assert.equal(bad.status, 401);
  assert.equal(bad.data.message, "Email or password is incorrect.");
  const unknown = await client(env.base).post("/auth/login", {
    email: "nobody@example.com",
    password: GOOD_PW,
  });
  assert.equal(unknown.status, 401);
  assert.equal(unknown.data.message, bad.data.message);
});

test("protected routes still reject unauthenticated requests", async () => {
  const c = client(env.base);
  assert.equal((await c.get("/saved/ids")).status, 401);
  assert.equal((await c.get("/dashboard/summary")).status, 401);
  assert.equal(
    (
      await c.post("/auth/password/change", {
        currentPassword: "x",
        newPassword: NEW_PW,
      })
    ).status,
    401,
  );
});

test("logout clears both the session cookie and the hint cookie", async () => {
  const c = client(env.base);
  await c.post("/auth/login", { email: "asha@example.com", password: GOOD_PW });
  assert.equal(c.jar.has("sahayog_auth"), true);
  await c.post("/auth/logout");
  assert.equal(c.jar.has("sahayog_session"), false);
  assert.equal(c.jar.has("sahayog_auth"), false);
  assert.equal((await c.get("/auth/me")).status, 401);
});

test("forgot password: same generic response for known and unknown emails; email only for real accounts", async () => {
  const known = await client(env.base).post("/auth/password/forgot", {
    email: "asha@example.com",
  });
  const unknown = await client(env.base).post("/auth/password/forgot", {
    email: "ghost@example.com",
  });
  assert.equal(known.status, 200);
  assert.equal(unknown.status, 200);
  assert.equal(
    known.data.message.replace("asha@example.com", "X"),
    unknown.data.message.replace("ghost@example.com", "X"),
  );
  const mail = await resetLinkFor("asha@example.com");
  assert.ok(mail, "reset email was sent");
  assert.match(
    mail.link,
    /^http:\/\/localhost:5173\/reset-password#token=[A-Za-z0-9_-]{43}$/,
  );
  await wait(100);
  assert.equal(
    env.outbox.some((m) => m.to === "ghost@example.com"),
    false,
  );
  // DB holds only the hash, never the raw token.
  const token = tokenOf(mail.link);
  const [rows] = await env.db.query(
    "SELECT token_hash FROM password_reset_tokens",
  );
  assert.ok(rows.length >= 1);
  assert.ok(
    rows.every(
      (r) => r.token_hash !== token && /^[0-9a-f]{64}$/.test(r.token_hash),
    ),
  );
});

test("reset: check endpoint, 8–30 rule, success, single use, sessions revoked", async () => {
  const session = client(env.base);
  await session.post("/auth/login", {
    email: "asha@example.com",
    password: GOOD_PW,
  });
  assert.equal((await session.get("/auth/me")).status, 200);

  const mail = await resetLinkFor("asha@example.com");
  const token = tokenOf(mail.link);
  const c = client(env.base);
  const check = await c.post("/auth/password/reset/check", { token });
  assert.equal(check.status, 200);
  assert.equal(check.data.valid, true);

  const short = await c.post("/auth/password/reset", {
    token,
    password: "Ab1!xyz",
  });
  assert.equal(short.status, 400);
  assert.equal(short.data.field, "password");

  const ok = await c.post("/auth/password/reset", { token, password: NEW_PW });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.ok(
    env.outbox.some((m) => m.type === "changed" && m.to === "asha@example.com"),
  );

  const reuse = await c.post("/auth/password/reset", {
    token,
    password: "Another#Pass1",
  });
  assert.equal(reuse.status, 400);
  assert.equal(reuse.data.code, "invalid_token");
  assert.equal(
    (await c.post("/auth/password/reset/check", { token })).status,
    400,
  );

  // Old session revoked, old password rejected, new password works.
  const stale = await session.get("/auth/me");
  assert.equal(stale.status, 401);
  assert.equal(session.jar.has("sahayog_auth"), false);
  assert.equal(
    (
      await client(env.base).post("/auth/login", {
        email: "asha@example.com",
        password: GOOD_PW,
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await client(env.base).post("/auth/login", {
        email: "asha@example.com",
        password: NEW_PW,
      })
    ).status,
    200,
  );
  const [[row]] = await env.db.query(
    "SELECT email_verified FROM users WHERE email = 'asha@example.com'",
  );
  assert.equal(
    Number(row.email_verified),
    1,
    "using the emailed link proves ownership",
  );
});

test("reset: expired and malformed tokens are rejected safely", async () => {
  await client(env.base).post("/auth/register", {
    name: "Exp User",
    email: "exp@example.com",
    password: GOOD_PW,
  });
  await client(env.base).post("/auth/password/forgot", {
    email: "exp@example.com",
  });
  const mail = await resetLinkFor("exp@example.com");
  const token = tokenOf(mail.link);
  await env.db.query(
    "UPDATE password_reset_tokens t JOIN users u ON u.id = t.user_id SET t.expires_at = UTC_TIMESTAMP() - INTERVAL 1 MINUTE WHERE u.email = 'exp@example.com'",
  );
  const r = await client(env.base).post("/auth/password/reset", {
    token,
    password: NEW_PW,
  });
  assert.equal(r.status, 400);
  assert.equal(r.data.code, "invalid_token");
  for (const bad of ["", "abc", "x".repeat(43), null, 12345]) {
    const m = await client(env.base).post("/auth/password/reset", {
      token: bad,
      password: NEW_PW,
    });
    assert.equal(m.status, 400);
  }
  assert.equal(
    (
      await client(env.base).post("/auth/login", {
        email: "exp@example.com",
        password: GOOD_PW,
      })
    ).status,
    200,
  );
});

test("reset: a newer link invalidates the older one; per-account cooldown limits emails", async () => {
  await client(env.base).post("/auth/register", {
    name: "Two Links",
    email: "two@example.com",
    password: GOOD_PW,
  });
  await client(env.base).post("/auth/password/forgot", {
    email: "two@example.com",
  });
  const first = tokenOf((await resetLinkFor("two@example.com")).link);
  // Immediate second request is inside the 60s cooldown: same generic 200, but no new email.
  const again = await client(env.base).post("/auth/password/forgot", {
    email: "two@example.com",
  });
  assert.equal(again.status, 200);
  await wait(150);
  assert.equal(
    env.outbox.filter((m) => m.type === "reset" && m.to === "two@example.com")
      .length,
    1,
  );
  // Simulate the cooldown passing, then request again: the first link stops working.
  await env.db.query(
    "UPDATE password_reset_tokens t JOIN users u ON u.id = t.user_id SET t.created_at = t.created_at - INTERVAL 2 MINUTE WHERE u.email = 'two@example.com'",
  );
  await client(env.base).post("/auth/password/forgot", {
    email: "two@example.com",
  });
  await wait(150);
  const mails = env.outbox.filter(
    (m) => m.type === "reset" && m.to === "two@example.com",
  );
  assert.equal(mails.length, 2);
  assert.equal(
    (
      await client(env.base).post("/auth/password/reset/check", {
        token: first,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await client(env.base).post("/auth/password/reset/check", {
        token: tokenOf(mails[1].link),
      })
    ).status,
    200,
  );
});

test("forgot password is rate limited per IP+email", async () => {
  let last;
  for (let i = 0; i < 6; i++)
    last = await client(env.base).post("/auth/password/forgot", {
      email: "limit@example.com",
    });
  assert.equal(last.status, 429);
});

test("forgot password returns 503 (not a fake success) when email delivery is not configured", async () => {
  const original = env.mailer.isConfigured;
  env.mailer.isConfigured = () => false;
  try {
    const r = await client(env.base).post("/auth/password/forgot", {
      email: "asha@example.com",
    });
    assert.equal(r.status, 503);
    assert.equal(r.data.code, "email_unavailable");
  } finally {
    env.mailer.isConfigured = original;
  }
});

test("signed-in password change also expires outstanding reset links", async () => {
  const c = client(env.base);
  await c.post("/auth/register", {
    name: "Changer",
    email: "change@example.com",
    password: GOOD_PW,
  });
  await client(env.base).post("/auth/password/forgot", {
    email: "change@example.com",
  });
  const token = tokenOf((await resetLinkFor("change@example.com")).link);
  const r = await c.post("/auth/password/change", {
    currentPassword: GOOD_PW,
    newPassword: NEW_PW,
  });
  assert.equal(r.status, 200);
  assert.equal(
    (await c.get("/auth/me")).status,
    200,
    "this device stays signed in",
  );
  assert.equal(
    (await client(env.base).post("/auth/password/reset/check", { token }))
      .status,
    400,
  );
});
