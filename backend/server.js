require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
require('express-async-errors');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { initializeDatabase } = require('./src/config/database');
const routes = require('./src/routes');
const errorHandler = require('./src/middleware/errorHandler');
const logger = require('./src/utils/logger');
const { startReminderCron, startGmailSyncCron } = require('./src/services/cron.service');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust Nginx reverse proxy (required for rate-limit + X-Forwarded-For)
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: process.env.ALLOWED_ORIGINS?.split(',') || '*', credentials: true, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] }));
app.use(compression());
app.use(morgan('combined', { stream: { write: (msg) => logger.info(msg.trim()) } }));

// Rate limiting
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100, message: { error: 'Too many requests, please try again later.' } });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: { error: 'Too many auth attempts.' } });
app.use('/api/auth', authLimiter);
app.use('/api', limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files (encrypted uploads)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// EMR web UI + API
// Override helmet's strict CSP for the EMR static pages (internal tool with inline scripts + Bootstrap CDN)
const EMR_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
  "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
  "font-src 'self' data: https://cdn.jsdelivr.net",
  "img-src 'self' data:",
  "connect-src 'self'",
].join('; ');
app.use('/emr', (req, res, next) => { res.setHeader('Content-Security-Policy', EMR_CSP); next(); });
app.use('/emr', express.static(path.join(__dirname, 'public/emr')));

// OPD / Clinic EMR (React app) — SPA with client-side routing
app.use('/opd', express.static(path.join(__dirname, 'public/opd')));
app.get('/opd/*', (req, res) => res.sendFile(path.join(__dirname, 'public/opd/index.html')));

app.use('/api/emr', require('./src/emr/emr.routes'));

// Health check
app.get('/health', (_, res) => res.json({ status: 'healthy', timestamp: new Date().toISOString(), version: process.env.npm_package_version || '1.0.0' }));

// API Routes
app.use('/api', routes);

// ── ABDM standard bridge callbacks (called by ABDM gateway on registered base URL) ──
// ABDM appends these fixed paths to whatever base URL is registered via PATCH /v1/bridges
const abdmCtrl = require('./src/controllers/abdm.controller');
const hipCtrl  = require('./src/emr/hip.controller');

// ── HIU callbacks (gateway → our app acting as HIU) ──────────────────────────
// M2: Discover care contexts result
app.post('/v0.5/care-contexts/on-discover', abdmCtrl.onDiscover);

// M2: Link init result (linkRefNumber returned)
app.post('/v0.5/links/link/on-init', abdmCtrl.onLinkInit);

// M2: Link confirm result (care contexts confirmed)
app.post('/v0.5/links/link/on-confirm', abdmCtrl.onLinkConfirm);

// M2: Consent grant/revoke notification from CM → HIU
app.post('/v0.5/consents/hiu/notify', abdmCtrl.consentNotify);

// M3: Acknowledgment that HIP received health-info request (status only, no data yet)
app.post('/v0.5/health-information/hiu/on-request', (req, res) => {
  const { hiRequest } = req.body;
  logger.info('ABDM health-info on-request ack', { txnId: hiRequest?.transactionId, status: hiRequest?.sessionStatus });
  res.status(202).json({ status: 'accepted' });
});

// M3: Actual FHIR health data pushed from HIP → HIU
app.post('/v0.5/health-information/transfer', abdmCtrl.healthInfoPush);

// ── HIP callbacks (gateway → our EMR acting as HIP) ──────────────────────────
// v0.5 paths (ABDM gateway standard)
app.post('/v0.5/care-contexts/discover',            hipCtrl.handleDiscovery);
app.post('/v0.5/links/link/init',                   hipCtrl.handleLinkInit);
app.post('/v0.5/links/link/confirm',                hipCtrl.handleLinkConfirm);
app.post('/v0.5/health-information/hip/request',    hipCtrl.handleHealthInfoRequest);
// v3 paths (ABDM HIECM v3 — same handlers; gateway v3 on-discover callback is 404, falls back to v0.5)
app.post('/v3/hip/patient/care-context/discover',   hipCtrl.handleDiscovery);
app.post('/v3/hip/links/link/init',                 hipCtrl.handleLinkInit);
app.post('/v3/hip/links/link/confirm',              hipCtrl.handleLinkConfirm);
app.post('/v3/hip/health-information/request',      hipCtrl.handleHealthInfoRequest);

// Error handler
app.use(errorHandler);

// 404
app.use((req, res) => res.status(404).json({ error: 'Route not found' }));

async function start() {
  try {
    await initializeDatabase();
    logger.info('Database connected and initialized');
    app.listen(PORT, '0.0.0.0', () => {
      logger.info(`PHR Backend running on port ${PORT}`);
      startReminderCron();
      startGmailSyncCron();
    });
  } catch (err) {
    logger.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
module.exports = app;
