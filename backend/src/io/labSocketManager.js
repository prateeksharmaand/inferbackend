/**
 * Laboratory WebSocket Manager
 * Real-time result visibility and critical value alerts
 */

const socketIO = require('socket.io');
const jwt = require('jsonwebtoken');
const { query } = require('../config/database');
const db = { query };

class LabSocketManager {
  constructor(server) {
    this.io = socketIO(server, {
      cors: {
        origin: process.env.WEB_FRONTEND_URL || 'http://localhost:3000',
        methods: ['GET', 'POST'],
        credentials: true
      },
      transports: ['websocket', 'polling']
    });

    this.setupMiddleware();
    this.setupEventHandlers();
  }

  /**
   * WebSocket authentication middleware
   */
  setupMiddleware() {
    this.io.use((socket, next) => {
      try {
        const token = socket.handshake.auth.token;

        if (!token) {
          return next(new Error('No authentication token'));
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        socket.user = decoded;
        socket.userId = decoded.id;

        next();
      } catch (error) {
        console.error('Socket auth error:', error.message);
        next(new Error('Authentication failed'));
      }
    });
  }

  /**
   * Setup event handlers
   */
  setupEventHandlers() {
    this.io.on('connection', (socket) => {
      console.log(`✅ User ${socket.userId} connected`);

      // Doctor watches patient's results
      socket.on('watch_patient_results', (patientId) => {
        console.log(`Doctor ${socket.userId} watching patient ${patientId}`);
        socket.join(`patient:${patientId}`);

        socket.emit('watching_patient', {
          patient_id: patientId,
          message: `Now watching results for patient ${patientId}`
        });
      });

      // Stop watching patient
      socket.on('unwatch_patient_results', (patientId) => {
        socket.leave(`patient:${patientId}`);
        console.log(`Doctor ${socket.userId} stopped watching patient ${patientId}`);
      });

      // Watch critical values (for on-call)
      socket.on('watch_critical_values', () => {
        console.log(`Doctor ${socket.userId} watching critical values`);
        socket.join('critical_values');

        socket.emit('watching_critical', {
          message: 'Now watching critical values globally'
        });
      });

      // Acknowledge notification
      socket.on('acknowledge_alert', (data) => {
        const { result_id, acknowledged_by } = data;
        console.log(`Alert ${result_id} acknowledged by ${acknowledged_by}`);

        // Broadcast to other doctors
        socket.broadcast.emit('alert_acknowledged', {
          result_id,
          acknowledged_by,
          timestamp: new Date()
        });
      });

      // Get online status
      socket.on('get_status', (callback) => {
        callback({
          connected: true,
          user_id: socket.userId,
          server_time: new Date()
        });
      });

      socket.on('disconnect', () => {
        console.log(`❌ User ${socket.userId} disconnected`);
      });

      socket.on('error', (error) => {
        console.error(`Socket error for ${socket.userId}:`, error);
      });
    });
  }

  /**
   * Notify result is visible to doctor
   */
  notifyResultVisible(patientId, result) {
    this.io.to(`patient:${patientId}`).emit('result_visible', {
      type: 'RESULT_VISIBLE',
      result_id: result.id,
      test_name: result.test_name,
      result_value: result.result_value,
      result_unit: result.result_unit,
      visible_at: new Date(),
      is_critical: result.is_critical_value,
      message: `New lab result: ${result.test_name}`
    });
  }

  /**
   * Notify critical value
   */
  notifyCriticalValue(patientId, result, urgency = 'HIGH') {
    // Send to doctors watching this patient
    this.io.to(`patient:${patientId}`).emit('critical_value', {
      type: 'CRITICAL_VALUE',
      result_id: result.id,
      test_name: result.test_name,
      result_value: result.result_value,
      result_unit: result.result_unit,
      reference_range: `${result.reference_range_low}-${result.reference_range_high}`,
      urgency,
      requires_action: true,
      timestamp: new Date(),
      message: `🚨 CRITICAL: ${result.test_name} = ${result.result_value}`
    });

    // Also broadcast to critical values watchers
    this.io.to('critical_values').emit('critical_value_alert', {
      type: 'CRITICAL_VALUE',
      result_id: result.id,
      patient_id: patientId,
      test_name: result.test_name,
      result_value: result.result_value,
      timestamp: new Date()
    });
  }

  /**
   * Notify anomaly detected
   */
  notifyAnomaly(patientId, anomaly, result) {
    this.io.to(`patient:${patientId}`).emit('anomaly_detected', {
      type: 'ANOMALY',
      anomaly_id: anomaly.id,
      result_id: result.id,
      test_name: result.test_name,
      anomaly_type: anomaly.anomaly_type,
      severity: anomaly.severity,
      clinical_context: anomaly.clinical_context,
      recommended_action: anomaly.recommended_action,
      timestamp: new Date(),
      message: `⚠️ ${anomaly.severity} ANOMALY: ${anomaly.clinical_context}`
    });
  }

  /**
   * Notify multiple results processed
   */
  notifyBatchResults(patientId, count, criticalCount) {
    this.io.to(`patient:${patientId}`).emit('batch_results', {
      type: 'BATCH_RESULTS',
      results_count: count,
      critical_count: criticalCount,
      timestamp: new Date(),
      message: `${count} new lab result(s) available (${criticalCount} critical)`
    });
  }

  /**
   * Broadcast system message
   */
  broadcastMessage(message, level = 'INFO') {
    this.io.emit('system_message', {
      type: 'SYSTEM',
      level, // 'INFO', 'WARNING', 'ERROR'
      message,
      timestamp: new Date()
    });
  }

  /**
   * Get online doctors for a patient
   */
  getOnlineDoctorsForPatient(patientId) {
    const room = this.io.sockets.adapter.rooms.get(`patient:${patientId}`);
    return room ? room.size : 0;
  }

  /**
   * Send private message to specific doctor (by user_id)
   */
  notifyDoctor(userId, data) {
    const userSockets = this.io.sockets.sockets;
    let found = false;

    userSockets.forEach((socket) => {
      if (socket.userId === userId) {
        socket.emit('notification', {
          type: data.type,
          message: data.message,
          ...data,
          timestamp: new Date()
        });
        found = true;
      }
    });

    return found;
  }

  /**
   * Notify order/sample status change (used by workflowService)
   */
  notifyOrderStatusChange(patientId, data) {
    this.io.to(`patient:${patientId}`).emit('order_status_change', {
      ...data,
      timestamp: new Date()
    });
  }

  /**
   * Static factory: initialize a singleton LabSocketManager on an HTTP server.
   * Call from server.js after creating the http server:
   *   const labSocketManager = LabSocketManager.initialize(server);
   *   workflowService.setSocketManager(labSocketManager);
   */
  static initialize(server) {
    if (!LabSocketManager._instance) {
      LabSocketManager._instance = new LabSocketManager(server);
    }
    return LabSocketManager._instance;
  }

  /**
   * Get the existing singleton instance (if initialized)
   */
  static getInstance() {
    return LabSocketManager._instance || null;
  }
}

LabSocketManager._instance = null;

module.exports = LabSocketManager;
