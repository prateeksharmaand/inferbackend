/**
 * Patient Matching Service v2.0 Tests
 *
 * Tests for 4-tier matching strategy:
 *   Level 1: ABHA (100% confidence)
 *   Level 2: Mobile+DOB+Name (99% confidence)
 *   Level 3: Mobile+Name (95% confidence)
 *   Level 4: Manual Review
 */

const { findOrCreatePatient, searchPatients } = require('../src/services/patient-match.service.v2');

// Mock database pool
let mockQuery = jest.fn();
const mockPool = { query: mockQuery };

beforeEach(() => {
  mockQuery.mockClear();
});

describe('Patient Matching Service v2.0', () => {
  describe('Level 1: ABHA Matching', () => {
    test('Find patient by ABHA Number (100% confidence)', async () => {
      const existingPatient = {
        id: 123,
        name: 'Rajesh Sharma',
        mobile: '9650269758',
        dob: '1985-03-15',
        gender: 'M'
      };

      mockQuery
        .mockResolvedValueOnce({ rows: [existingPatient] }) // abha_mappings lookup
        .mockResolvedValueOnce({}); // attachToClinic

      const result = await findOrCreatePatient(mockPool, {
        abhaNumber: 'raj@abdm',
        name: 'Rajesh Sharma',
        mobile: '9650269758',
        clinicId: 1
      });

      expect(result.patient).toEqual(existingPatient);
      expect(result.created).toBe(false);
      expect(result.matchedBy).toBe('abha_number');
      expect(result.confidence).toBe(100);
      expect(result.requiresManualReview).toBe(false);
    });

    test('Find patient by ABHA Address when number unavailable (100% confidence)', async () => {
      const existingPatient = {
        id: 124,
        name: 'Raj Sharma',
        mobile: '9650269758',
        dob: '1985-03-15',
        gender: 'M'
      };

      mockQuery
        .mockResolvedValueOnce({ rows: [] }) // abha_number not found
        .mockResolvedValueOnce({ rows: [existingPatient] }) // abha_address found
        .mockResolvedValueOnce({}); // attachToClinic

      const result = await findOrCreatePatient(mockPool, {
        abhaAddress: 'raj@sbx',
        name: 'Raj Sharma',
        clinicId: 1
      });

      expect(result.patient).toEqual(existingPatient);
      expect(result.matchedBy).toBe('abha_address');
      expect(result.confidence).toBe(100);
    });
  });

  describe('Level 2: Mobile+DOB+Name Matching', () => {
    test('Single match on Mobile+DOB+Name (99% confidence)', async () => {
      const existingPatient = {
        id: 123,
        name: 'Rajesh Sharma',
        mobile: '9650269758',
        dob: '1985-03-15',
        gender: 'M'
      };

      mockQuery
        .mockResolvedValueOnce({ rows: [] }) // abha_number not found
        .mockResolvedValueOnce({ rows: [] }) // abha_address not found
        .mockResolvedValueOnce({ rows: [existingPatient] }) // Level 2 match
        .mockResolvedValueOnce({}); // attachToClinic

      const result = await findOrCreatePatient(mockPool, {
        mobile: '9650269758',
        name: 'Rajesh Sharma',
        dob: '1985-03-15',
        clinicId: 1
      });

      expect(result.patient).toEqual(existingPatient);
      expect(result.created).toBe(false);
      expect(result.matchedBy).toBe('mobile_dob_name');
      expect(result.confidence).toBe(99);
      expect(result.requiresManualReview).toBe(false);
    });

    test('Multiple matches on Mobile+DOB+Name → Manual Review (Level 4)', async () => {
      const candidates = [
        { id: 123, name: 'Rajesh Sharma', mobile: '9650269758', dob: '1985-03-15', gender: 'M' },
        { id: 124, name: 'Rajesh Sharma', mobile: '9650269758', dob: '1985-03-15', gender: 'M' }
      ];

      mockQuery
        .mockResolvedValueOnce({ rows: [] }) // abha_number not found
        .mockResolvedValueOnce({ rows: [] }) // abha_address not found
        .mockResolvedValueOnce({ rows: candidates }); // Level 2 multiple matches

      const result = await findOrCreatePatient(mockPool, {
        mobile: '9650269758',
        name: 'Rajesh Sharma',
        dob: '1985-03-15',
        clinicId: 1
      });

      expect(result.patient).toBeNull();
      expect(result.requiresManualReview).toBe(true);
      expect(result.matchedBy).toBe('mobile_dob_name_multiple');
      expect(result.candidates.length).toBe(2);
      expect(result.confidence).toBe(0);
    });
  });

  describe('Level 3: Mobile+Name Matching', () => {
    test('Single match on Mobile+Name (95% confidence)', async () => {
      const existingPatient = {
        id: 123,
        name: 'Rajesh Sharma',
        mobile: '9650269758',
        dob: '1985-03-15',
        gender: 'M'
      };

      mockQuery
        .mockResolvedValueOnce({ rows: [] }) // abha_number not found
        .mockResolvedValueOnce({ rows: [] }) // abha_address not found
        .mockResolvedValueOnce({ rows: [] }) // Level 2 (no DOB provided)
        .mockResolvedValueOnce({ rows: [existingPatient] }) // Level 3 match
        .mockResolvedValueOnce({}) // attachToClinic
        .mockResolvedValueOnce({}); // updatePatientDemographics

      const result = await findOrCreatePatient(mockPool, {
        mobile: '9650269758',
        name: 'Rajesh Sharma',
        dob: '1990-05-20', // Different DOB - will update
        clinicId: 1
      });

      expect(result.patient).toEqual(existingPatient);
      expect(result.created).toBe(false);
      expect(result.matchedBy).toBe('mobile_name');
      expect(result.confidence).toBe(95);
      expect(result.requiresManualReview).toBe(false);
    });

    test('Multiple matches on Mobile+Name → Manual Review (Level 4)', async () => {
      const candidates = [
        { id: 123, name: 'Raj Sharma', mobile: '9650269758', dob: '1985-03-15', gender: 'M' },
        { id: 124, name: 'Raj Sharma', mobile: '9650269758', dob: '1990-05-20', gender: 'M' },
        { id: 125, name: 'Raj Sharma', mobile: '9650269758', dob: '2000-01-01', gender: 'F' }
      ];

      mockQuery
        .mockResolvedValueOnce({ rows: [] }) // abha_number not found
        .mockResolvedValueOnce({ rows: [] }) // abha_address not found
        .mockResolvedValueOnce({ rows: [] }) // Level 2 (no DOB or multiple DOBs)
        .mockResolvedValueOnce({ rows: candidates }); // Level 3 multiple matches

      const result = await findOrCreatePatient(mockPool, {
        mobile: '9650269758',
        name: 'Raj Sharma',
        clinicId: 1
      });

      expect(result.patient).toBeNull();
      expect(result.requiresManualReview).toBe(true);
      expect(result.matchedBy).toBe('mobile_name_multiple');
      expect(result.candidates.length).toBe(3);
    });
  });

  describe('Level 4: Create New Patient', () => {
    test('No match at any level → Create new patient', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] }) // abha_number not found
        .mockResolvedValueOnce({ rows: [] }) // abha_address not found
        .mockResolvedValueOnce({ rows: [] }) // Level 2 no match
        .mockResolvedValueOnce({ rows: [] }) // Level 3 no match
        .mockResolvedValueOnce({
          rows: [{
            id: 999,
            name: 'New Patient',
            mobile: '9876543210',
            dob: '1990-01-01',
            gender: 'F'
          }]
        }) // Create new patient
        .mockResolvedValueOnce({}); // attachToClinic

      const result = await findOrCreatePatient(mockPool, {
        name: 'New Patient',
        mobile: '9876543210',
        dob: '1990-01-01',
        gender: 'F',
        clinicId: 1
      });

      expect(result.created).toBe(true);
      expect(result.patient.id).toBe(999);
      expect(result.matchedBy).toBeNull();
      expect(result.confidence).toBe(0);
    });

    test('Create patient with ABHA attachment', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] }) // abha_number not found
        .mockResolvedValueOnce({ rows: [] }) // abha_address not found
        .mockResolvedValueOnce({ rows: [] }) // Level 2 no match
        .mockResolvedValueOnce({ rows: [] }) // Level 3 no match
        .mockResolvedValueOnce({
          rows: [{
            id: 999,
            name: 'New Patient',
            mobile: '9876543210',
            dob: '1990-01-01',
            gender: 'F'
          }]
        }) // Create new patient
        .mockResolvedValueOnce({}) // attachToClinic
        .mockResolvedValueOnce({}) // attachAbha (abha_mappings insert)
        .mockResolvedValueOnce({}) // Update legacy abha_number column
        .mockResolvedValueOnce({}); // Update legacy abha_address column

      const result = await findOrCreatePatient(mockPool, {
        name: 'New Patient',
        mobile: '9876543210',
        dob: '1990-01-01',
        gender: 'F',
        abhaNumber: 'newpatient@abdm',
        abhaAddress: 'newpatient@sbx',
        clinicId: 1,
        source: 'abdm'
      });

      expect(result.created).toBe(true);
      expect(result.patient.id).toBe(999);
    });
  });

  describe('Phone Normalization in Matching', () => {
    test('Matches despite different phone formats', async () => {
      const existingPatient = {
        id: 123,
        name: 'Rajesh Sharma',
        mobile: '9650269758',
        dob: '1985-03-15',
        gender: 'M'
      };

      mockQuery
        .mockResolvedValueOnce({ rows: [] }) // abha_number not found
        .mockResolvedValueOnce({ rows: [] }) // abha_address not found
        .mockResolvedValueOnce({
          rows: [existingPatient]
        }) // Level 3 match with normalized mobile
        .mockResolvedValueOnce({}); // attachToClinic

      const result = await findOrCreatePatient(mockPool, {
        mobile: '+91-9650-269758', // Different format
        name: 'Rajesh Sharma',
        clinicId: 1
      });

      expect(result.patient.id).toBe(123);
      expect(result.matchedBy).toBe('mobile_name');
    });
  });

  describe('Multi-Clinic Isolation', () => {
    test('Mobile+Name match scoped to clinic', async () => {
      const existingPatient = {
        id: 123,
        name: 'Rajesh Sharma',
        mobile: '9650269758',
        dob: '1985-03-15',
        gender: 'M'
      };

      mockQuery
        .mockResolvedValueOnce({ rows: [] }) // abha_number not found
        .mockResolvedValueOnce({ rows: [] }) // abha_address not found
        .mockResolvedValueOnce({ rows: [] }) // Level 2 no match (clinic=2)
        .mockResolvedValueOnce({
          rows: [existingPatient]
        }) // Level 3 match in clinic 2
        .mockResolvedValueOnce({}); // attachToClinic

      const result = await findOrCreatePatient(mockPool, {
        mobile: '9650269758',
        name: 'Rajesh Sharma',
        clinicId: 2
      });

      // Verify clinic_id is passed to queries
      const query3 = mockQuery.mock.calls[2]; // Level 3 query
      expect(query3[1][0]).toBe(2); // First parameter should be clinicId
    });
  });

  describe('Error Handling', () => {
    test('Throws error if patient name missing', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] }) // abha_number not found
        .mockResolvedValueOnce({ rows: [] }) // abha_address not found
        .mockResolvedValueOnce({ rows: [] }) // Level 2 (will match)
        .mockResolvedValueOnce({ rows: [] }); // Level 3 (will match)

      await expect(
        findOrCreatePatient(mockPool, {
          mobile: '9650269758',
          clinicId: 1
          // missing name
        })
      ).rejects.toThrow('Patient name is required');
    });
  });
});
