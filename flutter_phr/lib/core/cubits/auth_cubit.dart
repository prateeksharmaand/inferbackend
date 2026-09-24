import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../constants/app_constants.dart';
import '../models/user_model.dart';
import '../services/auth_service.dart';
import '../services/notification_service.dart';
import '../services/api_service.dart';
import '../services/encryption_service.dart';

enum AuthStatus { unknown, authenticated, unauthenticated }

class AuthState {
  final AuthStatus status;
  final UserModel? user;
  final String? error;
  final bool isLoading;
  const AuthState({this.status = AuthStatus.unknown, this.user, this.error, this.isLoading = false});
  AuthState copyWith({AuthStatus? status, UserModel? user, String? error, bool? isLoading}) =>
      AuthState(status: status ?? this.status, user: user ?? this.user, error: error, isLoading: isLoading ?? this.isLoading);
}

class AuthCubit extends Cubit<AuthState> {
  final AuthService _authService = AuthService();
  AuthCubit() : super(const AuthState()) { _init(); }

  Future<void> _init() async {
    emit(state.copyWith(isLoading: true));
    try {
      await _clearKeychainAfterReinstall();
      ApiService().initialize();
      await EncryptionService().initialize();
      final user = await _authService.getCurrentUser();
      if (user != null && await _authService.isLoggedIn()) {
        emit(state.copyWith(status: AuthStatus.authenticated, user: user, isLoading: false));
        _initNotifications();
      } else {
        emit(state.copyWith(status: AuthStatus.unauthenticated, isLoading: false));
      }
    } catch (e) {
      emit(state.copyWith(status: AuthStatus.unauthenticated, isLoading: false));
    }
  }

  Future<bool> login(String email, String password) async {
    emit(state.copyWith(isLoading: true, error: null));
    try {
      // ignore: avoid_print
      print('[AUTH] Attempting login to: ${AppConstants.baseUrl}');
      final user = await _authService.login(email, password);
      // ignore: avoid_print
      print('[AUTH] Login success: ${user.email}');
      emit(state.copyWith(status: AuthStatus.authenticated, user: user, isLoading: false));
      _initNotifications();
      return true;
    } catch (e) {
      // ignore: avoid_print
      print('[AUTH] Login error: $e');
      emit(state.copyWith(isLoading: false, error: _parseError(e)));
      return false;
    }
  }

  Future<bool> register(Map<String, dynamic> userData) async {
    emit(state.copyWith(isLoading: true, error: null));
    try {
      final user = await _authService.register(userData);
      emit(state.copyWith(status: AuthStatus.authenticated, user: user, isLoading: false));
      _initNotifications();
      return true;
    } catch (e) {
      emit(state.copyWith(isLoading: false, error: _parseError(e)));
      return false;
    }
  }

  // iOS keeps Keychain items after an app is deleted, so a reinstall would silently
  // restore the old session. SharedPreferences is wiped on uninstall, so use it as the marker.
  Future<void> _clearKeychainAfterReinstall() async {
    const key = 'has_launched_before';
    final prefs = await SharedPreferences.getInstance();
    if (prefs.getBool(key) == true) return;
    await const FlutterSecureStorage().deleteAll();
    await prefs.setBool(key, true);
  }

  // Ask for notification permission only once the user is signed in,
  // not on first launch before they've seen what the app does.
  void _initNotifications() {
    NotificationService.instance.initialize().timeout(
      const Duration(seconds: 5),
      onTimeout: () {},
    ).catchError((_) {});
  }

  Future<void> logout() async {
    await _authService.logout();
    emit(const AuthState(status: AuthStatus.unauthenticated));
  }

  /// Returns null on success, or an error message.
  Future<String?> deleteAccount(String password) async {
    try {
      await _authService.deleteAccount(password);
      emit(const AuthState(status: AuthStatus.unauthenticated));
      return null;
    } catch (e) {
      if (e is DioException && e.response?.statusCode == 401) return 'Incorrect password';
      return _parseError(e);
    }
  }

  Future<bool> updateProfile(Map<String, dynamic> data) async {
    emit(state.copyWith(isLoading: true, error: null));
    try {
      final user = await _authService.updateProfile(data);
      emit(state.copyWith(user: user, isLoading: false));
      return true;
    } catch (e) {
      emit(state.copyWith(isLoading: false, error: _parseError(e)));
      return false;
    }
  }

  String _parseError(dynamic e) {
    if (e is DioException) {
      if (e.type == DioExceptionType.connectionError ||
          e.type == DioExceptionType.connectionTimeout ||
          e.type == DioExceptionType.receiveTimeout) {
        return 'Cannot reach server. Check backend is running.';
      }
      final status = e.response?.statusCode;
      if (status == 401) return 'Invalid email or password';
      if (status == 409) return 'Email already registered';
      final msg = e.response?.data?['error'] ?? e.response?.data?['message'];
      if (msg != null) return msg.toString();
      return 'Server error ($status). Check backend logs.';
    }
    return 'Error: ${e.toString()}';
  }
}
