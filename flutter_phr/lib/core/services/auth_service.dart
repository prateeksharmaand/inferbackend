import 'dart:convert';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../models/user_model.dart';
import '../constants/app_constants.dart';
import 'api_service.dart';

class AuthService {
  final ApiService _api = ApiService();
  final FlutterSecureStorage _storage = const FlutterSecureStorage();

  Future<UserModel> login(String email, String password) async {
    final response = await _api.post('/auth/login', data: {'email': email, 'password': password});
    final data = response.data;
    await _api.setToken(data['token']);
    await _api.setRefreshToken(data['refresh_token']);
    final user = UserModel.fromJson(data['user']);
    await _saveUser(user);
    return user;
  }

  Future<UserModel> register(Map<String, dynamic> userData) async {
    final response = await _api.post('/auth/register', data: userData);
    final data = response.data;
    await _api.setToken(data['token']);
    await _api.setRefreshToken(data['refresh_token']);
    final user = UserModel.fromJson(data['user']);
    await _saveUser(user);
    return user;
  }

  Future<void> logout() async {
    try { await _api.post('/auth/logout'); } catch (_) {}
    await _api.clearTokens();
    await _storage.delete(key: AppConstants.userKey);
  }

  Future<UserModel?> getCurrentUser() async {
    final userJson = await _storage.read(key: AppConstants.userKey);
    if (userJson == null) return null;
    try {
      return UserModel.fromJson(jsonDecode(userJson));
    } catch (_) { return null; }
  }

  Future<UserModel> refreshCurrentUser() async {
    final response = await _api.get('/auth/me');
    final user = UserModel.fromJson(response.data['user']);
    await _saveUser(user);
    return user;
  }

  Future<void> _saveUser(UserModel user) async {
    await _storage.write(key: AppConstants.userKey, value: jsonEncode(user.toJson()));
  }

  Future<bool> isLoggedIn() async {
    final token = await _api.getToken();
    return token != null;
  }

  Future<void> forgotPassword(String email) =>
      _api.post('/auth/forgot-password', data: {'email': email});

  Future<void> resetPassword(String token, String password) =>
      _api.post('/auth/reset-password', data: {'token': token, 'password': password});

  Future<UserModel> updateProfile(Map<String, dynamic> data) async {
    final response = await _api.put('/auth/profile', data: data);
    final user = UserModel.fromJson(response.data['user']);
    await _saveUser(user);
    return user;
  }
}
