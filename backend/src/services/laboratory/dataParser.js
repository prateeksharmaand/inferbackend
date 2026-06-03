/**
 * Laboratory Data Parser & Normalizer
 * Supports: HL7 v2, FHIR JSON, PDF (with OCR), CSV
 * All formats convert to internal lab result schema
 */

const hl7 = require('simple-hl7');
const pdfParse = require('pdf-parse');
const Tesseract = require('tesseract.js');
const csv = require('csv-parse/sync');

class LabDataParser {
  /**
   * Main entry point: detect format and parse accordingly
   */
  async parseLabData(rawData, sourceFormat) {
    switch (sourceFormat.toUpperCase()) {
      case 'HL7':
        return this.parseHL7(rawData);
      case 'FHIR':
        return this.parseFHIR(rawData);
      case 'PDF':
        return this.parsePDF(rawData);
      case 'CSV':
        return this.parseCSV(rawData);
      default:
        throw new Error(`Unsupported format: ${sourceFormat}`);
    }
  }

  /**
   * Parse HL7 v2 messages (most common from lab equipment)
   * Example: Beckman Coulter, Siemens, Roche machines
   */
  async parseHL7(hl7Message) {
    try {
      const msg = hl7.parse(hl7Message);

      // Extract key segments
      const msh = msg.get('MSH'); // Message header
      const pid = msg.get('PID'); // Patient identification
      const obr = msg.get('OBR'); // Observation request
      const obx = msg.getSegments('OBX'); // Observations (results)

      const patientId = pid ? pid.get('PID.3').toString() : null; // MRN
      const specimenId = obr ? obr.get('OBR.3').toString() : null;
      const orderDateTime = obr ? obr.get('OBR.7').toString() : new Date().toISOString();

      // Parse each observation (can have multiple tests per message)
      const results = obx.map((observation, index) => {
        const loincCode = observation.get('OBX.3.1').toString(); // LOINC code
        const testName = observation.get('OBX.3.2').toString();
        const value = observation.get('OBX.5.1').toString();
        const unit = observation.get('OBX.6.1').toString();
        const referenceRange = observation.get('OBX.7').toString();
        const resultStatus = observation.get('OBX.11').toString() || 'FINAL';

        return {
          test_code: loincCode,
          test_name: testName,
          result_value: this.parseNumericValue(value),
          result_unit: unit,
          reference_range: referenceRange,
          reference_range_low: this.extractRangeLow(referenceRange),
          reference_range_high: this.extractRangeHigh(referenceRange),
          result_status: this.normalizeStatus(resultStatus),
          specimen_type: obr ? obr.get('OBR.15').toString() : 'UNKNOWN',
          collection_timestamp: orderDateTime,
          source_format: 'HL7',
          raw_message: hl7Message // Store original for audit
        };
      });

      return {
        patient_id: patientId,
        results: results,
        message_id: msh ? msh.get('MSH.10').toString() : null,
        sending_facility: msh ? msh.get('MSH.3').toString() : null,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      throw new Error(`HL7 Parse Error: ${error.message}`);
    }
  }

  /**
   * Parse FHIR DiagnosticReport JSON
   * Modern standard used by newer lab systems and healthcare integrations
   */
  async parseFHIR(fhirJson) {
    try {
      const report =
        typeof fhirJson === 'string' ? JSON.parse(fhirJson) : fhirJson;

      if (report.resourceType !== 'DiagnosticReport') {
        throw new Error('Expected resourceType: DiagnosticReport');
      }

      const patientId = report.subject?.reference?.split('/')[1];
      const reportDate =
        report.issued || report.effectiveDateTime || new Date().toISOString();

      const results = [];

      // Process result references
      if (report.result && Array.isArray(report.result)) {
        for (const resultRef of report.result) {
          // In real system, would fetch referenced Observation
          // For now, assume observations included in the payload
          if (resultRef.observation) {
            const obs = resultRef.observation;

            const loincCode =
              obs.code?.coding?.find((c) => c.system.includes('loinc'))?.code ||
              obs.code?.coding?.[0]?.code;

            results.push({
              test_code: loincCode,
              test_name: obs.code?.text || obs.code?.coding?.[0]?.display,
              result_value: this.parseNumericValue(obs.value?.value),
              result_unit:
                obs.value?.unit || obs.valueQuantity?.unit || 'UNKNOWN',
              reference_range:
                obs.referenceRange?.[0]?.text ||
                `${obs.referenceRange?.[0]?.low?.value}-${obs.referenceRange?.[0]?.high?.value}`,
              reference_range_low: obs.referenceRange?.[0]?.low?.value,
              reference_range_high: obs.referenceRange?.[0]?.high?.value,
              result_status: obs.status || 'FINAL',
              collection_timestamp: obs.issued || reportDate,
              interpretation:
                obs.interpretation?.[0]?.coding?.[0]?.code || null,
              source_format: 'FHIR',
              raw_json: report // Store original
            });
          }
        }
      }

      return {
        patient_id: patientId,
        results: results,
        report_id: report.id,
        report_date: reportDate,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      throw new Error(`FHIR Parse Error: ${error.message}`);
    }
  }

  /**
   * Parse PDF lab reports using OCR
   * Extracts text and attempts to match common lab result patterns
   */
  async parsePDF(pdfBuffer) {
    try {
      // Extract text from PDF
      const data = await pdfParse(pdfBuffer);
      const pdfText = data.text;

      // Try OCR if text extraction weak
      let extractedText = pdfText;
      if (pdfText.split('\n').length < 5) {
        // Text extraction failed, use Tesseract OCR
        console.log('Low text extraction, running OCR...');
        const ocrResult = await Tesseract.recognize(pdfBuffer, 'eng');
        extractedText = ocrResult.data.text;
      }

      // Parse extracted text for lab values
      const results = this.extractLabValuesFromText(extractedText);

      return {
        results: results,
        extracted_text: extractedText,
        ocr_confidence: extractedText === pdfText ? 1.0 : 0.7,
        source_format: 'PDF',
        raw_pdf_buffer: pdfBuffer // Store original
      };
    } catch (error) {
      throw new Error(`PDF Parse Error: ${error.message}`);
    }
  }

  /**
   * Parse CSV lab result exports
   */
  async parseCSV(csvContent) {
    try {
      const records = csv.parse(csvContent, {
        columns: true, // Use first row as headers
        skip_empty_lines: true
      });

      const results = records.map((record) => ({
        test_code: record.loinc_code || record.test_code || 'UNKNOWN',
        test_name: record.test_name || record.test,
        result_value: this.parseNumericValue(record.result_value || record.value),
        result_unit: record.unit || record.units || 'UNKNOWN',
        reference_range: `${record.ref_low || record.reference_low}-${record.ref_high || record.reference_high}`,
        reference_range_low: this.parseNumericValue(
          record.ref_low || record.reference_low
        ),
        reference_range_high: this.parseNumericValue(
          record.ref_high || record.reference_high
        ),
        result_status: record.status || 'FINAL',
        specimen_type: record.specimen_type || 'UNKNOWN',
        collection_timestamp: record.collection_date || new Date().toISOString(),
        source_format: 'CSV'
      }));

      return {
        results: results,
        record_count: records.length,
        source_format: 'CSV',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      throw new Error(`CSV Parse Error: ${error.message}`);
    }
  }

  /**
   * Helper: Extract numeric value from various formats
   */
  parseNumericValue(value) {
    if (!value) return null;
    const num = parseFloat(String(value).replace(/[^\d.-]/g, ''));
    return isNaN(num) ? null : num;
  }

  /**
   * Helper: Extract low value from range string
   * Handles formats like "70-100", "<100", ">50", "normal"
   */
  extractRangeLow(rangeStr) {
    if (!rangeStr) return null;
    const match = rangeStr.match(/(\d+\.?\d*)/);
    if (match) return parseFloat(match[0]);
    return null;
  }

  /**
   * Helper: Extract high value from range string
   */
  extractRangeHigh(rangeStr) {
    if (!rangeStr) return null;
    const matches = rangeStr.match(/(\d+\.?\d*)/g);
    if (matches && matches.length > 1) {
      return parseFloat(matches[matches.length - 1]);
    }
    if (matches && matches.length === 1) {
      return parseFloat(matches[0]);
    }
    return null;
  }

  /**
   * Helper: Normalize result status to standard values
   */
  normalizeStatus(status) {
    const statusMap = {
      F: 'FINAL',
      P: 'PRELIMINARY',
      C: 'CORRECTED',
      A: 'AMENDED',
      X: 'CANCELLED',
      N: 'NEW'
    };
    return statusMap[status] || status.toUpperCase();
  }

  /**
   * Helper: Extract lab values from raw text (for PDF/OCR)
   * Looks for common patterns like "Test: 123 mg/dL (70-100)"
   */
  extractLabValuesFromText(text) {
    const results = [];

    // Common patterns in lab reports
    const patterns = [
      // Pattern: "Test Name: 123 mg/dL (70-100)"
      /([A-Za-z\s]+?):\s*([\d.]+)\s*([\w/]+)\s*\(?([\d.-]+)?\s*-\s*([\d.-]+)?\)?/g,
      // Pattern: "Test Name | 123 | mg/dL | 70-100"
      /([A-Za-z\s]+)\s*\|\s*([\d.]+)\s*\|\s*([\w/]+)\s*\|\s*([\d.-]+)-([\d.-]+)/g
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        results.push({
          test_name: match[1].trim(),
          result_value: this.parseNumericValue(match[2]),
          result_unit: match[3] || 'UNKNOWN',
          reference_range_low: this.parseNumericValue(match[4]),
          reference_range_high: this.parseNumericValue(match[5]),
          source_format: 'PDF',
          extraction_confidence: 0.7 // OCR extracted - lower confidence
        });
      }
    }

    return results;
  }
}

module.exports = new LabDataParser();
