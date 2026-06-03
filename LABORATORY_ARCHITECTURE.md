# Clinical Laboratory Management System - Architecture Design

## Executive Overview
A multi-tier laboratory management system integrated into your existing eMAR, supporting 5 lab types with separate authentication, real-time result visibility (5-30s), and AI-powered clinical insights.

---

## 1. SYSTEM ARCHITECTURE

### 1.1 Technology Stack
```
┌─────────────────────────────────────────────────────────────┐
│                      Web Frontend (React)                    │
│                - Doctor Dashboard                            │
│                - Lab Portal                                  │
│                - Result Viewer & Anomaly Alerts              │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTPS
┌──────────────────────────▼──────────────────────────────────┐
│                      API Gateway/Nginx                       │
│              - Request routing by user role                  │
│              - Rate limiting per lab type                    │
│              - WebSocket upgrade (urgent results)            │
└──────────────────────────┬──────────────────────────────────┘
                           │
    ┌──────────────────────┼──────────────────────┐
    │                      │                      │
    ▼                      ▼                      ▼
┌────────────────┐  ┌────────────────┐  ┌────────────────┐
│  Lab Service   │  │  Result        │  │  AI Engine     │
│  (Express)     │  │  Processor     │  │  (Claude API)  │
│                │  │                │  │                │
│ - Auth & Role  │  │ - HL7/FHIR     │  │ - Anomaly      │
│ - Lab Mgmt     │  │ - Validation   │  │ - Interpret    │
│ - Upload       │  │ - LOINC Code   │  │ - Trends       │
└────────────────┘  │ - Normalization│  │ - Referral     │
                    └────────────────┘  │   Suggestion   │
                                        └────────────────┘
                           │
    ┌──────────────────────┼──────────────────────┐
    │                      │                      │
    ▼                      ▼                      ▼
┌──────────────────────────────────────────────────────────┐
│              PostgreSQL Database                          │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ Labs | Results | Anomalies | Audit Logs | AI Cache │ │
│  └─────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
                           │
    ┌──────────────────────┼──────────────────────┐
    │                      │                      │
    ▼                      ▼                      ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│ File Storage     │  │ Redis Cache      │  │ Message Queue    │
│ (Encrypted PDFs) │  │ (Result cache,   │  │ (Bull/RabbitMQ)  │
│                  │  │ anomaly flags)   │  │ (Processing jobs)│
└──────────────────┘  └──────────────────┘  └──────────────────┘
```

---

## 2. DATA MODEL

### 2.1 Core Tables

#### `laboratories` table
```sql
CREATE TABLE laboratories (
  id UUID PRIMARY KEY,
  facility_name VARCHAR NOT NULL,
  lab_type ENUM('CLINICAL', 'DIAGNOSTIC', 'REFERENCE', 'NABL', 'POCT'),
  accreditation_number VARCHAR,
  is_nabl_accredited BOOLEAN DEFAULT false,
  iso_15189_compliant BOOLEAN DEFAULT false,
  
  -- Contact & Location
  address_line1 VARCHAR,
  city VARCHAR,
  postal_code VARCHAR,
  phone VARCHAR,
  email VARCHAR,
  
  -- Integration
  hl7_enabled BOOLEAN DEFAULT false,
  fhir_enabled BOOLEAN DEFAULT false,
  api_key VARCHAR UNIQUE,
  api_secret_encrypted VARCHAR, -- AES-256
  webhook_url VARCHAR,
  
  -- Configuration
  processing_sla_seconds INT DEFAULT 30,
  critical_value_threshold JSONB, -- {'glucose': 50, 'potassium': 2.5}
  
  status ENUM('ACTIVE', 'INACTIVE', 'SUSPENDED'),
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  encryption_key_id VARCHAR -- For rotating encryption keys
);

-- Index on lab_type for quick filtering
CREATE INDEX idx_laboratories_type ON laboratories(lab_type);
```

#### `lab_test_results` table
```sql
CREATE TABLE lab_test_results (
  id UUID PRIMARY KEY,
  patient_id UUID REFERENCES patients(id),
  lab_id UUID REFERENCES laboratories(id),
  
  -- Test Info
  test_code VARCHAR NOT NULL, -- LOINC code
  test_name VARCHAR NOT NULL,
  specimen_type VARCHAR,
  collection_timestamp TIMESTAMP NOT NULL,
  received_timestamp TIMESTAMP,
  result_timestamp TIMESTAMP,
  
  -- Result Data
  result_value NUMERIC,
  result_unit VARCHAR,
  reference_range_low NUMERIC,
  reference_range_high NUMERIC,
  result_status ENUM('PENDING', 'FINAL', 'PRELIMINARY', 'CORRECTED', 'AMENDED'),
  
  -- Original Upload
  source_format ENUM('HL7', 'FHIR', 'JSON', 'PDF', 'CSV'),
  raw_data_encrypted BYTEA, -- AES-256 encrypted original
  file_reference_id UUID, -- points to encrypted_files table
  
  -- AI Analysis (populated asynchronously)
  ai_anomaly_score FLOAT, -- 0-1: how anomalous (0=normal, 1=critical)
  ai_interpretation TEXT, -- Clinical interpretation by Claude
  ai_trending_flag VARCHAR, -- e.g., 'RISING_GLUCOSE', 'ANEMIA_DEVELOPING'
  ai_referral_suggestion TEXT, -- "Consider nephrology referral"
  ai_model_version VARCHAR, -- Track which Claude model version
  
  -- Flags
  is_critical_value BOOLEAN DEFAULT false,
  needs_immediate_attention BOOLEAN DEFAULT false,
  doctor_notified_at TIMESTAMP,
  
  visibility_status ENUM('DOCTOR_VISIBLE', 'PENDING_REVIEW', 'RESTRICTED'),
  visible_to_doctor_at TIMESTAMP,
  
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

-- Critical indexes for real-time queries
CREATE INDEX idx_results_patient_id ON lab_test_results(patient_id);
CREATE INDEX idx_results_lab_id ON lab_test_results(lab_id);
CREATE INDEX idx_results_status ON lab_test_results(result_status);
CREATE INDEX idx_results_anomaly ON lab_test_results(ai_anomaly_score) 
  WHERE ai_anomaly_score > 0.5;
CREATE INDEX idx_results_timestamp ON lab_test_results(result_timestamp DESC);
CREATE INDEX idx_results_visibility ON lab_test_results(visibility_status, created_at DESC);
```

#### `lab_anomalies` table
```sql
CREATE TABLE lab_anomalies (
  id UUID PRIMARY KEY,
  result_id UUID REFERENCES lab_test_results(id),
  patient_id UUID REFERENCES patients(id),
  
  anomaly_type ENUM('CRITICAL_VALUE', 'OUT_OF_RANGE', 'TREND_ALERT', 
                    'CONTEXTUAL_RISK', 'INTERACTION_DETECTED'),
  
  severity ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'),
  ai_confidence FLOAT, -- 0-1
  
  -- Context
  baseline_value NUMERIC, -- Patient's typical range
  population_percentile INT, -- Where patient sits in population
  previous_results JSONB, -- Last 3 similar tests
  
  clinical_context TEXT, -- "Patient on diuretics; low K+ concerning"
  recommended_action TEXT, -- "Recommend cardiology consult"
  
  -- Notification
  doctor_alerted BOOLEAN DEFAULT false,
  alert_sent_at TIMESTAMP,
  alert_acknowledged_at TIMESTAMP,
  
  created_at TIMESTAMP
);

CREATE INDEX idx_anomalies_severity ON lab_anomalies(severity);
CREATE INDEX idx_anomalies_patient ON lab_anomalies(patient_id, created_at DESC);
```

#### `lab_audit_logs` table (ISO 15189 compliance)
```sql
CREATE TABLE lab_audit_logs (
  id UUID PRIMARY KEY,
  actor_user_id UUID REFERENCES users(id),
  actor_role VARCHAR, -- 'LAB_TECHNICIAN', 'LAB_ADMIN', 'DOCTOR', 'SYSTEM'
  
  action VARCHAR, -- 'RESULT_UPLOADED', 'RESULT_VIEWED', 'RESULT_MODIFIED'
  resource_type VARCHAR, -- 'LAB_RESULT', 'LABORATORY'
  resource_id UUID,
  
  changes_made JSONB, -- What changed: {old: {...}, new: {...}}
  
  ip_address INET,
  user_agent TEXT,
  session_id VARCHAR,
  
  -- Encryption keys used (for audit trail)
  encryption_key_id VARCHAR,
  
  created_at TIMESTAMP,
  
  -- Immutable: append-only log
  CONSTRAINT audit_log_immutable CHECK (created_at IS NOT NULL)
);

CREATE INDEX idx_audit_logs_actor ON lab_audit_logs(actor_user_id, created_at DESC);
CREATE INDEX idx_audit_logs_resource ON lab_audit_logs(resource_type, resource_id, created_at DESC);
```

#### `encrypted_files` table
```sql
CREATE TABLE encrypted_files (
  id UUID PRIMARY KEY,
  result_id UUID REFERENCES lab_test_results(id),
  lab_id UUID REFERENCES laboratories(id),
  
  original_filename VARCHAR,
  file_size_bytes INT,
  mime_type VARCHAR, -- 'application/pdf', 'text/plain', etc.
  
  -- Encryption
  encrypted_content BYTEA,
  encryption_algorithm VARCHAR DEFAULT 'AES-256-GCM',
  encryption_key_id VARCHAR,
  iv_nonce BYTEA,
  
  -- OCR (if PDF)
  ocr_extracted_text TEXT,
  ocr_confidence FLOAT,
  
  storage_path VARCHAR, -- Could be S3, local, etc.
  
  created_at TIMESTAMP,
  deleted_at TIMESTAMP -- Soft delete for compliance
);
```

### 2.2 Schema Extensions (Add to existing Users table)
```sql
-- Add columns to existing `users` table:
ALTER TABLE users ADD COLUMN lab_id UUID REFERENCES laboratories(id);
ALTER TABLE users ADD COLUMN lab_role ENUM('LAB_TECHNICIAN', 'LAB_ADMIN', 'LAB_DIRECTOR');
ALTER TABLE users ADD COLUMN can_upload_results BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN can_view_all_results BOOLEAN DEFAULT false;

-- Separate login credential for lab staff (if needed)
CREATE TABLE lab_credentials (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id) UNIQUE,
  lab_id UUID REFERENCES laboratories(id),
  
  -- OAuth/SAML for enterprise lab systems
  sso_provider ENUM('OKTA', 'AD', 'SAML', 'OAUTH2', 'INTERNAL'),
  sso_identifier VARCHAR,
  
  last_login TIMESTAMP,
  created_at TIMESTAMP
);
```

---

## 3. API ENDPOINTS

### 3.1 Lab Management (Admin)

#### Create/Manage Laboratory
```
POST /api/v1/admin/laboratories
{
  "facility_name": "Apollo Diagnostics",
  "lab_type": "DIAGNOSTIC",
  "is_nabl_accredited": true,
  "iso_15189_compliant": true,
  "address_line1": "123 Health Plaza",
  "city": "Bangalore",
  "email": "contact@apollodiag.com",
  "hl7_enabled": true,
  "fhir_enabled": true,
  "processing_sla_seconds": 30,
  "critical_value_threshold": {
    "glucose": 50,
    "potassium": 2.5,
    "creatinine": 10
  }
}

Response:
{
  "id": "lab-uuid",
  "api_key": "lab_pk_xxx",
  "api_secret": "lab_sk_xxx", // Only shown once
  "webhook_url_generated": "https://emr.local/api/v1/labs/webhooks/{lab_id}"
}
```

#### Get Lab Dashboard (for admin)
```
GET /api/v1/admin/laboratories/{lab_id}/dashboard
{
  "lab_info": {...},
  "stats": {
    "tests_uploaded_today": 245,
    "pending_results": 12,
    "critical_values_this_week": 3,
    "avg_processing_time_ms": 2400
  },
  "recent_anomalies": [...],
  "uptime_percentage": 99.8
}
```

### 3.2 Lab Uploads (Lab Portal)

#### Upload Test Result (HL7/FHIR/JSON)
```
POST /api/v1/labs/upload-result
Headers: Authorization: Bearer {lab_api_key}

Content-Type: application/json
{
  "format": "FHIR",
  "data": {
    "resourceType": "DiagnosticReport",
    "status": "final",
    "category": [{"coding": [{"system": "http://loinc.org", "code": "15074-8"}]}],
    "code": {"coding": [{"system": "http://loinc.org", "code": "15074-8", "display": "Glucose [Moles/volume] in blood"}]},
    "subject": {"reference": "Patient/{patient_id}"},
    "result": [{
      "reference": "Observation/glucose-obs-001",
      "value": {"value": 180, "unit": "mg/dL"}
    }]
  },
  "collection_timestamp": "2026-06-03T10:30:00Z",
  "is_critical": false
}

Response:
{
  "status": "success",
  "result_id": "result-uuid",
  "processing_status": "QUEUED_FOR_AI_ANALYSIS",
  "estimated_doctor_visibility_seconds": 8,
  "anomaly_initial_scan": {
    "flagged": true,
    "preliminary_risk": "HIGH",
    "reason": "Glucose 180 is 2.5 SD above patient baseline"
  }
}
```

#### Upload PDF Lab Report
```
POST /api/v1/labs/upload-report
Headers: Authorization: Bearer {lab_api_key}
Content-Type: multipart/form-data

FormData:
  - file: <binary PDF>
  - patient_id: uuid
  - test_date: "2026-06-03"
  - report_type: "PANEL_BASIC_METABOLIC"

Response:
{
  "status": "success",
  "result_id": "result-uuid",
  "ocr_extraction": {
    "extracted_tests": [
      {"code": "15074-8", "name": "Glucose", "value": 180, "unit": "mg/dL"},
      {"code": "2345-7", "name": "Creatinine", "value": 1.2, "unit": "mg/dL"}
    ],
    "extraction_confidence": 0.94
  },
  "processing_status": "QUEUED_FOR_AI_ANALYSIS"
}
```

### 3.3 Real-Time Result Visibility (Doctor Portal)

#### Get Patient's Recent Results (with WebSocket for urgent)
```
GET /api/v1/doctors/patients/{patient_id}/lab-results
Query: ?limit=20&include_pending=true&sort=newest

Response:
{
  "results": [
    {
      "id": "result-uuid",
      "test_name": "Blood Glucose",
      "test_code": "15074-8",
      "result_value": 180,
      "unit": "mg/dL",
      "reference_range": "70-100",
      "status": "FINAL",
      "result_timestamp": "2026-06-03T10:30:00Z",
      "visible_since": "2026-06-03T10:35:42Z", // 5-35 seconds after result
      
      "ai_analysis": {
        "anomaly_score": 0.87,
        "is_anomalous": true,
        "interpretation": "Significantly elevated fasting glucose. Patient may have uncontrolled diabetes or acute metabolic stress.",
        "trending": "RISING_GLUCOSE",
        "vs_baseline": "150% above patient's typical range",
        "recommended_action": "Review diabetes medications; consider endocrinology referral if pattern continues"
      },
      
      "anomaly_details": {
        "severity": "HIGH",
        "baseline_value": 115,
        "population_percentile": 92, // Top 8% of population
        "critical_value": false
      }
    }
  ],
  "anomalies_this_week": [
    {
      "id": "anomaly-uuid",
      "type": "TREND_ALERT",
      "severity": "MEDIUM",
      "description": "Creatinine trending upward over 2 weeks - possible early kidney dysfunction",
      "tests_involved": [...],
      "referral_suggestion": "Nephrology consult recommended"
    }
  ]
}
```

#### WebSocket for Critical Values (Real-time)
```
WS /api/v1/doctors/watch-results?patient_id=uuid&severity=CRITICAL,HIGH

Connection: Upgrade
Sec-WebSocket-Key: xxx
Sec-WebSocket-Version: 13

Server messages:
{
  "type": "CRITICAL_RESULT",
  "result": {
    "id": "result-uuid",
    "test_name": "Potassium",
    "value": 2.1,
    "status": "CRITICAL",
    "ai_message": "Severe hypokalemia - risk of cardiac arrhythmia. Immediate intervention recommended.",
    "action_required": true
  },
  "timestamp": "2026-06-03T10:35:02Z"
}
```

#### Get Anomaly Details
```
GET /api/v1/doctors/anomalies/{anomaly_id}

Response:
{
  "id": "anomaly-uuid",
  "type": "CONTEXTUAL_RISK",
  "severity": "HIGH",
  
  "clinical_context": {
    "patient_medications": ["Metformin 500mg BID", "Lisinopril 10mg daily"],
    "relevant_vitals": {"BP": "145/92", "weight_gain_month": "2.5kg"},
    "recent_diagnosis": "Type 2 Diabetes"
  },
  
  "finding": {
    "test": "Creatinine",
    "value": 1.8,
    "baseline": 0.9,
    "change_percent": "+100%"
  },
  
  "ai_clinical_reasoning": "Patient is on Metformin and ACE inhibitor. Doubling of creatinine suggests rapid decline in renal function. This could indicate diabetic nephropathy progression or acute kidney injury. Discontinue Metformin immediately and assess for cause.",
  
  "recommended_actions": [
    {"priority": "URGENT", "action": "Check eGFR and UACR"},
    {"priority": "URGENT", "action": "Nephrology referral"},
    {"priority": "HIGH", "action": "Hold Metformin until renal function clarified"},
    {"priority": "HIGH", "action": "Monitor electrolytes"}
  ],
  
  "referral_suggestions": [
    {
      "specialty": "Nephrology",
      "confidence": 0.95,
      "reason": "Rapidly declining renal function in diabetic patient"
    }
  ]
}
```

---

## 4. AI INTEGRATION (Claude vs Gemini)

### 4.0 AI Provider Comparison

| Feature | Claude API | Gemini API |
|---------|-----------|-----------|
| **Model** | Claude Opus 4.8 (most capable) | Gemini 2.0 Flash (latest/fastest) |
| **Cost** | $15/1M input, $75/1M output | $0.075/1M input, $0.30/1M output |
| **Latency** | 2-5 seconds | 1-3 seconds (faster) |
| **Context Window** | 200K tokens | 1M tokens (supports longer history) |
| **Prompt Caching** | ✅ Yes (5-min cache, cost reduction) | ✅ Yes (cache tokens cheaper) |
| **Best For** | Complex reasoning, medical analysis | Speed, high-volume processing |
| **Recommendation** | Use for critical/complex cases | Use for routine analysis (cost) |

**My Recommendation**: Use **Gemini 2.0 Flash for routine results** (10-50x cheaper, fast enough) and **Claude Opus for critical values** (better reasoning).

### 4.1 Pluggable AI Provider (Factory Pattern)

```javascript
// backend/src/services/ai/AIProviderFactory.js

class AIProviderFactory {
  static create(provider = process.env.AI_PROVIDER || 'gemini') {
    if (provider === 'claude') {
      return new ClaudeProvider();
    } else if (provider === 'gemini') {
      return new GeminiProvider();
    } else {
      throw new Error(`Unknown AI provider: ${provider}`);
    }
  }
}

module.exports = AIProviderFactory;
```

```javascript
// backend/src/services/ai/ClaudeProvider.js

const Anthropic = require('@anthropic-ai/sdk');

class ClaudeProvider {
  constructor() {
    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });
  }
  
  async analyzeLabResult(resultContext) {
    const response = await this.client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 1500,
      
      system: `You are a clinical laboratory expert AI. Analyze the following lab result in context of patient history and provide:
1. Anomaly assessment (0-1 score)
2. Clinical interpretation
3. Trending pattern if applicable
4. Specialist referral recommendations
Be concise, evidence-based, and focus on clinical significance.`,
      
      messages: [{
        role: "user",
        content: this._buildPrompt(resultContext)
      }],
      
      // Prompt caching for cost reduction
      system_cache_control: { type: "ephemeral" }
    });
    
    return this._parseResponse(response);
  }
  
  async analyzeMultipleResults(resultsContext) {
    // For batch processing multiple patient results
    const response = await this.client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 3000,
      messages: [{
        role: "user",
        content: `Analyze these ${resultsContext.length} lab results for anomalies and patterns:\n\n${resultsContext.map(r => this._buildPrompt(r)).join('\n---\n')}`
      }]
    });
    
    return this._parseResponse(response);
  }
  
  _buildPrompt(context) {
    return `
Lab Result: ${context.test_name} = ${context.result_value} ${context.result_unit}
Reference Range: ${context.reference_range_low}-${context.reference_range_high}
Patient's Previous 10 Results: ${JSON.stringify(context.previousResults)}
Patient Baseline: ${context.baseline}
Patient Medications: ${context.medications.join(', ')}
Patient Conditions: ${context.diagnoses.join(', ')}
Patient Vitals Today: BP=${context.vitals.bp}, Weight=${context.vitals.weight}

Provide:
1. ANOMALY_SCORE (0-1): How unusual is this result?
2. INTERPRETATION: Clinical meaning in 1-2 sentences
3. TRENDING: Is there a pattern? (e.g., RISING_GLUCOSE, STABLE, ANEMIA_DEVELOPING)
4. REFERRAL: Any specialist needed?
5. CLINICAL_CONTEXT: Any concerning interactions with meds/conditions?

Format as JSON.`;
  }
  
  _parseResponse(response) {
    try {
      return JSON.parse(response.content[0].text);
    } catch (e) {
      // Handle non-JSON responses from Claude
      return {
        ANOMALY_SCORE: 0.5,
        INTERPRETATION: response.content[0].text,
        TRENDING: 'UNKNOWN',
        REFERRAL: 'Manual review recommended',
        CLINICAL_CONTEXT: ''
      };
    }
  }
}

module.exports = ClaudeProvider;
```

```javascript
// backend/src/services/ai/GeminiProvider.js

const { GoogleGenerativeAI } = require("@google/generative-ai");

class GeminiProvider {
  constructor() {
    this.client = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
    this.model = this.client.getGenerativeModel({ 
      model: "gemini-2.0-flash",
      // Caching support for Gemini
      systemInstruction: this._getSystemPrompt()
    });
  }
  
  async analyzeLabResult(resultContext) {
    const prompt = this._buildPrompt(resultContext);
    
    const response = await this.model.generateContent({
      contents: [{
        role: "user",
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        temperature: 0.3, // Lower temp for medical accuracy
        maxOutputTokens: 1000,
        responseMimeType: "application/json"
      },
      cachedContent: await this._getCachedSystemPrompt() // Caching
    });
    
    return this._parseResponse(response);
  }
  
  async analyzeMultipleResults(resultsContext) {
    // Gemini's 1M context window handles this better
    const allPrompts = resultsContext
      .map(r => this._buildPrompt(r))
      .join('\n---\n');
    
    const response = await this.model.generateContent({
      contents: [{
        role: "user",
        parts: [{
          text: `Analyze these ${resultsContext.length} lab results for anomalies and patterns:\n\n${allPrompts}`
        }]
      }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 2000,
        responseMimeType: "application/json"
      }
    });
    
    return this._parseResponse(response);
  }
  
  _getSystemPrompt() {
    return `You are a clinical laboratory expert AI. Analyze lab results in context of patient history and provide:
1. Anomaly assessment (0-1 score)
2. Clinical interpretation
3. Trending pattern if applicable
4. Specialist referral recommendations
Be concise, evidence-based, and focus on clinical significance. Always respond in valid JSON format.`;
  }
  
  async _getCachedSystemPrompt() {
    // Implement caching if needed
    return null;
  }
  
  _buildPrompt(context) {
    return `
Lab Result: ${context.test_name} = ${context.result_value} ${context.result_unit}
Reference Range: ${context.reference_range_low}-${context.reference_range_high}
Patient's Previous 10 Results: ${JSON.stringify(context.previousResults)}
Patient Baseline: ${context.baseline}
Patient Medications: ${context.medications.join(', ')}
Patient Conditions: ${context.diagnoses.join(', ')}
Patient Vitals Today: BP=${context.vitals.bp}, Weight=${context.vitals.weight}

Provide as JSON:
{
  "ANOMALY_SCORE": 0-1,
  "INTERPRETATION": "text",
  "TRENDING": "pattern or STABLE",
  "REFERRAL": "specialist if needed",
  "CLINICAL_CONTEXT": "medication/condition interactions"
}`;
  }
  
  _parseResponse(response) {
    try {
      const text = response.response.text();
      // Gemini returns JSON with responseMimeType: "application/json"
      return JSON.parse(text);
    } catch (e) {
      console.error('Gemini parse error:', e);
      return {
        ANOMALY_SCORE: 0.5,
        INTERPRETATION: response.response.text(),
        TRENDING: 'UNKNOWN',
        REFERRAL: 'Manual review recommended',
        CLINICAL_CONTEXT: ''
      };
    }
  }
}

module.exports = GeminiProvider;
```

### 4.2 Asynchronous Processing Pipeline

```javascript
// backend/src/jobs/analyzeLabResult.js

const AIProviderFactory = require('../services/ai/AIProviderFactory');

const analyzeLabResultJob = async (resultId, options = {}) => {
  const result = await getResult(resultId);
  const patient = await getPatientHistory(result.patient_id);
  
  // Choose AI provider based on result urgency
  let aiProvider;
  if (result.is_critical || result.ai_anomaly_score > 0.8) {
    // Critical cases: use Claude for better reasoning
    aiProvider = AIProviderFactory.create('claude');
  } else {
    // Routine: use Gemini for speed and cost
    aiProvider = AIProviderFactory.create('gemini');
  }
  
  try {
    // Call AI provider with structured context
    const analysis = await aiProvider.analyzeLabResult({
      test_name: result.test_name,
      result_value: result.result_value,
      result_unit: result.result_unit,
      reference_range_low: result.reference_range_low,
      reference_range_high: result.reference_range_high,
      previousResults: patient.previousResults || [],
      baseline: patient.baseline || result.reference_range_high,
      medications: patient.medications || [],
      diagnoses: patient.diagnoses || [],
      vitals: patient.vitals || {}
    });
    
    // Store results in database
    await updateResult(resultId, {
      ai_anomaly_score: analysis.ANOMALY_SCORE,
      ai_interpretation: analysis.INTERPRETATION,
      ai_trending_flag: analysis.TRENDING,
      ai_referral_suggestion: analysis.REFERRAL,
      ai_model_version: options.provider || process.env.AI_PROVIDER
    });
    
    // Flag if anomalous
    if (analysis.ANOMALY_SCORE > 0.6) {
      await createAnomaly(resultId, {
        anomaly_type: 'CONTEXTUAL_RISK',
        severity: analysis.ANOMALY_SCORE > 0.8 ? 'HIGH' : 'MEDIUM',
        ai_confidence: analysis.ANOMALY_SCORE,
        clinical_context: analysis.CLINICAL_CONTEXT,
        recommended_action: analysis.REFERRAL
      });
    }
    
    // Notify doctor via WebSocket
    io.to(`patient:${result.patient_id}`).emit('result_available', {
      result_id: resultId,
      has_anomalies: analysis.ANOMALY_SCORE > 0.5,
      urgency: analysis.ANOMALY_SCORE > 0.8 ? 'URGENT' : 'NORMAL'
    });
    
  } catch (error) {
    console.error(`AI analysis failed for result ${resultId}:`, error);
    
    // Fallback: Mark for manual review
    await updateResult(resultId, {
      visibility_status: 'PENDING_REVIEW',
      ai_model_version: 'FAILED'
    });
    
    // Alert lab director
    await notifyLabDirector(result.lab_id, {
      message: `AI analysis failed for result ${resultId}. Manual review needed.`,
      error: error.message
    });
  }
};

// Bull queue configuration
const analyzeQueue = new Queue('lab-result-analysis', {
  redis: process.env.REDIS_URL,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: true
  }
});

analyzeQueue.process(analyzeLabResultJob);

module.exports = { analyzeLabResultJob, analyzeQueue };
```

### 4.3 Batch Analysis (for historical data)

```javascript
// backend/src/jobs/batchAnalyzePatientResults.js

const AIProviderFactory = require('../services/ai/AIProviderFactory');

const batchAnalyzePatientResults = async (patientId) => {
  const results = await getPatientResults(patientId);
  
  // Use Gemini for batch (cheaper, faster)
  const aiProvider = AIProviderFactory.create('gemini');
  
  const analysis = await aiProvider.analyzeMultipleResults(
    results.map(r => ({
      test_name: r.test_name,
      result_value: r.result_value,
      result_unit: r.result_unit,
      reference_range_low: r.reference_range_low,
      reference_range_high: r.reference_range_high,
      previousResults: results.slice(0, 10),
      baseline: getPatientBaseline(patientId),
      medications: getPatientMedications(patientId),
      diagnoses: getPatientDiagnoses(patientId),
      vitals: getPatientVitals(patientId)
    }))
  );
  
  // Store batch analysis results
  await saveBatchAnalysis(patientId, analysis);
};

module.exports = { batchAnalyzePatientResults };
```

### 4.2 Real-Time Anomaly Detection

```javascript
// backend/src/services/laboratory/anomalyDetector.js

class AnomalyDetector {
  async detectCriticalValues(result) {
    const isCritical = result.result_value < result.critical_low ||
                       result.result_value > result.critical_high;
    
    if (isCritical) {
      await markCriticalValue(result.id);
      await notifyDoctorUrgent(result.patient_id, result);
    }
    
    return isCritical;
  }
  
  async detectOutOfRange(result) {
    const isOutOfRange = result.result_value < result.reference_range_low ||
                         result.result_value > result.reference_range_high;
    
    if (isOutOfRange) {
      return {
        anomaly_type: 'OUT_OF_RANGE',
        severity: this.calculateSeverity(result),
        baseline_deviation: this.getDeviation(result)
      };
    }
  }
  
  async detectTrendingPatterns(patientId, testCode) {
    const lastResults = await getLastNResults(patientId, testCode, 10);
    
    // Simple trend detection
    const trend = this.calculateTrend(lastResults);
    
    if (trend === 'RISING' && this.isSignificant(lastResults)) {
      return {
        trending_flag: 'RISING_' + testCode,
        severity: 'MEDIUM',
        pattern_description: `${testCode} has been rising over ${lastResults.length} tests`
      };
    }
  }
  
  calculateSeverity(result) {
    const deviation = Math.abs(result.result_value - result.reference_range_high) /
                      result.reference_range_high;
    
    if (deviation > 0.5) return 'HIGH';
    if (deviation > 0.25) return 'MEDIUM';
    return 'LOW';
  }
}
```

### 4.3 Streaming Results for Urgent Cases
```javascript
// backend/src/routes/labs/webhookRouter.js

router.post('/webhooks/:lab_id', async (req, res) => {
  const { lab_id } = req.params;
  const { results } = req.body;
  
  // Verify lab API key
  const lab = await verifyLabKey(req.headers.authorization);
  
  // Process immediately for critical results
  const criticalResults = results.filter(r => r.is_critical);
  const normalResults = results.filter(r => !r.is_critical);
  
  // Critical: Process inline and stream to doctor
  for (const result of criticalResults) {
    const normalized = await normalizeResult(result);
    
    // Quick Claude analysis (< 3 seconds)
    const quickAnalysis = await claudeAPI.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 300,
      messages: [{
        role: "user",
        content: `CRITICAL LAB VALUE: ${normalized.test_name} = ${normalized.value} (ref: ${normalized.reference})
Is this immediately life-threatening? Respond in JSON: {threat_level: 'SEVERE'|'HIGH'|'MODERATE', immediate_action: 'text'}`
      }]
    });
    
    await saveResult(normalized);
    
    // Real-time WebSocket notification
    io.to(`patient:${result.patient_id}`).emit('critical_value', {
      ...normalized,
      analysis: quickAnalysis
    });
    
    // SMS/Email alert to on-call doctor
    await alertDoctor(normalized);
  }
  
  // Normal results: Queue for background analysis
  for (const result of normalResults) {
    await analyzeQueue.add({ result }, { delay: 100 });
  }
  
  res.json({ 
    status: 'accepted',
    processed: results.length
  });
});
```

---

## 5. AUTHENTICATION & AUTHORIZATION

### 5.1 Lab-Specific Login

```javascript
// backend/src/routes/auth/labAuthRouter.js

// Lab portal login
router.post('/auth/lab/login', async (req, res) => {
  const { email, password } = req.body;
  
  const user = await User.findOne({ email, lab_id: { $ne: null } });
  
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  
  // Lab-specific JWT
  const token = jwt.sign({
    user_id: user.id,
    lab_id: user.lab_id,
    role: user.lab_role,
    scope: ['result:upload', 'result:view_own']
  }, process.env.JWT_SECRET, { expiresIn: '8h' });
  
  res.json({ 
    token,
    user: {
      id: user.id,
      name: user.name,
      lab_id: user.lab_id,
      lab_role: user.lab_role
    }
  });
});

// API Key authentication for programmatic uploads
router.post('/api/v1/labs/authenticate', async (req, res) => {
  const { api_key, api_secret } = req.body;
  
  const lab = await Laboratory.findOne({ api_key });
  
  if (!lab || !crypto.timingSafeEqual(
      Buffer.from(api_secret),
      Buffer.from(await decrypt(lab.api_secret_encrypted))
    )) {
    return res.status(401).json({ error: 'Invalid API credentials' });
  }
  
  const token = jwt.sign({
    lab_id: lab.id,
    scope: ['result:upload'],
    iat: Date.now()
  }, process.env.JWT_SECRET, { expiresIn: '1h' });
  
  res.json({ access_token: token });
});
```

### 5.2 Role-Based Access Control

```javascript
// backend/src/middleware/labRBAC.js

const labRBAC = {
  'LAB_TECHNICIAN': {
    can: ['result:upload', 'result:view_own'],
    cannot: ['lab:config', 'user:manage']
  },
  'LAB_ADMIN': {
    can: ['result:upload', 'result:view_all', 'lab:config', 'user:manage'],
    cannot: ['system:admin']
  },
  'LAB_DIRECTOR': {
    can: ['result:upload', 'result:view_all', 'lab:config', 'user:manage', 'audit:view'],
    cannot: ['system:admin']
  },
  'DOCTOR': {
    can: ['result:view_own_patients', 'anomaly:view', 'result:acknowledge'],
    cannot: ['result:upload', 'lab:config']
  },
  'ADMIN': {
    can: ['*']
  }
};

const checkPermission = (requiredScope) => {
  return async (req, res, next) => {
    const userScopes = req.user.scope || [];
    
    if (!userScopes.includes('*') && !userScopes.includes(requiredScope)) {
      return res.status(403).json({ error: 'Permission denied' });
    }
    
    next();
  };
};

// Usage:
router.post('/upload', checkPermission('result:upload'), uploadHandler);
```

### 5.3 Encryption at Rest

```javascript
// backend/src/services/encryption/cryptoService.js

class CryptoService {
  async encryptSensitiveData(data, dataType) {
    const keyId = process.env.ACTIVE_ENCRYPTION_KEY_ID;
    const key = await this.getEncryptionKey(keyId);
    
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    
    let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    return {
      encrypted: encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
      keyId: keyId,
      algorithm: 'aes-256-gcm',
      dataType: dataType
    };
  }
  
  async decryptSensitiveData(encryptedObj) {
    const key = await this.getEncryptionKey(encryptedObj.keyId);
    
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(encryptedObj.iv, 'hex')
    );
    
    decipher.setAuthTag(Buffer.from(encryptedObj.authTag, 'hex'));
    
    let decrypted = decipher.update(encryptedObj.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return JSON.parse(decrypted);
  }
  
  async rotateEncryptionKeys() {
    // Background job to re-encrypt all data with new key
    // Essential for compliance
  }
}
```

---

## 6. REAL-TIME ARCHITECTURE (5-30s SLA)

### 6.1 WebSocket Implementation

```javascript
// backend/src/io/socketManager.js

const io = require('socket.io')(server, {
  cors: { origin: process.env.WEB_FRONTEND_URL },
  transports: ['websocket', 'polling']
});

// Doctor watching patient's results
io.on('connection', (socket) => {
  socket.on('watch_patient_results', (patientId) => {
    // Verify doctor has access to this patient
    if (!hasAccess(socket.user.id, patientId)) {
      socket.emit('error', 'Unauthorized');
      return;
    }
    
    socket.join(`patient:${patientId}`);
  });
  
  socket.on('disconnect', () => {
    socket.leaveAll();
  });
});

// When result becomes visible, notify in real-time
const notifyResultVisible = (patientId, resultId) => {
  io.to(`patient:${patientId}`).emit('result_visible', {
    result_id: resultId,
    visible_at: new Date()
  });
};

// Critical value immediate notification
const notifyCriticalValue = (patientId, result) => {
  io.to(`patient:${patientId}`).emit('critical_value', result, {
    acknowledgement_required: true
  });
};
```

### 6.2 Caching Strategy (Redis)

```javascript
// backend/src/services/cache/resultCache.js

class ResultCache {
  async cacheResult(result) {
    const cacheKey = `result:${result.id}`;
    const ttl = 3600; // 1 hour
    
    await redis.setex(
      cacheKey,
      ttl,
      JSON.stringify({
        ...result,
        cached_at: Date.now()
      })
    );
    
    // Also index by patient for quick lookups
    await redis.lpush(`patient:${result.patient_id}:results`, result.id);
    await redis.ltrim(`patient:${result.patient_id}:results`, 0, 99);
  }
  
  async getRecentResults(patientId, limit = 20) {
    const resultIds = await redis.lrange(
      `patient:${patientId}:results`,
      0,
      limit - 1
    );
    
    // Cache hit?
    const cached = await Promise.all(
      resultIds.map(id => redis.get(`result:${id}`))
    );
    
    if (cached.length > 0) {
      return cached.map(c => JSON.parse(c));
    }
    
    // Cache miss: query DB and refill cache
    const dbResults = await getResultsFromDB(patientId, limit);
    for (const result of dbResults) {
      await this.cacheResult(result);
    }
    
    return dbResults;
  }
  
  async invalidatePatientCache(patientId) {
    await redis.del(`patient:${patientId}:results`);
  }
}
```

---

## 7. IMPLEMENTATION ROADMAP

### Phase 1: Core Infrastructure (Weeks 1-2)
- [ ] Database schema creation & migrations
- [ ] Lab management API endpoints
- [ ] Lab authentication (JWT + API keys)
- [ ] Basic result upload (JSON format)
- [ ] Real-time WebSocket setup

### Phase 2: AI Integration (Weeks 3-4)
- [ ] Claude API integration
- [ ] Result analysis job queue
- [ ] Anomaly detection pipeline
- [ ] Caching optimization with prompt caching

### Phase 3: Advanced Features (Weeks 5-6)
- [ ] HL7/FHIR parsing
- [ ] PDF upload + OCR extraction
- [ ] Predictive trending algorithms
- [ ] Specialist referral recommendations

### Phase 4: Compliance & Security (Weeks 7-8)
- [ ] ISO 15189 audit logging
- [ ] Encryption key rotation
- [ ] NDHM/ABDM integration (if needed)
- [ ] Penetration testing

### Phase 5: Optimization & Launch (Weeks 9-10)
- [ ] Load testing (1000+ concurrent doctors)
- [ ] Performance tuning (sub-5s critical value latency)
- [ ] Training materials for labs
- [ ] Production deployment

---

## 8. AI FEATURES BREAKDOWN

### 8.1 Anomaly Detection (Claude-powered)
- Contextual analysis: compares result to patient's baseline, medications, diagnoses
- Population comparison: where does this patient sit vs population distribution
- Critical value detection: immediate alerting for life-threatening values

### 8.2 Auto-Interpretation
- Clinical significance assessment
- Probable causes given patient context
- Medication interactions (existing drug interaction DB + Claude reasoning)

### 8.3 Predictive Trending
- Pattern recognition: "glucose trending up over 2 weeks"
- Early warning: "kidney function declining, may develop chronic kidney disease"
- Seasonality: adjusts for time of year if relevant

### 8.4 Specialist Referral Suggestions
- Multi-specialty recommendations: "Primary: Endocrinology (95% confidence), Secondary: Ophthalmology (70%)"
- Justification with evidence
- Urgency level: routine vs urgent

---

## 9. DEPLOYMENT ARCHITECTURE

```yaml
# docker-compose.yml additions

services:
  lab-api:
    image: your-registry/lab-api:latest
    environment:
      - DATABASE_URL=postgresql://...
      - REDIS_URL=redis://redis:6379
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
    ports:
      - "3002:3000"
    depends_on:
      - postgres
      - redis
      - rabbitmq

  result-analyzer:
    image: your-registry/result-analyzer:latest
    environment:
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - REDIS_URL=redis://redis:6379
    depends_on:
      - redis
      - rabbitmq
    command: npm run worker

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data

  # ... existing services ...
```

---

## 10. MONITORING & ALERTS

```javascript
// backend/src/monitoring/labMetrics.js

const metrics = {
  // Processing latency
  result_visibility_latency: new Histogram({
    name: 'lab_result_visibility_latency_ms',
    help: 'Time from upload to doctor visibility',
    buckets: [1000, 5000, 10000, 30000, 60000]
  }),
  
  // AI performance
  ai_analysis_latency: new Histogram({
    name: 'ai_analysis_latency_ms',
    help: 'Time for Claude to analyze result',
    buckets: [500, 1000, 2000, 5000, 10000]
  }),
  
  // Anomaly rates
  anomalies_detected: new Counter({
    name: 'lab_anomalies_detected_total',
    help: 'Total anomalies detected by AI',
    labelNames: ['severity', 'type']
  }),
  
  // Uptime
  lab_uptime: new Gauge({
    name: 'lab_system_uptime_percent',
    help: 'Lab system availability',
    labelNames: ['lab_id']
  })
};

// Alert thresholds
const alertRules = [
  { metric: 'result_visibility_latency', threshold: 30000, severity: 'CRITICAL' },
  { metric: 'ai_analysis_latency', threshold: 10000, severity: 'HIGH' },
  { metric: 'lab_uptime', threshold: 99.5, severity: 'HIGH' }
];
```

---

## 11. NEXT STEPS

1. **Database Setup**: Run migrations to create all tables
2. **API Development**: Implement endpoints in order of criticality
3. **AI Integration**: Wire up Claude API with result analysis jobs
4. **Web UI**: Create lab portal and doctor result viewer
5. **Testing**: Unit tests, integration tests, load testing
6. **Deployment**: Docker deployment to your VPS

---

## Questions for Refinement

1. **HL7/FHIR Preference**: Do you have lab equipment that already exports in these formats?
2. **NDHM Integration**: Is integration with India's ABDM/NDHM system required?
3. **Multi-facility**: Will each doctor's office have its own lab, or is this centralized?
4. **Existing Lab Systems**: What lab information systems (LIS) need to integrate?
5. **Compliance**: Any other regulatory requirements (data residency, specific audit rules)?

