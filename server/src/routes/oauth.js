// Google & Facebook sign-in (F-05). Server-side authorization-code flow:
// the browser never hands us a profile — we exchange the code with the provider ourselves,
// validate the token (audience / app id / issuer / expiry) and only then create or link the account.
const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { withTransaction } = require('../db');
const { config } = require('../config');
const { optionalAuth } = require('../middleware/auth');
const { limits } = require('../middleware/security');
const { randomToken, setSessionCookie, normalizeEmail, isValidEmail } = require('../utils/security');
const { findUserById, logEvent } = require('./auth');

const router = express.Router();
const STATE_COOKIE = 'sahayog_oauth';
const PROVIDERS = {
  google: () => config.google.enabled,
  facebook: () => config.facebook.enabled
};

function callbackUrl(provider) { return `${config.publicApiUrl}/auth/oauth/${provider}/callback`; }
function safeNext(value, fallback = '/dashboard') {
  const v = String(value || '');
  return v.startsWith('/') && !v.startsWith('//') && !v.includes('\\') && v.length < 300 ? v : fallback;
}
function clientRedirect(res, path) { return res.redirect(303, `${config.clientUrl}${path}`); }
function fail(res, code, linking) {
  return clientRedirect(res, linking ? `/dashboard/profile?oauthError=${code}` : `/login?oauthError=${code}`);
}
function stateCookieOptions() {
  return { httpOnly: true, secure: config.cookieSecure, sameSite: 'lax', signed: true, path: '/', maxAge: 10 * 60 * 1000 };
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, { ...options, signal: AbortSignal.timeout(10000) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(`Provider request failed (${res.status})`), { providerError: data });
  return data;
}

// ---------- Start ----------
router.get('/:provider', limits.oauth, optionalAuth, (req, res) => {
  const { provider } = req.params;
  const linking = req.query.link === '1';
  if (!PROVIDERS[provider]) return fail(res, 'unknown_provider', linking);
  if (!PROVIDERS[provider]()) return fail(res, 'not_configured', linking);
  if (linking && !req.user) return fail(res, 'login_required', false);

  const state = randomToken(24);
  const verifier = randomToken(48);
  res.cookie(STATE_COOKIE, JSON.stringify({
    state, provider, verifier,
    next: safeNext(req.query.next),
    linkUserId: linking ? req.user.id : null
  }), stateCookieOptions());

  if (provider === 'google') {
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    const qs = new URLSearchParams({
      client_id: config.google.clientId,
      redirect_uri: callbackUrl('google'),
      response_type: 'code',
      scope: 'openid email profile',
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      prompt: 'select_account'
    });
    return res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${qs}`);
  }
  const qs = new URLSearchParams({
    client_id: config.facebook.appId,
    redirect_uri: callbackUrl('facebook'),
    response_type: 'code',
    scope: 'email,public_profile',
    state
  });
  return res.redirect(`https://www.facebook.com/${config.facebook.graphVersion}/dialog/oauth?${qs}`);
});

// ---------- Provider-specific code exchange + validation ----------
async function googleProfile(code, verifier) {
  const tokens = await fetchJson('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: config.google.clientId,
      client_secret: config.google.clientSecret,
      redirect_uri: callbackUrl('google'),
      grant_type: 'authorization_code',
      code_verifier: verifier
    })
  });
  if (!tokens.id_token || !tokens.access_token) throw new Error('Google did not return tokens.');
  // The ID token came straight from Google's token endpoint over TLS; still check its claims.
  const claims = JSON.parse(Buffer.from(tokens.id_token.split('.')[1], 'base64url').toString('utf8'));
  if (claims.aud !== config.google.clientId) throw new Error('Google token audience mismatch.');
  if (!['accounts.google.com', 'https://accounts.google.com'].includes(claims.iss)) throw new Error('Google token issuer mismatch.');
  if (Number(claims.exp) * 1000 < Date.now()) throw new Error('Google token expired.');
  const info = await fetchJson('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` }
  });
  if (info.sub !== claims.sub) throw new Error('Google subject mismatch.');
  return {
    providerUserId: String(info.sub),
    email: normalizeEmail(info.email),
    emailVerified: info.email_verified === true || info.email_verified === 'true',
    name: String(info.name || info.given_name || '').trim()
  };
}

async function facebookProfile(code) {
  const v = config.facebook.graphVersion;
  const token = await fetchJson(`https://graph.facebook.com/${v}/oauth/access_token?${new URLSearchParams({
    client_id: config.facebook.appId,
    client_secret: config.facebook.appSecret,
    redirect_uri: callbackUrl('facebook'),
    code
  })}`);
  const accessToken = token.access_token;
  if (!accessToken) throw new Error('Facebook did not return a token.');
  // Make sure the token was issued to *our* app and is still valid.
  const debug = await fetchJson(`https://graph.facebook.com/debug_token?${new URLSearchParams({
    input_token: accessToken,
    access_token: `${config.facebook.appId}|${config.facebook.appSecret}`
  })}`);
  if (!debug.data?.is_valid || String(debug.data.app_id) !== String(config.facebook.appId)) throw new Error('Facebook token is not valid for this app.');
  const proof = crypto.createHmac('sha256', config.facebook.appSecret).update(accessToken).digest('hex');
  const me = await fetchJson(`https://graph.facebook.com/${v}/me?${new URLSearchParams({
    fields: 'id,name,email', access_token: accessToken, appsecret_proof: proof
  })}`);
  if (String(me.id) !== String(debug.data.user_id)) throw new Error('Facebook user mismatch.');
  return {
    providerUserId: String(me.id),
    email: normalizeEmail(me.email),
    // Facebook doesn't expose a verified flag, so we never auto-link an existing account by email.
    emailVerified: false,
    name: String(me.name || '').trim()
  };
}

// ---------- Callback ----------
router.get('/:provider/callback', limits.oauth, async (req, res) => {
  const { provider } = req.params;
  let saved = null;
  try { saved = JSON.parse(req.signedCookies?.[STATE_COOKIE] || 'null'); } catch { saved = null; }
  res.clearCookie(STATE_COOKIE, { ...stateCookieOptions(), maxAge: undefined });
  const linking = Boolean(saved?.linkUserId);

  if (!PROVIDERS[provider] || !PROVIDERS[provider]()) return fail(res, 'not_configured', linking);
  if (req.query.error) return fail(res, 'cancelled', linking);
  const state = String(req.query.state || '');
  if (!saved || saved.provider !== provider || !state || state.length !== saved.state.length ||
      !crypto.timingSafeEqual(Buffer.from(state), Buffer.from(saved.state))) {
    return fail(res, 'invalid_state', linking);
  }
  const code = String(req.query.code || '');
  if (!code) return fail(res, 'cancelled', linking);

  let profile;
  try {
    profile = provider === 'google' ? await googleProfile(code, saved.verifier) : await facebookProfile(code);
  } catch (err) {
    console.error(`[oauth:${provider}]`, err.message);
    return fail(res, 'provider_error', linking);
  }

  try {
    const result = await withTransaction(async conn => {
      const [identity] = await conn.execute('SELECT user_id FROM oauth_identities WHERE provider = ? AND provider_user_id = ? FOR UPDATE', [provider, profile.providerUserId]);

      // Linking from the profile page: the user is already logged in, which is the proof of ownership.
      if (linking) {
        if (identity[0]) return Number(identity[0].user_id) === Number(saved.linkUserId) ? { userId: saved.linkUserId, linked: true } : { error: 'identity_in_use' };
        await conn.execute('INSERT INTO oauth_identities (user_id, provider, provider_user_id, email) VALUES (?, ?, ?, ?)', [saved.linkUserId, provider, profile.providerUserId, profile.email || null]);
        return { userId: saved.linkUserId, linked: true };
      }

      if (identity[0]) return { userId: Number(identity[0].user_id) };
      if (!profile.email || !isValidEmail(profile.email)) return { error: 'email_required' };

      const [existing] = await conn.execute('SELECT id FROM users WHERE email = ? FOR UPDATE', [profile.email]);
      if (existing[0]) {
        // Only auto-link when the provider has verified the email address.
        if (!profile.emailVerified) return { error: 'account_exists' };
        await conn.execute('INSERT INTO oauth_identities (user_id, provider, provider_user_id, email) VALUES (?, ?, ?, ?)', [existing[0].id, provider, profile.providerUserId, profile.email]);
        await conn.execute('UPDATE users SET email_verified = 1 WHERE id = ?', [existing[0].id]);
        return { userId: Number(existing[0].id) };
      }

      const name = (profile.name || profile.email.split('@')[0]).slice(0, 100);
      const [ins] = await conn.execute('INSERT INTO users (name, email, password_hash, email_verified) VALUES (?, ?, NULL, 1)', [name.length >= 2 ? name : 'Sahayog member', profile.email]);
      await conn.execute('INSERT INTO oauth_identities (user_id, provider, provider_user_id, email) VALUES (?, ?, ?, ?)', [ins.insertId, provider, profile.providerUserId, profile.email]);
      return { userId: ins.insertId, created: true };
    });

    if (result.error) return fail(res, result.error, linking);
    const user = await findUserById(result.userId);
    if (!user) return fail(res, 'provider_error', linking);
    await db.execute('UPDATE users SET last_login_at = UTC_TIMESTAMP() WHERE id = ?', [user.id]);
    setSessionCookie(res, user);
    await logEvent(result.linked ? `oauth_linked_${provider}` : `oauth_login_${provider}`, { userId: user.id, email: user.email, req });
    return clientRedirect(res, result.linked ? `/dashboard/profile?linked=${provider}` : `/auth/callback?next=${encodeURIComponent(saved.next)}`);
  } catch (err) {
    console.error(`[oauth:${provider}] account error`, err.message);
    return fail(res, 'provider_error', linking);
  }
});

module.exports = router;
