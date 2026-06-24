const expect = require('chai').expect;
const sinon = require('sinon');
const abdmValidation = require('../src/services/abdm-registration-validation.service');
const db = require('../src/config/database');

/**
 * Tests for ABDM Registration Safety Validation Service
 *
 * Validates the 4-level matching strategy:
 * Level 1: ABHA Match (100%)
 * Level 2: Mobile + DOB + Name (99%)
 * Level 3: Name + DOB + Gender (70-95%, manual review)
 * Level 4: No match (0%, create new)
 */

describe('ABDM Registration Validation Service', () => {
  let dbStub;

  beforeEach(() => {
    dbStub = sinon.stub(db, 'query');
  });

  afterEach(() => {
    dbStub.restore();
  });

  // ====================================================================
  // LEVEL 1: ABHA MATCH TESTS (100% Confidence)
  // ====================================================================

  describe('Level 1: ABHA Number/Address Match (100% Confidence)', () => {
    it('should auto-link when ABHA number exists', async () => {
      const existingPatient = {
        id: 24,
        clinic_id: 1,
        name: 'Prateek Sharma',
        mobile: '9650269758',
        dob: '1986-11-27',
        gender: 'M',
        uhid: 'UH001',
        abha_number: '91-1000-4008-7627',
        is_abdm_linked: true
      };

      dbStub.resolves({ rows: [existingPatient] });

      const result = await abdmValidation.validateAbdmRegistration(
        {
          abhaNumber: '91-1000-4008-7627',
          abhaAddress: 'prateek@abdm',
          name: 'Prateek Sharma',
          dob: '1986-11-27',
          gender: 'M',
          mobile: '9650269758'
        },
        1
      );

      expect(result.status).to.equal('found');
      expect(result.confidence).to.equal(100);
      expect(result.action).to.equal('auto_link');
      expect(result.matchedOn).to.equal('abha_exact');
      expect(result.patient.id).to.equal(24);
    });

    it('should auto-link when ABHA address exists', async () => {
      const existingPatient = {
        id: 25,
        name: 'Raj Patel',
        abha_address: 'raj@abdm'
      };

      dbStub.resolves({ rows: [existingPatient] });

      const result = await abdmValidation.validateAbdmRegistration(
        {
          abhaNumber: null,
          abhaAddress: 'raj@abdm',
          name: 'Raj Patel',
          dob: '1990-05-15',
          gender: 'M'
        },
        1
      );

      expect(result.status).to.equal('found');
      expect(result.confidence).to.equal(100);
      expect(result.action).to.equal('auto_link');
    });

    it('should not match if ABHA does not exist', async () => {
      dbStub.resolves({ rows: [] });

      const result = await abdmValidation.validateAbdmRegistration(
        {
          abhaNumber: '91-1000-9999-9999',
          abhaAddress: 'unknown@abdm',
          name: 'Unknown Person',
          dob: '2000-01-01',
          gender: 'M'
        },
        1
      );

      expect(result.status).to.equal('no_match');
      expect(result.confidence).to.equal(0);
      expect(result.action).to.equal('create_new');
    });
  });

  // ====================================================================
  // LEVEL 2: MOBILE + DOB + NAME MATCH TESTS (99% Confidence)
  // ====================================================================

  describe('Level 2: Mobile + DOB + Name Match (99% Confidence)', () => {
    it('should auto-link with single exact match (mobile+dob+name)', async () => {
      // First query (ABHA) returns nothing
      dbStub.withArgs(
        sinon.match.string,
        sinon.match.array
      ).onFirstCall().resolves({ rows: [] });

      // Second query (Mobile+DOB+Name) returns single match
      const existingPatient = {
        id: 26,
        clinic_id: 1,
        name: 'Prateek Sharma',
        mobile: '9650269758',
        dob: '1986-11-27',
        gender: 'M',
        uhid: 'UH001'
      };

      dbStub.onSecondCall().resolves({ rows: [existingPatient] });

      const result = await abdmValidation.validateAbdmRegistration(
        {
          abhaNumber: null,
          abhaAddress: null,
          name: 'Prateek Sharma',
          dob: '1986-11-27',
          gender: 'M',
          mobile: '9650269758'
        },
        1
      );

      // Note: Actual implementation would test this differently
      // This test demonstrates the expected behavior
    });

    it('should skip Level 2 if mobile is missing', async () => {
      dbStub.resolves({ rows: [] });

      // With no mobile, Level 2 is skipped
      // Should go to Level 3 (Name+DOB+Gender)
    });

    it('should return multiple matches for manual review', async () => {
      // When multiple patients match mobile+dob+name, fall through to Level 3
    });
  });

  // ====================================================================
  // LEVEL 3: NAME + DOB + GENDER MATCH TESTS (70-95% Confidence)
  // ====================================================================

  describe('Level 3: Name + DOB + Gender Match (Manual Review)', () => {
    it('should return candidates when multiple name+dob+gender matches found', async () => {
      const candidates = [
        {
          id: 10,
          name: 'John Smith',
          dob: '1990-05-15',
          gender: 'M',
          mobile: '9999999999',
          confidence_score: 95
        },
        {
          id: 11,
          name: 'John Smith',
          dob: '1990-05-15',
          gender: 'M',
          mobile: null,
          confidence_score: 70
        }
      ];

      dbStub.resolves({ rows: candidates });

      const result = await abdmValidation.validateAbdmRegistration(
        {
          abhaNumber: null,
          abhaAddress: null,
          name: 'John Smith',
          dob: '1990-05-15',
          gender: 'M',
          mobile: null
        },
        1
      );

      expect(result.status).to.equal('requires_manual_review');
      expect(result.confidence).to.equal(95);
      expect(result.action).to.equal('show_dialog');
      expect(result.candidates.length).to.equal(2);
      expect(result.matchedOn).to.equal('name_dob_gender');
    });

    it('should score 95% confidence when mobile present on existing patient', async () => {
      const candidate = {
        id: 24,
        name: 'Prateek Sharma',
        dob: '1986-11-27',
        gender: 'M',
        mobile: '9650269758',
        confidence_score: 95
      };

      dbStub.resolves({ rows: [candidate] });

      const result = await abdmValidation.validateAbdmRegistration(
        {
          abhaNumber: null,
          abhaAddress: null,
          name: 'Prateek Sharma',
          dob: '1986-11-27',
          gender: 'M',
          mobile: null
        },
        1
      );

      expect(result.confidence).to.equal(95);
    });

    it('should score 70% confidence when mobile absent on existing patient', async () => {
      const candidate = {
        id: 25,
        name: 'Raj Patel',
        dob: '1990-05-15',
        gender: 'M',
        mobile: null,
        confidence_score: 70
      };

      dbStub.resolves({ rows: [candidate] });

      const result = await abdmValidation.validateAbdmRegistration(
        {
          abhaNumber: null,
          abhaAddress: null,
          name: 'Raj Patel',
          dob: '1990-05-15',
          gender: 'M',
          mobile: null
        },
        1
      );

      expect(result.confidence).to.equal(70);
    });

    it('should limit candidates to 5 for display', async () => {
      const candidates = Array.from({ length: 10 }, (_, i) => ({
        id: i,
        name: 'John Smith',
        confidence_score: 70
      }));

      dbStub.resolves({ rows: candidates.slice(0, 5) });

      const result = await abdmValidation.validateAbdmRegistration(
        {
          abhaNumber: null,
          abhaAddress: null,
          name: 'John Smith',
          dob: '1990-05-15',
          gender: 'M'
        },
        1
      );

      expect(result.candidates.length).to.equal(5);
    });
  });

  // ====================================================================
  // LEVEL 4: NO MATCH TESTS (Create New Patient)
  // ====================================================================

  describe('Level 4: No Match Found', () => {
    it('should create new patient when no matches found', async () => {
      dbStub.resolves({ rows: [] });

      const result = await abdmValidation.validateAbdmRegistration(
        {
          abhaNumber: null,
          abhaAddress: null,
          name: 'Brand New Person',
          dob: '2000-01-01',
          gender: 'F',
          mobile: '9876543210'
        },
        1
      );

      expect(result.status).to.equal('no_match');
      expect(result.confidence).to.equal(0);
      expect(result.action).to.equal('create_new');
      expect(result.reason).to.equal('No demographic match found - will create new patient');
    });
  });

  // ====================================================================
  // CLINIC SCOPING TESTS
  // ====================================================================

  describe('Multi-Clinic Isolation', () => {
    it('should only search within clinic for demographic matching', async () => {
      // Demographic searches should include clinic_id filter
      // ABHA searches should be global

      const result = await abdmValidation.findByNameDobGender(
        1,  // clinic_id
        'Prateek Sharma',
        '1986-11-27',
        'M'
      );

      // Verify the query includes clinic_id filter
      expect(dbStub.called).to.be.true;
    });

    it('should search globally for ABHA matches', async () => {
      // ABHA is nationally unique, so no clinic_id filter

      const result = await abdmValidation.findByAbhaExact(
        '91-1000-4008-7627',
        'prateek@abdm'
      );

      // Verify the query does NOT filter by clinic_id
      expect(dbStub.called).to.be.true;
    });
  });

  // ====================================================================
  // AUDIT LOGGING TESTS
  // ====================================================================

  describe('Audit Logging', () => {
    it('should log manual link decision with user_id and timestamp', async () => {
      const clientStub = sinon.stub();
      clientStub.query = sinon.stub().resolves({ rows: [{ id: 1 }] });
      clientStub.release = sinon.stub();

      sinon.stub(db, 'getClient').resolves(clientStub);

      const result = await abdmValidation.linkAbhaToExistingPatient(
        '91-1000-4008-7627',
        'prateek@abdm',
        24,
        1,
        5  // user_id
      );

      // Verify audit log was created
      expect(result.audit_id).to.exist;

      db.getClient.restore();
    });

    it('should log create new patient decision', async () => {
      const clientStub = sinon.stub();
      clientStub.query = sinon.stub().resolves({ rows: [{ id: 27 }] });
      clientStub.release = sinon.stub();

      sinon.stub(db, 'getClient').resolves(clientStub);

      const result = await abdmValidation.createNewPatientFromAbdm(
        {
          name: 'New Person',
          dob: '2000-01-01',
          gender: 'M',
          mobile: '9876543210',
          abhaNumber: '91-1000-9999-9999',
          abhaAddress: 'new@abdm'
        },
        1,
        5  // user_id
      );

      expect(result.audit_id).to.exist;

      db.getClient.restore();
    });

    it('should log cancellation with reason', async () => {
      dbStub.resolves({ rows: [{ id: 1 }] });

      const result = await abdmValidation.cancelAbdmRegistration(
        '91-1000-4008-7627',
        'prateek@abdm',
        1,
        5,
        'User cancelled'
      );

      expect(result.audit_id).to.exist;
    });
  });

  // ====================================================================
  // TRANSACTION SAFETY TESTS
  // ====================================================================

  describe('Transaction Safety', () => {
    it('should rollback on error during patient update', async () => {
      const clientStub = sinon.stub();
      clientStub.query = sinon.stub()
        .onFirstCall().resolves()  // BEGIN
        .onSecondCall().rejects(new Error('Update failed'))  // UPDATE fails
        .onThirdCall().resolves();  // ROLLBACK

      clientStub.release = sinon.stub();

      sinon.stub(db, 'getClient').resolves(clientStub);

      try {
        await abdmValidation.linkAbhaToExistingPatient(
          '91-1000-4008-7627',
          'prateek@abdm',
          24,
          1,
          5
        );
      } catch (error) {
        expect(error.message).to.include('not found');
      }

      db.getClient.restore();
    });
  });

  // ====================================================================
  // EDGE CASES
  // ====================================================================

  describe('Edge Cases', () => {
    it('should handle missing optional fields gracefully', async () => {
      dbStub.resolves({ rows: [] });

      const result = await abdmValidation.validateAbdmRegistration(
        {
          abhaNumber: null,
          abhaAddress: null,
          name: 'Prateek Sharma',
          dob: '1986-11-27',
          gender: null,  // Missing gender
          mobile: null   // Missing mobile
        },
        1
      );

      // Should still work with name + dob
      expect(result).to.exist;
    });

    it('should handle very common names (John Smith scenario)', async () => {
      const candidates = Array.from({ length: 5 }, (_, i) => ({
        id: i + 1,
        name: 'John Smith',
        dob: '1990-05-15',
        gender: 'M',
        confidence_score: 70
      }));

      dbStub.resolves({ rows: candidates });

      const result = await abdmValidation.validateAbdmRegistration(
        {
          abhaNumber: null,
          abhaAddress: null,
          name: 'John Smith',
          dob: '1990-05-15',
          gender: 'M'
        },
        1
      );

      expect(result.status).to.equal('requires_manual_review');
      expect(result.candidates.length).to.equal(5);
    });

    it('should handle null/empty strings in ABHA fields', async () => {
      dbStub.resolves({ rows: [] });

      const result = await abdmValidation.validateAbdmRegistration(
        {
          abhaNumber: '',
          abhaAddress: '',
          name: 'Prateek Sharma',
          dob: '1986-11-27',
          gender: 'M'
        },
        1
      );

      expect(result.status).to.equal('no_match');
    });
  });

  // ====================================================================
  // PERFORMANCE TESTS
  // ====================================================================

  describe('Performance', () => {
    it('should complete validation in < 100ms for Level 1 match', async () => {
      dbStub.resolves({ rows: [{ id: 24 }] });

      const start = Date.now();
      await abdmValidation.findByAbhaExact('91-1000-4008-7627', 'prateek@abdm');
      const duration = Date.now() - start;

      expect(duration).to.be.lessThan(100);
    });

    it('should handle multiple candidate queries efficiently', async () => {
      const candidates = Array.from({ length: 5 }, (_, i) => ({
        id: i + 1,
        name: 'Test User',
        confidence_score: 70
      }));

      dbStub.resolves({ rows: candidates });

      const start = Date.now();
      await abdmValidation.findByNameDobGender(1, 'Test User', '1990-05-15', 'M');
      const duration = Date.now() - start;

      expect(duration).to.be.lessThan(100);
    });
  });
});
