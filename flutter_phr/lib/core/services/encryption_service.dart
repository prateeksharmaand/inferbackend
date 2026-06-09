import 'dart:io';
import 'dart:typed_data';
import 'package:encrypt/encrypt.dart' as enc;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:crypto/crypto.dart';
import 'dart:convert';

class EncryptionService {
  static final EncryptionService _instance = EncryptionService._internal();
  factory EncryptionService() => _instance;
  EncryptionService._internal();

  final FlutterSecureStorage _storage = const FlutterSecureStorage();
  static const String _keyAlias = 'phr_encryption_key';
  enc.Key? _key;
  enc.IV? _iv;

  Future<void> initialize() async {
    String? storedKey = await _storage.read(key: _keyAlias);
    if (storedKey == null) {
      final key = enc.Key.fromSecureRandom(32);
      storedKey = base64Encode(key.bytes);
      await _storage.write(key: _keyAlias, value: storedKey);
    }
    final keyBytes = base64Decode(storedKey);
    _key = enc.Key(Uint8List.fromList(keyBytes));
    _iv = enc.IV.fromSecureRandom(16);
  }

  String encryptText(String plainText) {
    if (_key == null) throw Exception('EncryptionService not initialized');
    final iv = enc.IV.fromSecureRandom(16);
    final encrypter = enc.Encrypter(enc.AES(_key!, mode: enc.AESMode.cbc));
    final encrypted = encrypter.encrypt(plainText, iv: iv);
    return '${base64Encode(iv.bytes)}.${encrypted.base64}';
  }

  String decryptText(String cipherText) {
    if (_key == null) throw Exception('EncryptionService not initialized');
    final parts = cipherText.split('.');
    if (parts.length != 2) throw Exception('Invalid cipher text format');
    final iv = enc.IV(Uint8List.fromList(base64Decode(parts[0])));
    final encrypter = enc.Encrypter(enc.AES(_key!, mode: enc.AESMode.cbc));
    return encrypter.decrypt64(parts[1], iv: iv);
  }

  Future<File> encryptFile(File file) async {
    if (_key == null) throw Exception('EncryptionService not initialized');
    final bytes = await file.readAsBytes();
    final iv = enc.IV.fromSecureRandom(16);
    final encrypter = enc.Encrypter(enc.AES(_key!, mode: enc.AESMode.cbc));
    final encrypted = encrypter.encryptBytes(bytes, iv: iv);
    final encryptedFile = File('${file.path}.enc');
    final outputBytes = Uint8List(16 + encrypted.bytes.length);
    outputBytes.setRange(0, 16, iv.bytes);
    outputBytes.setRange(16, outputBytes.length, encrypted.bytes);
    await encryptedFile.writeAsBytes(outputBytes);
    return encryptedFile;
  }

  Future<Uint8List> decryptFile(File encryptedFile) async {
    if (_key == null) throw Exception('EncryptionService not initialized');
    final bytes = await encryptedFile.readAsBytes();
    final iv = enc.IV(Uint8List.fromList(bytes.sublist(0, 16)));
    final encryptedBytes = bytes.sublist(16);
    final encrypter = enc.Encrypter(enc.AES(_key!, mode: enc.AESMode.cbc));
    return Uint8List.fromList(encrypter.decryptBytes(enc.Encrypted(encryptedBytes), iv: iv));
  }

  String hashPassword(String password) {
    final bytes = utf8.encode(password);
    return sha256.convert(bytes).toString();
  }

  String generateToken() => base64Encode(enc.Key.fromSecureRandom(32).bytes);
}
