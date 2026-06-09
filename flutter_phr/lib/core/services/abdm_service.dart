import 'dart:typed_data';
import 'package:dio/dio.dart';
import '../models/abha_model.dart';
import 'api_service.dart';

class AbdmService {
  final ApiService _api = ApiService();

  // ── M1: Aadhaar enrollment ─────────────────────────────────────────────────

  Future<String> generateAadhaarOtp(String aadhaar) async {
    final r = await _api.post('/abdm/enrol/aadhaar/otp', data: {'aadhaar': aadhaar});
    return r.data['txnId'] as String;
  }

  Future<AbhaAccount> verifyAadhaarOtp(String otp, String txnId, String? mobile) async {
    final r = await _api.post('/abdm/enrol/aadhaar/verify',
        data: {'otp': otp, 'txnId': txnId, if (mobile != null) 'mobile': mobile});
    final profile = r.data['ABHAProfile'] ?? r.data;
    return AbhaAccount.fromJson(profile as Map<String, dynamic>);
  }

  // ── M1: Mobile enrollment ──────────────────────────────────────────────────

  Future<String> generateMobileOtp(String mobile) async {
    final r = await _api.post('/abdm/enrol/mobile/otp', data: {'mobile': mobile});
    return r.data['txnId'] as String;
  }

  Future<Map<String, dynamic>> verifyMobileOtp(String otp, String txnId, String mobile) async {
    final r = await _api.post('/abdm/enrol/mobile/verify',
        data: {'otp': otp, 'txnId': txnId});
    return r.data as Map<String, dynamic>;
  }

  // ── M1: ABHA login ─────────────────────────────────────────────────────────

  Future<String> loginGenerateOtp(String abhaNumber) async {
    final r = await _api.post('/abdm/login/otp', data: {'abhaNumber': abhaNumber});
    return r.data['txnId'] as String;
  }

  Future<void> loginVerifyOtp(String otp, String txnId) async {
    await _api.post('/abdm/login/verify', data: {'otp': otp, 'txnId': txnId});
  }

  Future<void> logoutAbha() async {
    await _api.post('/abdm/logout');
  }

  // ── M1: Status / profile / card ────────────────────────────────────────────

  Future<AbhaAccount> getAbhaStatus() async {
    final r = await _api.get('/abdm/status');
    return AbhaAccount.fromJson(r.data as Map<String, dynamic>);
  }

  Future<Uint8List> getAbhaCard() async {
    final r = await _api.get('/abdm/card', options: Options(responseType: ResponseType.bytes));
    return Uint8List.fromList((r.data as List).cast<int>());
  }

  // ── M2: v3 HIP-initiated linking (replaces dead v0.5 discover flow) ──────────

  Future<List<CareContext>> getAvailableCareContexts(String hipId) async {
    final r = await _api.get('/abdm/care-contexts/available', params: {'hipId': hipId});
    return (r.data as List)
        .map((e) => CareContext.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<void> linkCareContextsDirect({
    required String hipId,
    required List<CareContext> contexts,
    String gender = 'M',
    int yearOfBirth = 1990,
  }) async {
    await _api.post('/abdm/care-contexts/link', data: {
      'hipId': hipId,
      'careContexts': contexts.map((c) => {
        'referenceNumber': c.referenceNumber,
        'display': c.display,
        'hiType': c.hiType,
      }).toList(),
      'patientGender': gender,
      'patientYearOfBirth': yearOfBirth,
    });
  }

  Future<List<CareContext>> getLinkedCareContexts() async {
    final r = await _api.get('/abdm/care-contexts');
    return (r.data as List)
        .map((e) => CareContext.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  // ── M2: Consent management ─────────────────────────────────────────────────

  Future<void> createConsentRequest({
    required String hiuId,
    required String purpose,
    required List<String> hiTypes,
    DateTime? dateFrom,
    DateTime? dateTo,
  }) async {
    await _api.post('/abdm/consents', data: {
      'hiuId': hiuId,
      'purpose': purpose,
      'hiTypes': hiTypes,
      if (dateFrom != null) 'dateFrom': dateFrom.toIso8601String(),
      if (dateTo != null) 'dateTo': dateTo.toIso8601String(),
    });
  }

  Future<List<ConsentRequest>> getConsentRequests() async {
    final r = await _api.get('/abdm/consents');
    return (r.data as List)
        .map((e) => ConsentRequest.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<void> respondToConsent(String requestId, String action) async {
    await _api.post('/abdm/consents/$requestId/respond', data: {'action': action});
  }

  // ── M3: Health records ─────────────────────────────────────────────────────

  Future<List<HealthRecord>> getHealthRecords() async {
    final r = await _api.get('/abdm/health-records');
    return (r.data as List)
        .map((e) => HealthRecord.fromJson(e as Map<String, dynamic>))
        .toList();
  }
}
