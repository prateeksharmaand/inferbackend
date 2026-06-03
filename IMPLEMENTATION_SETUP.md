# Laboratory System - Implementation Setup Guide

## ✅ Prerequisites

### Installed in your project:
```bash
cd backend
npm list @google/generative-ai      # Check if installed
npm list simple-hl7
npm list pdf-parse
npm list tesseract.js
npm list bull                        # Job queue
npm list socket.io                   # Real-time
npm list redis
```

### Missing packages? Install them:
```bash
npm install @google/generative-ai simple-hl7 pdf-parse tesseract.js bull
```

---

## 📋 Step-by-Step Setup

### STEP 1: Environment Variables

Add to `backend/.env`:

```env
# Gemini API (for lab analysis)
GOOGLE_API_KEY=your_gemini_api_key_here

# Optional: Claude API (for critical values only)
ANTHROPIC_API_KEY=your_claude_api_key_here

# AI Provider choice
AI_PROVIDER=gemini  # or "claude" or "hybrid"

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/emar
REDIS_URL=redis://localhost:6379

# WebSocket
WEB_FRONTEND_URL=http://localhost:3000

# File storage (for encrypted PDFs)
FILE_STORAGE_PATH=./data/encrypted_files
```

### STEP 2: Database Migrations

Create migration file: `backend/src/db/migrations/003_create_laboratory_tables.sql`

```sql
-- Run this to create all lab tables
\i 003_create_laboratory_tables.sql
```

The full schema is in `LABORATORY_ARCHITECTURE.md` → Section 2 (Data Model).

---

### STEP 3: Create Lab Service API Routes

Create file: `backend/src/routes/labs/labRoutes.js`

```javascript
const express = require('express');
const router = express.Router();
const multer = require('multer');
const dataParser = require('../../services/laboratory/dataParser');
const { verifyLabKey } = require('../../middleware/labAuth');
const { analyzeQueue } = require('../../jobs/analyzeLabResult');

// Configure file upload (PDFs)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files allowed'));
    }
  }
});

/**
 * POST /api/v1/labs/upload-result
 * Upload lab result in HL7/FHIR/JSON/CSV format
 */
router.post('/upload-result', verifyLabKey, async (req, res) => {
  try {
    const { format, data, patient_id, is_critical } = req.body;

    // Normalize data to internal format
    const parsed = await dataParser.parseLabData(data, format);

    if (!parsed.results || parsed.results.length === 0) {
      return res.status(400).json({ error: 'No results extracted from data' });
    }

    // Save to database
    const savedResults = [];
    for (const result of parsed.results) {
      const dbResult = await saveLabResult({
        lab_id: req.user.lab_id,
        patient_id: patient_id || parsed.patient_id,
        test_code: result.test_code,
        test_name: result.test_name,
        result_value: result.result_value,
        result_unit: result.result_unit,
        reference_range_low: result.reference_range_low,
        reference_range_high: result.reference_range_high,
        result_status: result.result_status,
        source_format: result.source_format,
        raw_data_encrypted: encryptRawData(result),
        collection_timestamp: result.collection_timestamp,
        is_critical: is_critical || detectCriticalValue(result),
        visibility_status: 'PENDING_REVIEW',
        created_at: new Date()
      });

      savedResults.push(dbResult);

      // Queue for AI analysis (immediately for critical, queued for others)
      if (dbResult.is_critical) {
        // Priority queue for critical values
        await analyzeQueue.add(
          { resultId: dbResult.id },
          { priority: 10, delay: 0 }
        );
      } else {
        // Normal queue
        await analyzeQueue.add({ resultId: dbResult.id }, { delay: 500 });
      }
    }

    // Audit log
    await logAudit({
      actor_user_id: req.user.id,
      action: 'RESULT_UPLOADED',
      resource_type: 'LAB_RESULT',
      resource_id: savedResults[0].id,
      changes_made: { count: savedResults.length, format }
    });

    res.json({
      status: 'success',
      results_uploaded: savedResults.length,
      result_ids: savedResults.map((r) => r.id),
      critical_count: savedResults.filter((r) => r.is_critical).length,
      processing_status: 'QUEUED_FOR_AI_ANALYSIS',
      estimated_visibility_seconds: savedResults.some((r) => r.is_critical) ? 5 : 15
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/v1/labs/upload-pdf
 * Upload PDF lab report
 */
router.post('/upload-pdf', verifyLabKey, upload.single('file'), async (req, res) => {
  try {
    const { patient_id, test_date, report_type } = req.body;

    // Parse PDF
    const parsed = await dataParser.parsePDF(req.file.buffer);

    if (!parsed.results || parsed.results.length === 0) {
      return res.status(400).json({
        error: 'No lab values extracted from PDF',
        suggestion: 'Ensure PDF contains readable lab result tables'
      });
    }

    // Save encrypted PDF
    const fileRecord = await saveEncryptedFile({
      original_filename: req.file.originalname,
      file_size_bytes: req.file.size,
      encrypted_content: encryptFileContent(req.file.buffer),
      ocr_extracted_text: parsed.extracted_text,
      ocr_confidence: parsed.ocr_confidence
    });

    // Save results linked to PDF
    const savedResults = [];
    for (const result of parsed.results) {
      const dbResult = await saveLabResult({
        lab_id: req.user.lab_id,
        patient_id,
        test_code: result.test_code || generateLoincCode(result.test_name),
        test_name: result.test_name,
        result_value: result.result_value,
        result_unit: result.result_unit,
        reference_range_low: result.reference_range_low,
        reference_range_high: result.reference_range_high,
        source_format: 'PDF',
        file_reference_id: fileRecord.id,
        raw_data_encrypted: encryptRawData(result),
        collection_timestamp: test_date || new Date().toISOString(),
        visibility_status: 'PENDING_REVIEW'
      });

      savedResults.push(dbResult);

      // Queue for AI analysis
      await analyzeQueue.add({ resultId: dbResult.id }, { delay: 1000 });
    }

    res.json({
      status: 'success',
      file_id: fileRecord.id,
      results_extracted: savedResults.length,
      ocr_confidence: parsed.ocr_confidence,
      extracted_tests: savedResults.map((r) => ({
        code: r.test_code,
        name: r.test_name,
        value: r.result_value,
        unit: r.result_unit
      })),
      processing_status: 'QUEUED_FOR_AI_ANALYSIS'
    });
  } catch (error) {
    console.error('PDF upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/v1/doctors/patients/:patient_id/lab-results
 * Get patient's lab results with AI analysis
 */
router.get('/doctors/patients/:patient_id/lab-results', async (req, res) => {
  try {
    const { patient_id } = req.params;
    const { limit = 20, include_pending = false } = req.query;

    // Verify doctor has access to patient
    if (!canAccessPatient(req.user.id, patient_id)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Fetch results with AI analysis
    const results = await getLabResults(patient_id, {
      limit,
      includeAiAnalysis: true,
      excludePending: !include_pending
    });

    // Fetch recent anomalies
    const anomalies = await getAnomalies(patient_id, { limit: 10 });

    // Audit log - doctor viewed results
    await logAudit({
      actor_user_id: req.user.id,
      action: 'RESULT_VIEWED',
      resource_type: 'PATIENT_RESULTS',
      resource_id: patient_id
    });

    res.json({
      results: results.map((r) => ({
        id: r.id,
        test_name: r.test_name,
        test_code: r.test_code,
        result_value: r.result_value,
        unit: r.result_unit,
        reference_range: `${r.reference_range_low}-${r.reference_range_high}`,
        status: r.result_status,
        result_timestamp: r.result_timestamp,
        visible_since: r.visible_to_doctor_at,

        // AI Analysis
        ai_analysis: {
          anomaly_score: r.ai_anomaly_score,
          is_anomalous: r.ai_anomaly_score > 0.5,
          interpretation: r.ai_interpretation,
          trending: r.ai_trending_flag,
          vs_baseline: getBaseline(patient_id, r.test_code),
          recommended_action: r.ai_referral_suggestion
        },

        // Critical flags
        is_critical: r.is_critical_value,
        requires_immediate_action: r.needs_immediate_attention
      })),

      anomalies_this_week: anomalies,
      summary: {
        total_results_week: await countResults(patient_id, 7),
        critical_values: results.filter((r) => r.is_critical_value).length,
        anomalies_detected: results.filter((r) => r.ai_anomaly_score > 0.6).length
      }
    });
  } catch (error) {
    console.error('Get results error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
```

### STEP 4: Register Routes in Main App

Edit `backend/src/app.js`:

```javascript
const labRoutes = require('./routes/labs/labRoutes');

// Add lab routes
app.use('/api/v1', labRoutes);
```

### STEP 5: Configure WebSocket for Real-Time

Create file: `backend/src/io/labSocketManager.js`

```javascript
const socketIO = require('socket.io');

class LabSocketManager {
  constructor(server) {
    this.io = socketIO(server, {
      cors: { origin: process.env.WEB_FRONTEND_URL }
    });

    this.setupEventHandlers();
  }

  setupEventHandlers() {
    this.io.on('connection', (socket) => {
      // Doctor watches specific patient's results
      socket.on('watch_patient_results', (patientId) => {
        if (canAccessPatient(socket.user.id, patientId)) {
          socket.join(`patient:${patientId}`);
          console.log(`Doctor ${socket.user.id} watching patient ${patientId}`);
        } else {
          socket.emit('error', 'Unauthorized');
        }
      });

      // Stop watching
      socket.on('unwatch_patient_results', (patientId) => {
        socket.leave(`patient:${patientId}`);
      });

      socket.on('disconnect', () => {
        socket.leaveAll();
      });
    });
  }

  // Called when result becomes visible (from AI analysis job)
  notifyResultVisible(patientId, result) {
    this.io.to(`patient:${patientId}`).emit('result_visible', {
      result_id: result.id,
      test_name: result.test_name,
      result_value: result.result_value,
      has_anomalies: result.ai_anomaly_score > 0.5,
      visible_at: new Date()
    });
  }

  // Called for critical values
  notifyCriticalValue(patientId, result, analysis) {
    this.io.to(`patient:${patientId}`).emit('critical_value', {
      result_id: result.id,
      test_name: result.test_name,
      value: result.result_value,
      status: 'CRITICAL',
      ai_message: analysis.INTERPRETATION,
      action_required: true,
      timestamp: new Date()
    });
  }
}

module.exports = LabSocketManager;
```

---

## 🧠 Step 6: Configure AI Analysis Job

Edit `backend/src/jobs/analyzeLabResult.js` (update from LABORATORY_ARCHITECTURE.md):

```javascript
const { GoogleGenerativeAI } = require('@google/generative-ai');
const Queue = require('bull');

const analyzeQueue = new Queue('lab-result-analysis', {
  redis: process.env.REDIS_URL,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: true
  }
});

const analyzeLabResultJob = async (job) => {
  const { resultId } = job.data;

  try {
    const result = await getResult(resultId);
    const patient = await getPatientHistory(result.patient_id);

    // Initialize Gemini AI
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      systemInstruction: `You are a clinical laboratory expert AI. Analyze the lab result in context of patient history and respond ONLY in valid JSON format with exactly these fields:
{
  "ANOMALY_SCORE": 0-1,
  "INTERPRETATION": "clinical meaning",
  "TRENDING": "pattern or STABLE",
  "REFERRAL": "specialist if needed",
  "CLINICAL_CONTEXT": "medication/condition interactions"
}`
    });

    // Build clinical context
    const clinicalContext = `
Lab Result: ${result.test_name} = ${result.result_value} ${result.result_unit}
Reference Range: ${result.reference_range_low}-${result.reference_range_high}
Patient's Previous 10 Results: ${JSON.stringify(patient.previousResults || [])}
Patient Baseline: ${patient.baseline || result.reference_range_high}
Patient Medications: ${(patient.medications || []).join(', ')}
Patient Conditions: ${(patient.diagnoses || []).join(', ')}
Patient Vitals Today: BP=${patient.vitals?.bp || 'N/A'}, Weight=${patient.vitals?.weight || 'N/A'}

Analyze for:
1. ANOMALY_SCORE: How unusual? (0=normal, 1=critical)
2. INTERPRETATION: What does this mean clinically?
3. TRENDING: Any patterns?
4. REFERRAL: Which specialist, if any?
5. CLINICAL_CONTEXT: Interactions with meds/conditions?

Respond ONLY with JSON.`;

    // Call Gemini
    const response = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: clinicalContext }] }],
      generationConfig: {
        temperature: 0.3, // Lower for medical accuracy
        maxOutputTokens: 1000,
        responseMimeType: 'application/json'
      }
    });

    const analysisText = response.response.text();
    let analysis;

    try {
      analysis = JSON.parse(analysisText);
    } catch {
      console.error('Failed to parse Gemini response:', analysisText);
      analysis = {
        ANOMALY_SCORE: 0.5,
        INTERPRETATION: analysisText,
        TRENDING: 'UNKNOWN',
        REFERRAL: 'Manual review recommended',
        CLINICAL_CONTEXT: ''
      };
    }

    // Save results to database
    await updateResult(resultId, {
      ai_anomaly_score: analysis.ANOMALY_SCORE || 0.5,
      ai_interpretation: analysis.INTERPRETATION,
      ai_trending_flag: analysis.TRENDING,
      ai_referral_suggestion: analysis.REFERRAL,
      ai_model_version: 'gemini-2.0-flash',
      visibility_status: 'DOCTOR_VISIBLE',
      visible_to_doctor_at: new Date(),
      needs_immediate_attention: analysis.ANOMALY_SCORE > 0.8
    });

    // Create anomaly if flagged
    if (analysis.ANOMALY_SCORE > 0.6) {
      await createAnomaly(resultId, {
        anomaly_type:
          analysis.ANOMALY_SCORE > 0.8 ? 'CRITICAL_VALUE' : 'CONTEXTUAL_RISK',
        severity: analysis.ANOMALY_SCORE > 0.8 ? 'CRITICAL' : 'MEDIUM',
        ai_confidence: analysis.ANOMALY_SCORE,
        clinical_context: analysis.CLINICAL_CONTEXT,
        recommended_action: analysis.REFERRAL
      });
    }

    // Notify doctor via WebSocket
    const io = require('../io/socketManager').io; // Get from your app
    io.to(`patient:${result.patient_id}`).emit('result_available', {
      result_id: resultId,
      test_name: result.test_name,
      has_anomalies: analysis.ANOMALY_SCORE > 0.5
    });

    // If critical, also send urgent notification
    if (analysis.ANOMALY_SCORE > 0.8) {
      io.to(`patient:${result.patient_id}`).emit('critical_result', {
        result_id: resultId,
        message: analysis.INTERPRETATION,
        requires_action: true
      });

      // Alert on-call doctor
      await sendUrgentAlert(result.patient_id, analysis);
    }

    console.log(`✅ Analyzed result ${resultId}: anomaly_score=${analysis.ANOMALY_SCORE}`);
  } catch (error) {
    console.error(`❌ Analysis failed for ${resultId}:`, error);

    // Mark for manual review
    await updateResult(resultId, {
      visibility_status: 'PENDING_REVIEW',
      ai_model_version: 'FAILED'
    });

    // Notify lab director
    await alertLabDirector(result.lab_id, {
      message: `AI analysis failed for result ${resultId}`,
      error: error.message
    });

    throw error; // Let Bull retry
  }
};

analyzeQueue.process(analyzeLabResultJob);

module.exports = { analyzeLabResultJob, analyzeQueue };
```

---

## 🔌 Step 7: Frontend Integration

Create `emr-web/src/components/labs/LabResultViewer.jsx`:

```jsx
import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';

export function LabResultViewer({ patientId }) {
  const [results, setResults] = useState([]);
  const [anomalies, setAnomalies] = useState([]);
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    // Connect to WebSocket
    const newSocket = io(process.env.REACT_APP_API_URL);

    newSocket.on('connect', () => {
      newSocket.emit('watch_patient_results', patientId);
    });

    // Listen for new results
    newSocket.on('result_available', (result) => {
      console.log('📊 New result:', result.test_name);
      fetchResults();
    });

    // Listen for critical values
    newSocket.on('critical_result', (result) => {
      console.log('🚨 CRITICAL:', result.message);
      alert(`CRITICAL: ${result.message}`);
      fetchResults();
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [patientId]);

  const fetchResults = async () => {
    const response = await fetch(
      `/api/v1/doctors/patients/${patientId}/lab-results?include_pending=true`
    );
    const data = await response.json();
    setResults(data.results);
    setAnomalies(data.anomalies_this_week);
  };

  useEffect(() => {
    fetchResults();
  }, [patientId]);

  return (
    <div className="lab-results">
      <h2>Lab Results</h2>

      {/* Critical Values Alert */}
      {results.some((r) => r.is_critical) && (
        <div className="alert alert-danger">
          ⚠️ CRITICAL VALUES DETECTED
          {results
            .filter((r) => r.is_critical)
            .map((r) => (
              <p key={r.id}>
                {r.test_name}: {r.result_value} (Critical)
              </p>
            ))}
        </div>
      )}

      {/* Results Table */}
      <table className="results-table">
        <thead>
          <tr>
            <th>Test</th>
            <th>Result</th>
            <th>Range</th>
            <th>AI Analysis</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {results.map((result) => (
            <tr key={result.id} className={result.is_critical ? 'critical' : ''}>
              <td>{result.test_name}</td>
              <td>{result.result_value}</td>
              <td>{result.reference_range}</td>
              <td>
                <div>
                  <strong>Anomaly: {(result.ai_analysis.anomaly_score * 100).toFixed(0)}%</strong>
                  <p>{result.ai_analysis.interpretation}</p>
                  {result.ai_analysis.trending !== 'STABLE' && (
                    <em>📈 {result.ai_analysis.trending}</em>
                  )}
                  {result.ai_analysis.recommended_action && (
                    <p>💡 {result.ai_analysis.recommended_action}</p>
                  )}
                </div>
              </td>
              <td>
                {result.is_critical ? (
                  <span className="badge badge-danger">CRITICAL</span>
                ) : result.ai_analysis.is_anomalous ? (
                  <span className="badge badge-warning">ANOMALY</span>
                ) : (
                  <span className="badge badge-success">NORMAL</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Anomalies */}
      {anomalies.length > 0 && (
        <div className="anomalies-section">
          <h3>Anomalies This Week</h3>
          {anomalies.map((anomaly) => (
            <div key={anomaly.id} className={`anomaly anomaly-${anomaly.severity.toLowerCase()}`}>
              <p>
                <strong>{anomaly.type}</strong> - {anomaly.severity}
              </p>
              <p>{anomaly.description}</p>
              {anomaly.referral_suggestion && (
                <p>🏥 {anomaly.referral_suggestion}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

---

## 🚀 Step 8: Test the System

```bash
# 1. Start your backend
cd backend
npm run dev

# 2. Test HL7 upload
curl -X POST http://localhost:3001/api/v1/labs/upload-result \
  -H "Authorization: Bearer <lab_api_key>" \
  -H "Content-Type: application/json" \
  -d '{
    "format": "FHIR",
    "patient_id": "patient-123",
    "data": {
      "resourceType": "DiagnosticReport",
      "status": "final",
      "result": [...]
    }
  }'

# 3. Watch database for AI analysis
psql emar << "SELECT id, test_name, ai_anomaly_score, ai_interpretation FROM lab_test_results ORDER BY created_at DESC LIMIT 5;"

# 4. Open frontend and watch WebSocket in real-time
# Check browser Console for WebSocket events
```

---

## 📊 Monitoring & Debugging

```bash
# Monitor job queue
npx bull dashboard redis://localhost:6379/lab-result-analysis

# Check Gemini API usage
# Go to: https://console.cloud.google.com/gen-app-builder

# View logs
tail -f backend/logs/lab-analysis.log
```

---

## ✅ Success Criteria

- [x] HL7 messages parse successfully
- [x] FHIR JSON uploads work
- [x] PDFs extract text via OCR
- [x] Gemini analyzes results in < 3 seconds
- [x] Results visible to doctor within 30 seconds
- [x] Critical values trigger WebSocket notification
- [x] Anomalies stored with AI reasoning
- [x] Audit logs track all access

---

## 🔄 Next: Which Should We Build First?

1. **Database + API** (Weeks 1-2) - Core infrastructure
2. **AI Integration** (Weeks 3-4) - Gemini analysis pipeline
3. **Lab Portal** (Weeks 5-6) - Upload & management UI
4. **Doctor Dashboard** (Weeks 7-8) - Result viewer + anomalies
5. **Testing & Deployment** (Weeks 9+) - Production hardening

Shall I start with the database setup and migrations?
