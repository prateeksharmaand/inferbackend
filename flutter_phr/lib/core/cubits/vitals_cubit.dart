import 'package:flutter_bloc/flutter_bloc.dart';
import '../models/vital_model.dart';
import '../services/api_service.dart';
import '../services/notification_service.dart';
import '../constants/app_constants.dart';

class VitalsState {
  final List<VitalModel> vitals;
  final VitalModel? latestBP;
  final VitalModel? latestGlucose;
  final VitalModel? latestWeight;
  final VitalModel? latestSpo2;
  final VitalModel? latestHeartRate;
  final VitalModel? latestTemperature;
  final bool isLoading;
  final String? error;

  const VitalsState({
    this.vitals = const [], this.latestBP, this.latestGlucose,
    this.latestWeight, this.latestSpo2, this.latestHeartRate, this.latestTemperature,
    this.isLoading = false, this.error,
  });

  VitalsState copyWith({List<VitalModel>? vitals, VitalModel? latestBP,
    VitalModel? latestGlucose, VitalModel? latestWeight, VitalModel? latestSpo2,
    VitalModel? latestHeartRate, VitalModel? latestTemperature, bool? isLoading, String? error}) =>
    VitalsState(
      vitals: vitals ?? this.vitals,
      latestBP: latestBP ?? this.latestBP,
      latestGlucose: latestGlucose ?? this.latestGlucose,
      latestWeight: latestWeight ?? this.latestWeight,
      latestSpo2: latestSpo2 ?? this.latestSpo2,
      latestHeartRate: latestHeartRate ?? this.latestHeartRate,
      latestTemperature: latestTemperature ?? this.latestTemperature,
      isLoading: isLoading ?? this.isLoading,
      error: error,
    );
}

class VitalsCubit extends Cubit<VitalsState> {
  final ApiService _api = ApiService();
  VitalsCubit() : super(const VitalsState());

  Future<void> loadVitals({String? type, DateTime? from, DateTime? to}) async {
    emit(state.copyWith(isLoading: true, error: null));
    try {
      final params = <String, dynamic>{};
      if (type != null) params['type'] = type;
      if (from != null) params['from'] = from.toIso8601String();
      if (to != null) params['to'] = to.toIso8601String();
      final response = await _api.get('/vitals', params: params);
      final vitals = (response.data['vitals'] as List).map((v) => VitalModel.fromJson(v)).toList();
      emit(state.copyWith(vitals: vitals, isLoading: false));
      _updateLatest(vitals);
    } catch (e) {
      emit(state.copyWith(isLoading: false, error: e.toString()));
    }
  }

  Future<void> loadLatestVitals() async {
    try {
      final response = await _api.get('/vitals/all-latest');
      final data = response.data['vitals'] as Map<String, dynamic>;
      VitalModel? _pick(List<String> keys) {
        for (final k in keys) {
          if (data[k] != null) return VitalModel.fromJson(data[k] as Map<String, dynamic>);
        }
        return null;
      }
      emit(state.copyWith(
        latestBP:          _pick(['blood_pressure']),
        latestGlucose:     _pick(['glucose', 'fasting_glucose', 'glucose_fasting', 'glucose_random']),
        latestWeight:      _pick(['weight', 'body_weight']),
        latestSpo2:        _pick(['spo2', 'oxygen_saturation']),
        latestHeartRate:   _pick(['heart_rate']),
        latestTemperature: _pick(['temperature', 'body_temperature']),
      ));
    } catch (e) {
      emit(state.copyWith(error: e.toString()));
    }
  }

  Future<VitalModel?> addVital(Map<String, dynamic> vitalData) async {
    try {
      final response = await _api.post('/vitals', data: vitalData);
      final vital = VitalModel.fromJson(response.data['vital']);
      final updatedVitals = [vital, ...state.vitals];
      emit(state.copyWith(vitals: updatedVitals));
      _updateLatestSingle(vital);
      await _checkAbnormal(vital);
      return vital;
    } catch (e) {
      emit(state.copyWith(error: e.toString()));
      return null;
    }
  }

  Future<bool> deleteVital(String id) async {
    try {
      await _api.delete('/vitals/$id');
      emit(state.copyWith(vitals: state.vitals.where((v) => v.id != id).toList()));
      return true;
    } catch (e) {
      emit(state.copyWith(error: e.toString()));
      return false;
    }
  }

  static const _typeAliases = <String, List<String>>{
    'blood_pressure': ['blood_pressure', 'blood_pressure_systolic', 'blood_pressure_diastolic'],
    'glucose':        ['glucose', 'fasting_glucose', 'glucose_fasting', 'glucose_random', 'glucose_postprandial', 'hba1c'],
    'weight':         ['weight', 'body_weight', 'bmi'],
    'spo2':           ['spo2', 'oxygen_saturation'],
    'heart_rate':     ['heart_rate', 'pulse', 'pulse_rate', 'heart_rate_resting'],
    'temperature':    ['temperature', 'body_temperature'],
  };

  Future<List<VitalModel>> getVitalHistory(String type, {int days = 30}) async {
    try {
      final from = DateTime.now().subtract(Duration(days: days));
      final aliases = _typeAliases[type] ?? [type];
      final response = await _api.get('/vitals', params: {
        'types': aliases.join(','),
        'from': from.toIso8601String(),
      });
      return (response.data['vitals'] as List).map((v) => VitalModel.fromJson(v)).toList();
    } catch (e) {
      return [];
    }
  }

  void _updateLatest(List<VitalModel> vitals) {
    for (final v in vitals) { _updateLatestSingle(v); }
  }

  void _updateLatestSingle(VitalModel vital) {
    switch (vital.type) {
      case 'blood_pressure': emit(state.copyWith(latestBP: vital)); break;
      case 'glucose': emit(state.copyWith(latestGlucose: vital)); break;
      case 'weight': emit(state.copyWith(latestWeight: vital)); break;
      case 'spo2': emit(state.copyWith(latestSpo2: vital)); break;
      case 'heart_rate': emit(state.copyWith(latestHeartRate: vital)); break;
      case 'temperature': emit(state.copyWith(latestTemperature: vital)); break;
    }
  }

  Future<void> _checkAbnormal(VitalModel vital) async {
    final thresholds = AppConstants.vitalThresholds;
    bool isAbnormal = false;

    if (vital.type == 'blood_pressure') {
      final sys = vital.values['systolic']?.toDouble();
      final dia = vital.values['diastolic']?.toDouble();
      if (sys != null && (sys >= thresholds['systolic']!['crisis']! || sys < thresholds['systolic']!['low']!)) isAbnormal = true;
      if (dia != null && (dia >= thresholds['diastolic']!['crisis']! || dia < thresholds['diastolic']!['low']!)) isAbnormal = true;
    } else if (vital.type == 'spo2') {
      final val = vital.values['value']?.toDouble();
      if (val != null && val < thresholds['spo2']!['critical']!) isAbnormal = true;
    } else if (vital.type == 'heart_rate') {
      final bpm = vital.values['bpm']?.toDouble();
      if (bpm != null && (bpm < thresholds['heart_rate']!['bradycardia']! || bpm > thresholds['heart_rate']!['tachycardia']!)) isAbnormal = true;
    }

    if (isAbnormal || vital.status == 'critical' || vital.status == 'high') {
      await NotificationService.instance.showVitalAlert(
        vitalType: vital.type, value: vital.displayValue, status: vital.status,
      );
    }
  }
}
