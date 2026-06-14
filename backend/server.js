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
const http = require('http');
const { startReminderCron, startGmailSyncCron } = require('./src/services/cron.service');
const LabSocketManager = require('./src/io/labSocketManager');
const workflowService = require('./src/services/laboratory/workflowService');
const inboundWebhook = require('./src/emr/inbound/inbound.webhook.controller');
const waWebhook      = require('./src/emr/inbound/whatsapp.webhook.controller');
const { sendPendingReminders } = require('./src/emr/inbound/booking.orchestrator');

// ── Startup environment validation (fail fast before any DB connections) ──────
const REQUIRED_ENV = [
  'JWT_SECRET', 'ENCRYPTION_KEY', 'DB_PASSWORD',
  'ABDM_CLIENT_ID', 'ABDM_CLIENT_SECRET',
];
for (const k of REQUIRED_ENV) {
  if (!process.env[k]) {
    console.error(`FATAL: Required environment variable ${k} is not set. Refusing to start.`);
    process.exit(1);
  }
}
if ((process.env.JWT_SECRET ?? '').length < 32) {
  console.error('FATAL: JWT_SECRET must be at least 32 characters. Refusing to start.');
  process.exit(1);
}
if (Buffer.from(process.env.ENCRYPTION_KEY ?? '', 'utf8').length < 32) {
  console.error('FATAL: ENCRYPTION_KEY must be at least 32 UTF-8 bytes. Refusing to start.');
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3000;

// R3-014: trust only the specific proxy CIDR, not blindly "1 hop"
app.set('trust proxy', process.env.TRUST_PROXY_CIDR || '127.0.0.1');

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      'connect-src': ["'self'", 'https://api.inferapp.online', 'https://clinicaltables.nlm.nih.gov', 'https://cdn.jsdelivr.net', 'wss://api.inferapp.online'],
      'script-src':  ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
      'style-src':   ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
      'font-src':    ["'self'", 'https://cdn.jsdelivr.net'],
    },
  },
}));
// R2-009: CORS — use allowlist when set, fall back to * with a warning when not
const _allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '').split(',').map(o => o.trim()).filter(Boolean);
if (_allowedOrigins.length === 0) {
  console.warn('WARNING: ALLOWED_ORIGINS is not set — CORS is open to all origins. Set ALLOWED_ORIGINS in production.');
}
app.use(cors({
  origin: _allowedOrigins.length > 0
    ? (origin, cb) => {
        if (!origin || _allowedOrigins.includes(origin)) cb(null, true);
        else cb(new Error(`CORS: origin ${origin} not allowed`));
      }
    : true,  // allow all origins when env var not configured
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
}));
app.use(compression());
// R2-016: custom Morgan token that redacts sensitive query params (ABHA, tokens, OTPs)
morgan.token('safe-url', (req) => {
  try {
    const u = new URL(req.url, 'http://x');
    ['abha','abhaNumber','aadhaar','token','xToken','otp','mobile'].forEach(p => {
      if (u.searchParams.has(p)) u.searchParams.set(p, '[REDACTED]');
    });
    return u.pathname + u.search;
  } catch { return req.url; }
});
app.use(morgan(':method :safe-url :status :res[content-length] - :response-time ms',
  { stream: { write: (msg) => logger.info(msg.trim()) } }));

// Rate limiting
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100, message: { error: 'Too many requests, please try again later.' } });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: { error: 'Too many auth attempts.' } });
app.use('/api/auth', authLimiter);
app.use('/api', limiter);

// Body parsing — capture rawBody for Telnyx Ed25519 signature verification
app.use((req, res, next) => {
  express.json({ limit: '10mb', verify: (r, _, buf) => { r.rawBody = buf.toString('utf8'); } })(req, res, next);
});
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// R2-006: uploads are medical documents — served via authenticated endpoint in emr.routes.js only.
// NEVER serve /uploads as unauthenticated static files.

// R3-017: request correlation ID — every request gets a traceable ID
const { randomUUID: _ruuid } = require('crypto');
app.use((req, res, next) => {
  const reqId = req.headers['x-request-id'] || req.headers['request-id'] || _ruuid();
  req.requestId = reqId;
  res.setHeader('X-Request-ID', reqId);
  next();
});

// EMR API routes (static UI served by nginx at emr.inferapp.online)
app.use('/api/emr', require('./src/emr/emr.routes'));

// Super Admin Portal API
app.use('/api/admin', require('./src/emr/admin.routes'));

// V1 API routes (OPD portal)
app.use('/api/v1', require('./src/routes/v1.routes'));

// Email open tracking (public — no auth)
const track = require('./src/emr/emr.track.controller');
app.get('/api/track/open',         track.trackOpen);
app.get('/api/track/opened-leads', track.getOpenedLeads);
app.post('/api/track/register',    track.registerLead);

// Health check — R3-012: no version disclosure
app.get('/health', (_, res) => res.json({ status: 'healthy', timestamp: new Date().toISOString() }));

// API Routes
app.use('/api', routes);

// ── ABDM standard bridge callbacks (called by ABDM gateway on registered base URL) ──
// ABDM appends these fixed paths to whatever base URL is registered via PATCH /v1/bridges
const abdmCtrl = require('./src/controllers/abdm.controller');
const hipCtrl  = require('./src/emr/hip.controller');
const { verifyAbdmCallback } = require('./src/emr/abdm.callback.auth');

// ── HIU callbacks (gateway → our app acting as HIU) ──────────────────────────
// M2: Discover care contexts result
app.post('/v0.5/care-contexts/on-discover', verifyAbdmCallback, abdmCtrl.onDiscover);

// M2: Link init result (linkRefNumber returned)
app.post('/v0.5/links/link/on-init', verifyAbdmCallback, abdmCtrl.onLinkInit);

// M2: Link confirm result (care contexts confirmed)
app.post('/v0.5/links/link/on-confirm', verifyAbdmCallback, abdmCtrl.onLinkConfirm);

// M2: ABDM async callback after consent-requests/init — captures real consentRequest.id
app.post('/v0.5/consent-requests/on-init', verifyAbdmCallback, abdmCtrl.consentOnInit);

// M2: Consent grant/revoke notification from CM → HIU
app.post('/v0.5/consents/hiu/notify', verifyAbdmCallback, abdmCtrl.consentNotify);

// M3: Consent callbacks CM → HIU (v3 paths — both with and without /api prefix)
app.post('/api/v3/hiu/consent/request/on-init', verifyAbdmCallback, abdmCtrl.consentOnInit);
app.post('/v3/hiu/consent/request/on-init',     verifyAbdmCallback, abdmCtrl.consentOnInit);
app.post('/api/v3/hiu/consent/request/notify',  verifyAbdmCallback, abdmCtrl.consentNotify);
app.post('/v3/hiu/consent/request/notify',      verifyAbdmCallback, abdmCtrl.consentNotify);

// M3: Health-info request acknowledgement CM → HIU
app.post('/api/v3/hiu/health-information/on-request', verifyAbdmCallback, (req, res) => {
  const { hiRequest } = req.body;
  logger.info('HIU health-info on-request ack', { transactionId: hiRequest?.transactionId, status: hiRequest?.sessionStatus });
  res.status(202).json({ status: 'accepted' });
});
app.post('/v3/hiu/health-information/on-request', verifyAbdmCallback, (req, res) => {
  const { hiRequest } = req.body;
  logger.info('HIU health-info on-request ack', { transactionId: hiRequest?.transactionId, status: hiRequest?.sessionStatus });
  res.status(202).json({ status: 'accepted' });
});

// M3: Consent artifact notification from CM → HIP (after patient approves)
app.post('/v0.5/consents/hip/notify',               verifyAbdmCallback, hipCtrl.handleConsentNotify);
app.post('/api/v3/hip/consent/request/notify',      verifyAbdmCallback, hipCtrl.handleConsentNotify);
app.post('/v3/hip/consent/request/notify',          verifyAbdmCallback, hipCtrl.handleConsentNotify);
app.post('/api/v3/consent/request/hip/notify',      verifyAbdmCallback, hipCtrl.handleConsentNotify);
app.post('/v3/consent/request/hip/notify',          verifyAbdmCallback, hipCtrl.handleConsentNotify);

// M3: Acknowledgment that HIP received health-info request
app.post('/v0.5/health-information/hiu/on-request', verifyAbdmCallback, (req, res) => {
  const { hiRequest } = req.body;
  logger.info('ABDM health-info on-request ack', { txnId: hiRequest?.transactionId, status: hiRequest?.sessionStatus });
  res.status(202).json({ status: 'accepted' });
});

// M3: Actual FHIR health data pushed from HIP → HIU
app.post('/v0.5/health-information/transfer', verifyAbdmCallback, abdmCtrl.healthInfoPush);

// ── HIP callbacks (gateway → our EMR acting as HIP) ──────────────────────────
// v0.5 paths (ABDM gateway standard)
app.post('/v0.5/care-contexts/discover',            verifyAbdmCallback, hipCtrl.handleDiscovery);
app.post('/v0.5/links/link/init',                   verifyAbdmCallback, hipCtrl.handleLinkInit);
app.post('/v0.5/links/link/confirm',                verifyAbdmCallback, hipCtrl.handleLinkConfirm);
app.post('/v0.5/health-information/hip/request',    verifyAbdmCallback, hipCtrl.handleHealthInfoRequest);
// v3 paths — both with and without /api prefix
app.post('/v3/hip/patient/care-context/discover',        verifyAbdmCallback, hipCtrl.handleDiscovery);
app.post('/api/v3/hip/patient/care-context/discover',    verifyAbdmCallback, hipCtrl.handleDiscovery);
app.post('/v3/hip/links/link/init',                      verifyAbdmCallback, hipCtrl.handleLinkInit);
app.post('/api/v3/hip/links/link/init',                  verifyAbdmCallback, hipCtrl.handleLinkInit);
app.post('/v3/hip/link/care-context/init',               verifyAbdmCallback, hipCtrl.handleLinkInit);
app.post('/api/v3/hip/link/care-context/init',           verifyAbdmCallback, hipCtrl.handleLinkInit);
app.post('/v3/hip/links/link/confirm',                   verifyAbdmCallback, hipCtrl.handleLinkConfirm);
app.post('/api/v3/hip/links/link/confirm',               verifyAbdmCallback, hipCtrl.handleLinkConfirm);
app.post('/v3/hip/link/care-context/confirm',            verifyAbdmCallback, hipCtrl.handleLinkConfirm);
app.post('/api/v3/hip/link/care-context/confirm',        verifyAbdmCallback, hipCtrl.handleLinkConfirm);
app.post('/v3/hip/health-information/request',           verifyAbdmCallback, hipCtrl.handleHealthInfoRequest);
app.post('/api/v3/hip/health-information/request',       verifyAbdmCallback, hipCtrl.handleHealthInfoRequest);
// M1: Patient shares profile by scanning facility QR
app.post('/v3/hip/patient/share/profile',           verifyAbdmCallback, hipCtrl.handlePatientShareProfile);
app.post('/v3/hip/patient/share',                   verifyAbdmCallback, hipCtrl.handlePatientShareProfile);
app.post('/api/v3/hip/patient/share/profile',       verifyAbdmCallback, hipCtrl.handlePatientShareProfile);
app.post('/api/v3/hip/patient/share',               verifyAbdmCallback, hipCtrl.handlePatientShareProfile);

// M1: ABDM queries HIP to verify token shown to patient
app.post('/v3/hip/patient/running-token/status',     verifyAbdmCallback, hipCtrl.handleRunningTokenStatus);
app.post('/api/v3/hip/patient/running-token/status', verifyAbdmCallback, hipCtrl.handleRunningTokenStatus);

// ── Meta WhatsApp Cloud API webhook (registered in Facebook Developer Console) ──
// GET  = hub challenge verification  POST = inbound messages + status updates
app.get ('/webhook/whatsapp', waWebhook.verify);
app.post('/webhook/whatsapp', waWebhook.handle);

// ── Exotel inbound webhooks — SMS + IVR (India) ────────────────────────────
// Exotel signs each request with HMAC-SHA1 in X-Exotel-Signature header.
app.post('/webhook/exotel/sms',      inboundWebhook.handleSmsWebhook);
app.post('/webhook/exotel/status',   inboundWebhook.handleStatusWebhook);
app.post('/webhook/exotel/voice',    inboundWebhook.handleVoiceWebhook);
app.post('/webhook/exotel/gather',   inboundWebhook.handleVoiceGather);

// Error handler
app.use(errorHandler);

// 404
app.use((req, res) => res.status(404).json({ error: 'Route not found' }));

async function start() {
  try {
    await initializeDatabase();
    logger.info('Database connected and initialized');
    // Seed superadmin from env vars (no-op if already exists)
    const { seedSuperadmin } = require('./src/emr/admin.auth.controller');
    await seedSuperadmin();
    const server = http.createServer(app);
    const labSocket = LabSocketManager.initialize(server);
    workflowService.setSocketManager(labSocket);
    server.listen(PORT, '0.0.0.0', () => {
      logger.info(`PHR Backend running on port ${PORT}`);
      // updateHipServices removed — was calling addUpdateServices on every deploy
      logger.info('Lab WebSocket manager initialized');
      startReminderCron();
      startGmailSyncCron();
      // Inbound appointment reminders — check every 5 minutes
      const cron = require('node-cron');
      cron.schedule('*/5 * * * *', () => sendPendingReminders().catch(() => {}));
      logger.info('Inbound appointment reminder cron started');
    });
  } catch (err) {
    logger.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
module.exports = app;
