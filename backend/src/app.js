require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');

const errorHandler = require('./middleware/errorHandler');
const logger = require('./config/logger');

const app = express();

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      'connect-src':  ["'self'", 'https://api.inferapp.online', 'https://clinicaltables.nlm.nih.gov', 'https://cdn.jsdelivr.net'],
      'script-src':   ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
      'style-src':    ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
      'font-src':     ["'self'", 'https://cdn.jsdelivr.net'],
    },
  },
}));
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Rate limiting
app.use(rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
  standardHeaders: true,
  legacyHeaders: false,
}));

app.use(compression());
app.use(morgan('combined', { stream: { write: msg => logger.info(msg.trim()) } }));
app.use(express.json({
  limit: '10mb',
  verify: (req, _res, buf) => { req.rawBody = buf.toString(); },
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve uploaded files (protected in production by auth middleware)
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// API routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/profiles', require('./routes/profiles'));
app.use('/api/vitals', require('./routes/vitals'));
app.use('/api/documents', require('./routes/documents'));
app.use('/api/medicines', require('./routes/medicines'));
app.use('/api/healthbot', require('./routes/healthbot'));
app.use('/api/timeline', require('./routes/timeline'));
app.use('/api/notifications', require('./routes/notifications'));

// Lab management v1 API (orders, samples, reports, analytics, catalog, uploads)
const v1Routes = require('./routes/v1.routes');
app.use('/api/v1', v1Routes);

// Super Admin Portal API
app.use('/api/admin', require('./emr/admin.routes'));

// Sales agent — Meta WhatsApp webhook + internal inbox API (public — no auth)
app.use('/webhook/meta/whatsapp', require('./sales/sales.wa.routes'));
app.use('/api/sales/wa',          require('./sales/sales.wa.routes'));

// Email open tracking (public — no auth)
const track = require('./emr/emr.track.controller');
app.get('/api/track/open',          track.trackOpen);
app.get('/api/track/opened-leads',  track.getOpenedLeads);
app.get('/api/track/leads',         track.getLeads);
app.post('/api/track/register',     track.registerLead);

// 404 handler
app.use((req, res) => res.status(404).json({ error: 'Route not found' }));

// Error handler
app.use(errorHandler);

// LabSocketManager initialization
// Call this from server.js after creating the HTTP server:
//   const LabSocketManager = require('./src/io/labSocketManager');
//   const labSocketManager = new LabSocketManager(server);
//   -- or use the static initialize helper:
//   LabSocketManager.initialize(server);
// The workflowService can then be wired up:
//   const workflowService = require('./src/services/laboratory/workflowService');
//   workflowService.setSocketManager(labSocketManager);

module.exports = app;
