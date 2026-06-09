import 'package:flutter_bloc/flutter_bloc.dart';
import '../services/api_service.dart';

enum GmailStatus { unknown, connected, disconnected }

class GmailSyncState {
  final GmailStatus status;
  final String? email;
  final DateTime? lastSyncedAt;
  final bool isSyncing;
  final int? lastSyncCount;
  final String? error;

  const GmailSyncState({
    this.status = GmailStatus.unknown,
    this.email,
    this.lastSyncedAt,
    this.isSyncing = false,
    this.lastSyncCount,
    this.error,
  });

  GmailSyncState copyWith({
    GmailStatus? status,
    String? email,
    DateTime? lastSyncedAt,
    bool? isSyncing,
    int? lastSyncCount,
    String? error,
  }) =>
      GmailSyncState(
        status: status ?? this.status,
        email: email ?? this.email,
        lastSyncedAt: lastSyncedAt ?? this.lastSyncedAt,
        isSyncing: isSyncing ?? this.isSyncing,
        lastSyncCount: lastSyncCount ?? this.lastSyncCount,
        error: error,
      );
}

class GmailSyncCubit extends Cubit<GmailSyncState> {
  final ApiService _api = ApiService();

  GmailSyncCubit() : super(const GmailSyncState());

  Future<void> loadStatus() async {
    try {
      final res = await _api.get('/gmail/status');
      final data = res.data as Map<String, dynamic>;
      final connected = data['connected'] as bool? ?? false;
      emit(state.copyWith(
        status: connected ? GmailStatus.connected : GmailStatus.disconnected,
        email: data['email'] as String?,
        lastSyncedAt: data['lastSyncedAt'] != null
            ? DateTime.tryParse(data['lastSyncedAt'].toString())?.toLocal()
            : null,
        error: null,
      ));
    } catch (_) {
      emit(state.copyWith(status: GmailStatus.disconnected));
    }
  }

  Future<String?> getAuthUrl() async {
    try {
      final res = await _api.get('/gmail/auth-url');
      return res.data['url'] as String?;
    } catch (e) {
      emit(state.copyWith(error: e.toString()));
      return null;
    }
  }

  Future<int> triggerSync() async {
    emit(state.copyWith(isSyncing: true, error: null));
    try {
      final res = await _api.post('/gmail/sync');
      final count = (res.data['synced'] as num?)?.toInt() ?? 0;
      emit(state.copyWith(isSyncing: false, lastSyncCount: count));
      await loadStatus();
      return count;
    } catch (e) {
      emit(state.copyWith(isSyncing: false, error: e.toString()));
      return 0;
    }
  }

  Future<void> disconnect() async {
    try {
      await _api.delete('/gmail/disconnect');
      emit(const GmailSyncState(status: GmailStatus.disconnected));
    } catch (e) {
      emit(state.copyWith(error: e.toString()));
    }
  }
}
