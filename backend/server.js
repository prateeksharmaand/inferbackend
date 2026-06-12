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

// Body parsing — capture rawBody for Telnyx Ed25519 signature verification
app.use((req, res, next) => {
  express.json({ limit: '10mb', verify: (r, _, buf) => { r.rawBody = buf.toString('utf8'); } })(req, res, next);
});
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files (encrypted uploads)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

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

// M2: ABDM async callback after consent-requests/init — captures real consentRequest.id
app.post('/v0.5/consent-requests/on-init', abdmCtrl.consentOnInit);

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
// v3 paths — both with and without /api prefix (ABDM calls /api/v3/... when bridge URL is registered without /api)
app.post('/v3/hip/patient/care-context/discover',        hipCtrl.handleDiscovery);
app.post('/api/v3/hip/patient/care-context/discover',    hipCtrl.handleDiscovery);
app.post('/v3/hip/links/link/init',                      hipCtrl.handleLinkInit);
app.post('/api/v3/hip/links/link/init',                  hipCtrl.handleLinkInit);
app.post('/v3/hip/links/link/confirm',                   hipCtrl.handleLinkConfirm);
app.post('/api/v3/hip/links/link/confirm',               hipCtrl.handleLinkConfirm);
app.post('/v3/hip/health-information/request',           hipCtrl.handleHealthInfoRequest);
app.post('/api/v3/hip/health-information/request',       hipCtrl.handleHealthInfoRequest);
// M1: Patient shares profile by scanning facility QR (SHARE_PATIENT_PROFILE_701)
app.post('/v3/hip/patient/share/profile',           hipCtrl.handlePatientShareProfile);
app.post('/v3/hip/patient/share',                   hipCtrl.handlePatientShareProfile);
app.post('/api/v3/hip/patient/share/profile',       hipCtrl.handlePatientShareProfile);
app.post('/api/v3/hip/patient/share',               hipCtrl.handlePatientShareProfile);

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
