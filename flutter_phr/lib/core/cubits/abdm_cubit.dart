import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:equatable/equatable.dart';
import '../models/abha_model.dart';
import '../services/abdm_service.dart';

// ── State ──────────────────────────────────────────────────────────────────────

enum AbdmStatus { initial, loading, success, error }
enum AbdmFlow   { none, aadhaarEnrol, mobileEnrol, abhaLogin }

enum LinkStep { none, initiating }

class AbdmState extends Equatable {
  final AbdmStatus          status;
  final AbdmFlow            flow;
  final String?             txnId;
  final String?             mobile;
  final String?             error;
  final String?             message;
  final AbhaAccount?        abhaAccount;
  final List<CareContext>   careContexts;
  final List<CareContext>   discoveredContexts;
  final List<ConsentRequest> consentRequests;
  final List<HealthRecord>  healthRecords;
  final String?             discoverRequestId;
  final String?             linkRequestId;
  final LinkStep            linkStep;

  const AbdmState({
    this.status            = AbdmStatus.initial,
    this.flow              = AbdmFlow.none,
    this.txnId,
    this.mobile,
    this.error,
    this.message,
    this.abhaAccount,
    this.careContexts      = const [],
    this.discoveredContexts = const [],
    this.consentRequests   = const [],
    this.healthRecords     = const [],
    this.discoverRequestId,
    this.linkRequestId,
    this.linkStep          = LinkStep.none,
  });

  AbdmState copyWith({
    AbdmStatus?          status,
    AbdmFlow?            flow,
    String?              txnId,
    String?              mobile,
    String?              error,
    String?              message,
    AbhaAccount?         abhaAccount,
    List<CareContext>?   careContexts,
    List<CareContext>?   discoveredContexts,
    List<ConsentRequest>? consentRequests,
    List<HealthRecord>?  healthRecords,
    String?              discoverRequestId,
    String?              linkRequestId,
    LinkStep?            linkStep,
  }) =>
      AbdmState(
        status:             status             ?? this.status,
        flow:               flow               ?? this.flow,
        txnId:              txnId              ?? this.txnId,
        mobile:             mobile             ?? this.mobile,
        error:              error,
        message:            message,
        abhaAccount:        abhaAccount        ?? this.abhaAccount,
        careContexts:       careContexts       ?? this.careContexts,
        discoveredContexts: discoveredContexts ?? this.discoveredContexts,
        consentRequests:    consentRequests    ?? this.consentRequests,
        healthRecords:      healthRecords      ?? this.healthRecords,
        discoverRequestId:  discoverRequestId  ?? this.discoverRequestId,
        linkRequestId:      linkRequestId      ?? this.linkRequestId,
        linkStep:           linkStep           ?? this.linkStep,
      );

  bool get hasAbha => abhaAccount?.linked == true && abhaAccount?.abhaNumber != null;

  @override
  List<Object?> get props => [
        status, flow, txnId, mobile, error, message,
        abhaAccount, careContexts, discoveredContexts, consentRequests, healthRecords,
        discoverRequestId, linkRequestId, linkStep,
      ];
}

// ── Cubit ──────────────────────────────────────────────────────────────────────

class AbdmCubit extends Cubit<AbdmState> {
  final AbdmService _svc = AbdmService();

  AbdmCubit() : super(const AbdmState());

  // ── M1: Status check ────────────────────────────────────────────────────────

  Future<void> checkAbhaStatus() async {
    emit(state.copyWith(status: AbdmStatus.loading));
    try {
      final account = await _svc.getAbhaStatus();
      emit(state.copyWith(status: AbdmStatus.success, abhaAccount: account));
    } catch (e) {
      emit(state.copyWith(status: AbdmStatus.error, error: _msg(e)));
    }
  }

  // ── M1: Aadhaar enrollment ───────────────────────────────────────────────────

  Future<void> startAadhaarEnrol(String aadhaar, String mobile) async {
    emit(state.copyWith(status: AbdmStatus.loading, flow: AbdmFlow.aadhaarEnrol, mobile: mobile));
    try {
      final txnId = await _svc.generateAadhaarOtp(aadhaar);
      emit(state.copyWith(
        status: AbdmStatus.success,
        txnId: txnId,
        message: 'OTP sent to your Aadhaar-linked mobile number',
      ));
    } catch (e) {
      emit(state.copyWith(status: AbdmStatus.error, error: _msg(e)));
    }
  }

  Future<void> verifyAadhaarOtp(String otp) async {
    emit(state.copyWith(status: AbdmStatus.loading));
    try {
      final account = await _svc.verifyAadhaarOtp(otp, state.txnId!, state.mobile);
      emit(state.copyWith(
        status:      AbdmStatus.success,
        flow:        AbdmFlow.none,
        abhaAccount: account,
        message:     'ABHA created successfully!',
      ));
    } catch (e) {
      emit(state.copyWith(status: AbdmStatus.error, error: _msg(e)));
    }
  }

  // ── M1: Mobile enrollment ────────────────────────────────────────────────────

  Future<void> startMobileEnrol(String mobile) async {
    emit(state.copyWith(status: AbdmStatus.loading, flow: AbdmFlow.mobileEnrol, mobile: mobile));
    try {
      final txnId = await _svc.generateMobileOtp(mobile);
      emit(state.copyWith(
        status:  AbdmStatus.success,
        txnId:   txnId,
        message: 'OTP sent to $mobile',
      ));
    } catch (e) {
      emit(state.copyWith(status: AbdmStatus.error, error: _msg(e)));
    }
  }

  Future<void> verifyMobileOtp(String otp) async {
    emit(state.copyWith(status: AbdmStatus.loading));
    try {
      await _svc.verifyMobileOtp(otp, state.txnId!, state.mobile!);
      await checkAbhaStatus();
      emit(state.copyWith(
        flow:    AbdmFlow.none,
        message: 'ABHA linked successfully!',
      ));
    } catch (e) {
      emit(state.copyWith(status: AbdmStatus.error, error: _msg(e)));
    }
  }

  // ── M1: ABHA login ────────────────────────────────────────────────────────────

  Future<void> startAbhaLogin(String abhaNumber) async {
    emit(state.copyWith(status: AbdmStatus.loading, flow: AbdmFlow.abhaLogin));
    try {
      final txnId = await _svc.loginGenerateOtp(abhaNumber);
      emit(state.copyWith(
        status:  AbdmStatus.success,
        txnId:   txnId,
        message: 'OTP sent to your ABHA-linked mobile',
      ));
    } catch (e) {
      emit(state.copyWith(status: AbdmStatus.error, error: _msg(e)));
    }
  }

  Future<void> verifyAbhaLoginOtp(String otp) async {
    emit(state.copyWith(status: AbdmStatus.loading));
    try {
      await _svc.loginVerifyOtp(otp, state.txnId!);
      await checkAbhaStatus();
      emit(state.copyWith(
        flow:    AbdmFlow.none,
        message: 'ABHA linked successfully!',
      ));
    } catch (e) {
      emit(state.copyWith(status: AbdmStatus.error, error: _msg(e)));
    }
  }

  // ── M2: Care contexts ─────────────────────────────────────────────────────────

  Future<void> loadLinkedCareContexts() async {
    emit(state.copyWith(status: AbdmStatus.loading));
    try {
      final list = await _svc.getLinkedCareContexts();
      emit(state.copyWith(status: AbdmStatus.success, careContexts: list));
    } catch (e) {
      emit(state.copyWith(status: AbdmStatus.error, error: _msg(e)));
    }
  }

  // ABDM v3: fetch care contexts available for this patient from the HIP directly
  Future<void> discoverCareContexts({required String hipId, String gender = 'M', int yearOfBirth = 1990, String mobile = '', String name = '', String dob = ''}) async {
    emit(state.copyWith(status: AbdmStatus.loading, discoveredContexts: [], message: null));
    try {
      final contexts = await _svc.getAvailableCareContexts(hipId);
      emit(state.copyWith(
        status: AbdmStatus.success,
        discoveredContexts: contexts,
        discoverRequestId: hipId,
        message: contexts.isEmpty ? 'No records found at this facility' : null,
      ));
    } catch (e) {
      emit(state.copyWith(status: AbdmStatus.error, error: _msg(e)));
    }
  }

  // ABDM v3: HIP-initiated direct link (no OTP, replaces broken v0.5 link/init + confirm)
  Future<void> initiateLink(List<CareContext> contexts) async {
    final hipId = state.discoverRequestId; // stored hipId
    if (hipId == null) return;
    emit(state.copyWith(status: AbdmStatus.loading, linkStep: LinkStep.initiating));
    try {
      await _svc.linkCareContextsDirect(hipId: hipId, contexts: contexts);
      await loadLinkedCareContexts();
      emit(state.copyWith(
        status: AbdmStatus.success,
        discoveredContexts: [],
        discoverRequestId: null,
        linkStep: LinkStep.none,
        message: 'Records linked successfully',
      ));
    } catch (e) {
      emit(state.copyWith(status: AbdmStatus.error, error: _msg(e), linkStep: LinkStep.none));
    }
  }

  // ── M2: Consent management ────────────────────────────────────────────────────

  Future<void> loadConsentRequests() async {
    emit(state.copyWith(status: AbdmStatus.loading));
    try {
      final list = await _svc.getConsentRequests();
      emit(state.copyWith(status: AbdmStatus.success, consentRequests: list));
    } catch (e) {
      emit(state.copyWith(status: AbdmStatus.error, error: _msg(e)));
    }
  }

  Future<void> createConsentRequest({
    required String hiuId,
    required String purpose,
    required List<String> hiTypes,
    DateTime? dateFrom,
    DateTime? dateTo,
  }) async {
    emit(state.copyWith(status: AbdmStatus.loading));
    try {
      await _svc.createConsentRequest(
        hiuId: hiuId, purpose: purpose, hiTypes: hiTypes,
        dateFrom: dateFrom, dateTo: dateTo,
      );
      emit(state.copyWith(
        status:  AbdmStatus.success,
        message: 'Consent request submitted',
      ));
      await loadConsentRequests();
    } catch (e) {
      emit(state.copyWith(status: AbdmStatus.error, error: _msg(e)));
    }
  }

  Future<void> respondToConsent(String requestId, String action) async {
    emit(state.copyWith(status: AbdmStatus.loading));
    try {
      await _svc.respondToConsent(requestId, action);
      final label = action == 'GRANT' ? 'Consent granted' : 'Consent denied';
      emit(state.copyWith(status: AbdmStatus.success, message: label));
      await loadConsentRequests();
    } catch (e) {
      emit(state.copyWith(status: AbdmStatus.error, error: _msg(e)));
    }
  }

  // ── M3: Health records ─────────────────────────────────────────────────────────

  Future<void> loadHealthRecords() async {
    emit(state.copyWith(status: AbdmStatus.loading));
    try {
      final list = await _svc.getHealthRecords();
      emit(state.copyWith(status: AbdmStatus.success, healthRecords: list));
    } catch (e) {
      emit(state.copyWith(status: AbdmStatus.error, error: _msg(e)));
    }
  }

  Future<void> logoutAbha() async {
    emit(state.copyWith(status: AbdmStatus.loading));
    try {
      await _svc.logoutAbha();
      emit(AbdmState(
        message: 'ABHA session cleared',
        careContexts: state.careContexts,
        consentRequests: state.consentRequests,
        healthRecords: state.healthRecords,
      ));
    } catch (e) {
      emit(state.copyWith(status: AbdmStatus.error, error: _msg(e)));
    }
  }

  void clearError()   => emit(state.copyWith(status: AbdmStatus.initial));
  void clearMessage() => emit(state.copyWith(message: null));

  String _msg(dynamic e) {
    final s = e.toString();
    final clean = s.replaceAll('Exception: ', '').replaceAll('DioException [bad response]: ', '');
    return clean.isNotEmpty ? clean : 'Something went wrong';
  }
}
