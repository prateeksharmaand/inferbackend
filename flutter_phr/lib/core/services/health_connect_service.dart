import 'package:health/health.dart';
import 'package:flutter/foundation.dart';

class HealthConnectService {
  static final Health _health = Health();

  static const _types = [
    HealthDataType.HEART_RATE,
    HealthDataType.BLOOD_PRESSURE_SYSTOLIC,
    HealthDataType.BLOOD_PRESSURE_DIASTOLIC,
    HealthDataType.BLOOD_GLUCOSE,
    HealthDataType.WEIGHT,
    HealthDataType.BLOOD_OXYGEN,
    HealthDataType.BODY_TEMPERATURE,
    HealthDataType.STEPS,
    HealthDataType.ACTIVE_ENERGY_BURNED,
  ];

  static const _permissions = [
    HealthDataAccess.READ,
    HealthDataAccess.READ,
    HealthDataAccess.READ,
    HealthDataAccess.READ,
    HealthDataAccess.READ,
    HealthDataAccess.READ,
    HealthDataAccess.READ,
    HealthDataAccess.READ,
    HealthDataAccess.READ,
  ];

  Future<bool> isAvailable() async {
    final status = await _health.getHealthConnectSdkStatus();
    return status == HealthConnectSdkStatus.sdkAvailable;
  }

  Future<bool> requestPermissions() async {
    try {
      return await _health.requestAuthorization(_types, permissions: _permissions);
    } catch (e) {
      debugPrint('Health Connect permission error: $e');
      return false;
    }
  }

  Future<bool> hasPermissions() async {
    try {
      final result = await _health.hasPermissions(_types, permissions: _permissions);
      return result ?? false;
    } catch (_) {
      return false;
    }
  }

  /// Fetches health data since [from] and maps to backend vital format.
  Future<List<Map<String, dynamic>>> fetchVitalsSince({required DateTime from}) async {
    final now = DateTime.now();

    List<HealthDataPoint> points = [];
    try {
      points = await _health.getHealthDataFromTypes(
        startTime: from,
        endTime: now,
        types: _types,
      );
      // Deduplicate by type + start timestamp
      final seen = <String>{};
      points = points.where((p) {
        final key = '${p.type}_${p.dateFrom.millisecondsSinceEpoch}';
        return seen.add(key);
      }).toList();
    } catch (e) {
      debugPrint('Health Connect fetch error: $e');
      return [];
    }

    return _mapToVitals(points);
  }

  List<Map<String, dynamic>> _mapToVitals(List<HealthDataPoint> points) {
    final vitals = <Map<String, dynamic>>[];

    // Pair systolic + diastolic by matching timestamps (within 60s)
    final systolicPts = points.where((p) => p.type == HealthDataType.BLOOD_PRESSURE_SYSTOLIC).toList();
    final diastolicPts = points.where((p) => p.type == HealthDataType.BLOOD_PRESSURE_DIASTOLIC).toList();

    for (final sys in systolicPts) {
      final sysVal = (sys.value as NumericHealthValue).numericValue.toDouble();
      final match = diastolicPts.where((d) =>
        d.dateFrom.difference(sys.dateFrom).abs() < const Duration(seconds: 60)
      ).firstOrNull;
      if (match != null) {
        final diaVal = (match.value as NumericHealthValue).numericValue.toDouble();
        vitals.add({
          'type': 'blood_pressure',
          'values': {'systolic': sysVal, 'diastolic': diaVal},
          'recorded_at': sys.dateFrom.toIso8601String(),
          'source': 'health_connect',
          'notes': 'Synced from ${sys.sourceName}',
        });
      }
    }

    for (final p in points) {
      final recordedAt = p.dateFrom.toIso8601String();
      final source = p.sourceName;

      switch (p.type) {
        case HealthDataType.HEART_RATE:
          vitals.add({
            'type': 'heart_rate',
            'values': {'bpm': (p.value as NumericHealthValue).numericValue.toDouble()},
            'recorded_at': recordedAt,
            'source': 'health_connect',
            'notes': 'Synced from $source',
          });
          break;

        case HealthDataType.BLOOD_GLUCOSE:
          // Health Connect stores glucose in mmol/L — convert to mg/dL
          final mmol = (p.value as NumericHealthValue).numericValue.toDouble();
          vitals.add({
            'type': 'glucose',
            'values': {'value': (mmol * 18.0182).roundToDouble()},
            'recorded_at': recordedAt,
            'source': 'health_connect',
            'notes': 'Synced from $source',
          });
          break;

        case HealthDataType.WEIGHT:
          vitals.add({
            'type': 'weight',
            'values': {'value': (p.value as NumericHealthValue).numericValue.toDouble()},
            'recorded_at': recordedAt,
            'source': 'health_connect',
            'notes': 'Synced from $source',
          });
          break;

        case HealthDataType.BLOOD_OXYGEN:
          final raw = (p.value as NumericHealthValue).numericValue.toDouble();
          final pct = raw <= 1.0 ? raw * 100 : raw;
          vitals.add({
            'type': 'spo2',
            'values': {'value': pct},
            'recorded_at': recordedAt,
            'source': 'health_connect',
            'notes': 'Synced from $source',
          });
          break;

        case HealthDataType.BODY_TEMPERATURE:
          vitals.add({
            'type': 'temperature',
            'values': {'value': (p.value as NumericHealthValue).numericValue.toDouble()},
            'recorded_at': recordedAt,
            'source': 'health_connect',
            'notes': 'Synced from $source',
          });
          break;

        default:
          break;
      }
    }

    return vitals;
  }
}
