import 'package:flutter/foundation.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../services/health_connect_service.dart';
import '../services/api_service.dart';

enum HealthSyncStatus { idle, checkingAvailability, requestingPermission, syncing, success, error, unavailable }

class HealthSyncState {
  final HealthSyncStatus status;
  final int synced;
  final int total;
  final String? error;
  final DateTime? lastSyncedAt;

  const HealthSyncState({
    this.status = HealthSyncStatus.idle,
    this.synced = 0,
    this.total = 0,
    this.error,
    this.lastSyncedAt,
  });

  HealthSyncState copyWith({
    HealthSyncStatus? status,
    int? synced,
    int? total,
    String? error,
    DateTime? lastSyncedAt,
  }) => HealthSyncState(
    status: status ?? this.status,
    synced: synced ?? this.synced,
    total: total ?? this.total,
    error: error ?? this.error,
    lastSyncedAt: lastSyncedAt ?? this.lastSyncedAt,
  );

  bool get isLoading =>
      status == HealthSyncStatus.checkingAvailability ||
      status == HealthSyncStatus.requestingPermission ||
      status == HealthSyncStatus.syncing;

  double get progress => total == 0 ? 0 : synced / total;
}

class HealthSyncCubit extends Cubit<HealthSyncState> {
  final _service = HealthConnectService();
  final _api = ApiService();

  static const _lastSyncKey = 'health_connect_last_sync';

  HealthSyncCubit() : super(const HealthSyncState()) {
    _loadLastSync();
  }

  Future<void> _loadLastSync() async {
    final prefs = await SharedPreferences.getInstance();
    final ms = prefs.getInt(_lastSyncKey);
    if (ms != null) {
      emit(state.copyWith(lastSyncedAt: DateTime.fromMillisecondsSinceEpoch(ms)));
    }
  }

  Future<void> _saveLastSync(DateTime dt) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setInt(_lastSyncKey, dt.millisecondsSinceEpoch);
  }

  Future<void> sync({int days = 7}) async {
    emit(state.copyWith(status: HealthSyncStatus.checkingAvailability, synced: 0, total: 0, error: null));

    final available = await _service.isAvailable();
    if (!available) {
      emit(state.copyWith(status: HealthSyncStatus.unavailable, error: 'Health Connect is not available on this device.'));
      return;
    }

    emit(state.copyWith(status: HealthSyncStatus.requestingPermission));
    final granted = await _service.requestPermissions();
    if (!granted) {
      emit(state.copyWith(status: HealthSyncStatus.error, error: 'Permission denied. Please grant access in Health Connect settings.'));
      return;
    }

    emit(state.copyWith(status: HealthSyncStatus.syncing));

    // Use lastSyncedAt as the from-date so we never re-fetch already-synced data
    final periodStart = DateTime.now().subtract(Duration(days: days));
    final from = state.lastSyncedAt != null && state.lastSyncedAt!.isAfter(periodStart)
        ? state.lastSyncedAt!
        : periodStart;

    debugPrint('[HealthSync] Fetching data from $from');
    final vitals = await _service.fetchVitalsSince(from: from);

    if (vitals.isEmpty) {
      final now = DateTime.now();
      await _saveLastSync(now);
      emit(state.copyWith(status: HealthSyncStatus.success, synced: 0, total: 0, lastSyncedAt: now));
      return;
    }

    emit(state.copyWith(total: vitals.length));

    int synced = 0;
    for (final vital in vitals) {
      try {
        await _api.post('/vitals', data: vital);
        synced++;
        debugPrint('[HealthSync] ✓ ${vital['type']} | values: ${vital['values']} | recorded_at: ${vital['recorded_at']}');
        emit(state.copyWith(synced: synced));
      } catch (e) {
        debugPrint('[HealthSync] ✗ ${vital['type']} | values: ${vital['values']} | error: $e');
      }
    }

    final now = DateTime.now();
    await _saveLastSync(now);
    emit(state.copyWith(
      status: HealthSyncStatus.success,
      synced: synced,
      total: vitals.length,
      lastSyncedAt: now,
    ));
  }

  void reset() => emit(state.copyWith(
    status: HealthSyncStatus.idle,
    synced: 0,
    total: 0,
    error: null,
  ));
}
