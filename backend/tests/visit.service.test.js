/**
 * Visit Service Tests
 *
 * Test scenarios:
 *   - Create visit (from appointment and walk-in)
 *   - Check-in visit
 *   - Complete visit
 *   - Get visit
 *   - List visits for date
 *   - Get visit history
 *   - Get visit statistics
 */

const VisitService = require('../src/services/visit.service');

describe('VisitService', () => {
  // Mock database pool
  let mockPool;

  beforeEach(() => {
    mockPool = {
      query: jest.fn(),
    };
  });

  describe('createVisit()', () => {
    test('Creates visit from appointment', async () => {
      const visitData = {
        clinicId: 1,
        patientId: 10,
        appointmentId: 100,
        visitDate: '2026-07-15',
        visitTime: '10:00',
        visitType: 'appointment',
        doctorId: 5,
        queueId: 3,
        tokenNumber: 5,
      };

      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 1000, ...visitData, status: 'pending' }] });

      const result = await VisitService.createVisit(mockPool, visitData);

      expect(result.id).toBe(1000);
      expect(result.status).toBe('pending');
      expect(result.appointmentId).toBe(100);
      expect(mockPool.query).toHaveBeenCalled();
    });

    test('Creates walk-in visit without appointment', async () => {
      const visitData = {
        clinicId: 1,
        patientId: 10,
        appointmentId: null,
        visitDate: '2026-07-15',
        visitTime: '14:30',
        visitType: 'walk_in',
      };

      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 1001, ...visitData, status: 'pending' }] });

      const result = await VisitService.createVisit(mockPool, visitData);

      expect(result.id).toBe(1001);
      expect(result.visitType).toBe('walk_in');
      expect(result.appointmentId).toBeNull();
    });

    test('Throws error if required fields missing', async () => {
      const invalidData = {
        clinicId: 1,
        patientId: 10,
        // missing visitDate
      };

      await expect(VisitService.createVisit(mockPool, invalidData)).rejects.toThrow();
    });

    test('Returns existing visit if already created from same appointment', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 1000 }] }) // Check if exists
        .mockResolvedValueOnce({ rows: [{ id: 1000 }] }); // Return existing

      const result = await VisitService.createVisit(mockPool, {
        clinicId: 1,
        patientId: 10,
        appointmentId: 100,
        visitDate: '2026-07-15',
        visitType: 'appointment',
      });

      expect(result.id).toBe(1000);
    });
  });

  describe('checkInVisit()', () => {
    test('Checks in a pending visit', async () => {
      const mockVisit = {
        id: 1000,
        patient_id: 10,
        clinic_id: 1,
        status: 'pending',
        checked_in_at: null,
      };

      mockPool.query
        .mockResolvedValueOnce({ rows: [mockVisit] }) // Get visit
        .mockResolvedValueOnce({
          rows: [{ ...mockVisit, status: 'checked_in', checked_in_at: new Date() }],
        }); // Update visit

      const result = await VisitService.checkInVisit(mockPool, 1000);

      expect(result.status).toBe('checked_in');
      expect(result.checked_in_at).not.toBeNull();
    });

    test('Throws error if visit already checked in', async () => {
      const checkedInVisit = {
        id: 1000,
        status: 'checked_in',
        checked_in_at: new Date(),
      };

      mockPool.query.mockResolvedValueOnce({ rows: [checkedInVisit] });

      await expect(VisitService.checkInVisit(mockPool, 1000)).rejects.toThrow(
        /already checked_in/
      );
    });

    test('Throws error if visit not found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await expect(VisitService.checkInVisit(mockPool, 9999)).rejects.toThrow(/not found/);
    });

    test('Updates doctor_id, queue_id, token_number on check-in', async () => {
      const mockVisit = { id: 1000, status: 'pending', checked_in_at: null };

      mockPool.query
        .mockResolvedValueOnce({ rows: [mockVisit] })
        .mockResolvedValueOnce({
          rows: [
            {
              ...mockVisit,
              status: 'checked_in',
              checked_in_at: new Date(),
              doctor_id: 5,
              queue_id: 3,
              token_number: 7,
            },
          ],
        });

      const result = await VisitService.checkInVisit(mockPool, 1000, {
        doctorId: 5,
        queueId: 3,
        tokenNumber: 7,
      });

      expect(result.doctor_id).toBe(5);
      expect(result.queue_id).toBe(3);
      expect(result.token_number).toBe(7);
    });
  });

  describe('completeVisit()', () => {
    test('Completes a checked-in visit', async () => {
      const mockVisit = {
        id: 1000,
        status: 'checked_in',
        checked_in_at: new Date('2026-07-15T10:00:00'),
      };

      mockPool.query
        .mockResolvedValueOnce({ rows: [mockVisit] })
        .mockResolvedValueOnce({
          rows: [
            {
              ...mockVisit,
              status: 'completed',
              checked_out_at: new Date('2026-07-15T10:45:00'),
            },
          ],
        });

      const result = await VisitService.completeVisit(mockPool, 1000);

      expect(result.status).toBe('completed');
      expect(result.checked_out_at).not.toBeNull();
    });

    test('Marks visit as no-show', async () => {
      const mockVisit = { id: 1000, status: 'checked_in', checked_in_at: new Date() };

      mockPool.query
        .mockResolvedValueOnce({ rows: [mockVisit] })
        .mockResolvedValueOnce({
          rows: [{ ...mockVisit, status: 'no_show', checked_out_at: new Date() }],
        });

      const result = await VisitService.completeVisit(mockPool, 1000, { status: 'no_show' });

      expect(result.status).toBe('no_show');
    });

    test('Cancels a visit with reason', async () => {
      const mockVisit = { id: 1000, status: 'pending', checked_in_at: null };

      mockPool.query
        .mockResolvedValueOnce({ rows: [mockVisit] })
        .mockResolvedValueOnce({
          rows: [
            {
              ...mockVisit,
              status: 'cancelled',
              cancellation_reason: 'Patient requested cancellation',
            },
          ],
        });

      const result = await VisitService.completeVisit(mockPool, 1000, {
        status: 'cancelled',
        cancellationReason: 'Patient requested cancellation',
      });

      expect(result.status).toBe('cancelled');
      expect(result.cancellation_reason).toBe('Patient requested cancellation');
    });

    test('Throws error for invalid status', async () => {
      await expect(
        VisitService.completeVisit(mockPool, 1000, { status: 'invalid_status' })
      ).rejects.toThrow(/Invalid status/);
    });

    test('Throws error if completing visit not checked-in', async () => {
      const pendingVisit = { id: 1000, status: 'pending', checked_in_at: null };

      mockPool.query.mockResolvedValueOnce({ rows: [pendingVisit] });

      await expect(VisitService.completeVisit(mockPool, 1000)).rejects.toThrow(
        /must be checked in/
      );
    });
  });

  describe('getVisit()', () => {
    test('Returns visit with related data', async () => {
      const mockVisit = {
        id: 1000,
        patient_name: 'John Doe',
        patient_mobile: '9876543210',
        doctor_name: 'Dr. Smith',
        queue_name: 'OPD Queue 1',
        encounter_id: 500,
      };

      mockPool.query.mockResolvedValueOnce({ rows: [mockVisit] });

      const result = await VisitService.getVisit(mockPool, 1000);

      expect(result.patient_name).toBe('John Doe');
      expect(result.doctor_name).toBe('Dr. Smith');
    });

    test('Throws error if visit not found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await expect(VisitService.getVisit(mockPool, 9999)).rejects.toThrow(/not found/);
    });
  });

  describe('listVisitsForDate()', () => {
    test('Lists all visits for a clinic on a specific date', async () => {
      const mockVisits = [
        { id: 1000, token_number: 1, patient_name: 'Patient A' },
        { id: 1001, token_number: 2, patient_name: 'Patient B' },
        { id: 1002, token_number: 3, patient_name: 'Patient C' },
      ];

      mockPool.query.mockResolvedValueOnce({ rows: mockVisits });

      const result = await VisitService.listVisitsForDate(mockPool, 1, '2026-07-15');

      expect(result).toHaveLength(3);
      expect(result[0].token_number).toBe(1);
    });

    test('Filters visits by status', async () => {
      const checkedInVisits = [{ id: 1000, status: 'checked_in' }];

      mockPool.query.mockResolvedValueOnce({ rows: checkedInVisits });

      const result = await VisitService.listVisitsForDate(mockPool, 1, '2026-07-15', {
        status: 'checked_in',
      });

      expect(result).toHaveLength(1);
      expect(result[0].status).toBe('checked_in');
    });

    test('Filters visits by queue and doctor', async () => {
      const filteredVisits = [{ id: 1000, queue_id: 3, doctor_id: 5 }];

      mockPool.query.mockResolvedValueOnce({ rows: filteredVisits });

      const result = await VisitService.listVisitsForDate(mockPool, 1, '2026-07-15', {
        queueId: 3,
        doctorId: 5,
      });

      expect(result[0].queue_id).toBe(3);
    });
  });

  describe('getVisitHistory()', () => {
    test('Returns visit history for a patient', async () => {
      const mockVisits = [
        { id: 1002, visit_date: '2026-07-15', doctor_name: 'Dr. A' },
        { id: 1001, visit_date: '2026-07-10', doctor_name: 'Dr. B' },
        { id: 1000, visit_date: '2026-07-05', doctor_name: 'Dr. A' },
      ];

      mockPool.query.mockResolvedValueOnce({ rows: mockVisits });

      const result = await VisitService.getVisitHistory(mockPool, 10, null, { limit: 20 });

      expect(result).toHaveLength(3);
      expect(result[0].visit_date).toBe('2026-07-15'); // Most recent first
    });

    test('Filters history by clinic', async () => {
      const mockVisits = [{ id: 1000, clinic_id: 1 }];

      mockPool.query.mockResolvedValueOnce({ rows: mockVisits });

      const result = await VisitService.getVisitHistory(mockPool, 10, 1, { limit: 20 });

      expect(result[0].clinic_id).toBe(1);
    });

    test('Respects pagination (limit and offset)', async () => {
      const mockVisits = [
        { id: 1010, visit_date: '2026-07-15' },
        { id: 1009, visit_date: '2026-07-14' },
      ];

      mockPool.query.mockResolvedValueOnce({ rows: mockVisits });

      const result = await VisitService.getVisitHistory(mockPool, 10, null, {
        limit: 2,
        offset: 10,
      });

      expect(result).toHaveLength(2);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT $'),
        expect.arrayContaining([2, 10])
      );
    });
  });

  describe('getVisitStats()', () => {
    test('Returns visit statistics for date range', async () => {
      const mockStats = {
        total_visits: 100,
        completed: 85,
        no_show: 10,
        cancelled: 5,
        checked_in: 0,
        pending: 0,
        walk_ins: 20,
        avg_visit_duration_seconds: 1800,
      };

      mockPool.query.mockResolvedValueOnce({ rows: [mockStats] });

      const result = await VisitService.getVisitStats(mockPool, 1, '2026-07-01', '2026-07-31');

      expect(result.total_visits).toBe(100);
      expect(result.completed).toBe(85);
      expect(result.walk_ins).toBe(20);
      expect(result.avg_visit_duration_seconds).toBe(1800); // 30 minutes average
    });
  });
});

/**
 * Integration Test Scenarios (to be run against real database)
 *
 * Scenario 1: Appointment → Visit → Encounter
 *   1. Create appointment
 *   2. Create visit from appointment
 *   3. Check-in visit
 *   4. Create encounter
 *   5. Complete encounter
 *   ✓ Verify: visit and encounter both have correct timestamps
 *
 * Scenario 2: Walk-in Patient
 *   1. Check-in walk-in (create visit without appointment_id)
 *   2. Create encounter
 *   3. Complete encounter
 *   ✓ Verify: visit.appointment_id is NULL
 *
 * Scenario 3: Multi-visit Same Day
 *   1. Create visit 1 at 10:00 AM
 *   2. Complete visit 1
 *   3. Create visit 2 at 2:00 PM (same patient)
 *   4. Complete visit 2
 *   ✓ Verify: Two separate visit records exist
 *
 * Scenario 4: Visit Statistics
 *   1. Create 100 visits
 *   2. Mark 85 as completed, 10 as no-show, 5 as cancelled
 *   3. Get statistics
 *   ✓ Verify: Statistics reflect correct counts
 */
