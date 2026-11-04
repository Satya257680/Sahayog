const { config, validateConfig } = require('./config');
validateConfig(); // F-09: refuse to start with a missing/weak JWT secret

const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const db = require('./db');
const { csrfGuard } = require('./middleware/security');

const app = express();
app.disable('x-powered-by');
if (config.trustProxy) app.set('trust proxy', config.trustProxy);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      'img-src': ["'self'", 'data:', 'https:'],       // listing photos are external https URLs
      'connect-src': ["'self'"],
      'form-action': ["'self'"]
    }
  }
}));
// F-14: explicit allow-list of origins; credentials (cookies) are never combined with "*".
app.use(cors({
  origin(origin, callback) {
    if (!origin || config.allowedOrigins.includes(origin.replace(/\/+$/, ''))) return callback(null, true);
    return callback(null, false);
  },
  credentials: true,
  allowedHeaders: ['Content-Type', 'X-Requested-With'],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
}));
app.use(cookieParser(config.jwtSecret));
app.use(express.json({ limit: '1mb' }));
app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, limit: 600, standardHeaders: true, legacyHeaders: false, message: { message: 'Too many requests. Please slow down.' } }));
app.use('/api', csrfGuard);
app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

let shuttingDown = false;
app.get('/api/health', async (req, res) => {
  if (shuttingDown) return res.status(503).json({ status: 'shutting_down' });
  try {
    await db.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected', app: 'Sahayog API' });
  } catch {
    res.status(503).json({ status: 'error', database: 'disconnected', message: 'Check MySQL configuration.' });
  }
});

app.use('/api/auth/oauth', require('./routes/oauth'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/listings', require('./routes/listings'));
app.use('/api/saved', require('./routes/saved'));
app.use('/api/conversations', require('./routes/conversations'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api', (req, res) => res.status(404).json({ message: 'API route not found.' }));

// Optional: serve the built React app from the same origin (SERVE_CLIENT=true after `npm run build`).
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
if (config.serveClient && fs.existsSync(clientDist)) {
  app.use(express.static(clientDist, { index: false, maxAge: '1h' }));
  app.get('*', (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ message: 'Invalid JSON body.' });
  if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'This record already exists.' });
  if (err.expose && err.status) return res.status(err.status).json({ message: err.message });
  console.error(err);
  res.status(500).json({ message: 'Unexpected server error.' });
});

// F-15: verify the database before accepting traffic and shut down cleanly.
async function start() {
  try {
    await db.query('SELECT 1 FROM users LIMIT 1');
  } catch (err) {
    const hint = err.code === 'ER_NO_SUCH_TABLE' || err.code === 'ER_BAD_DB_ERROR' ? ' Run "npm run migrate" first.' : '';
    console.error(`[startup] Cannot use the database: ${err.message}.${hint}`);
    process.exit(1);
  }
  const server = app.listen(config.port, () => {
    console.log(`Sahayog API listening on http://localhost:${config.port}`);
    console.log(`Allowed origins: ${config.allowedOrigins.join(', ')}`);
    console.log(`Google sign-in: ${config.google.enabled ? 'on' : 'off'} · Facebook sign-in: ${config.facebook.enabled ? 'on' : 'off'} · Email: ${config.mail.configured ? 'SMTP' : config.mail.devConsole ? 'dev console' : 'NOT CONFIGURED'}`);
  });

  const shutdown = signal => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`${signal} received — closing server…`);
    const force = setTimeout(() => process.exit(1), 10000);
    force.unref();
    server.close(async () => {
      try { await db.end(); } catch { /* ignore */ }
      console.log('Shutdown complete.');
      process.exit(0);
    });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start();
