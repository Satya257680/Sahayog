const rateLimit = require('express-rate-limit');
const { config } = require('../config');

/**
 * CSRF protection for cookie sessions:
 *  1. Session cookie is SameSite=Lax (not sent on cross-site POST/PATCH/DELETE).
 *  2. Every state-changing request must carry the custom header `X-Requested-With: sahayog`.
 *     Browsers cannot add custom headers cross-origin without a CORS preflight, and the
 *     preflight is only approved for origins in the allow-list.
 *  3. If an Origin header is present it must be in the allow-list.
 */
const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);
function csrfGuard(req, res, next) {
  if (SAFE.has(req.method)) return next();
  if (req.get('x-requested-with') !== 'sahayog') {
    return res.status(403).json({ message: 'Request blocked. Please refresh the page and try again.' });
  }
  const origin = req.get('origin');
  if (origin && !config.allowedOrigins.includes(origin.replace(/\/+$/, ''))) {
    return res.status(403).json({ message: 'Request origin is not allowed.' });
  }
  next();
}

function limiter(windowMinutes, limit, message, keyByEmail = false) {
  return rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message },
    keyGenerator: keyByEmail
      ? req => `${rateLimit.ipKeyGenerator ? rateLimit.ipKeyGenerator(req.ip) : req.ip}|${String(req.body?.email || '').trim().toLowerCase()}`
      : undefined
  });
}

const limits = {
  login: limiter(15, 10, 'Too many login attempts. Please wait 15 minutes and try again.', true),
  loginIp: limiter(15, 50, 'Too many login attempts from this network. Please wait and try again.'),
  sendOtp: limiter(15, 8, 'Too many code requests. Please wait a few minutes and try again.'),
  verifyOtp: limiter(15, 30, 'Too many verification attempts. Please wait a few minutes and try again.'),
  oauth: limiter(15, 40, 'Too many sign-in attempts. Please wait and try again.')
};

module.exports = { csrfGuard, limits };
