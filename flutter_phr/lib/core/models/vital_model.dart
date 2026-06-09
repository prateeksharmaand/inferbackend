class VitalModel {
  final String? id;
  final String userId;
  final String type;
  final Map<String, dynamic> values;
  final String? unit;
  final String status;
  final DateTime recordedAt;
  final String? notes;
  final String? source;
  final String? loincCode;

  const VitalModel({
    this.id, required this.userId, required this.type,
    required this.values, this.unit, required this.status,
    required this.recordedAt, this.notes, this.source, this.loincCode,
  });

  factory VitalModel.fromJson(Map<String, dynamic> json) => VitalModel(
    id: json['id']?.toString(),
    userId: json['user_id']?.toString() ?? '',
    type: json['type'] ?? '',
    values: Map<String, dynamic>.from(json['values'] ?? {}),
    unit: json['unit'],
    status: json['status'] ?? 'normal',
    recordedAt: DateTime.parse(json['recorded_at'] ?? DateTime.now().toIso8601String()),
    notes: json['notes'],
    source: json['source'],
    loincCode: json['loinc_code'],
  );

  Map<String, dynamic> toJson() => {
    'user_id': userId, 'type': type, 'values': values,
    'unit': unit, 'status': status,
    'recorded_at': recordedAt.toIso8601String(),
    'notes': notes, 'source': source, 'loinc_code': loincCode,
  };

  String get displayValue {
    switch (type) {
      case 'blood_pressure': return '${values['systolic']?.toStringAsFixed(0)}/${values['diastolic']?.toStringAsFixed(0)}';
      case 'glucose': return values['value']?.toStringAsFixed(1) ?? '--';
      case 'weight': return values['value']?.toStringAsFixed(1) ?? '--';
      case 'temperature': return values['value']?.toStringAsFixed(1) ?? '--';
      case 'spo2': return '${values['value']?.toStringAsFixed(0)}';
      case 'heart_rate':
        final bpmRaw = values['bpm'] ?? values['value'];
        return bpmRaw != null ? (bpmRaw as num).toStringAsFixed(0) : '--';
      default:
        final v = values['value'];
        if (v != null) {
          final n = v as num;
          return n.toStringAsFixed(n % 1 == 0 ? 0 : 1);
        }
        final bpm = values['bpm'];
        if (bpm != null) return (bpm as num).toStringAsFixed(0);
        return '--';
    }
  }

  String get displayUnit {
    switch (type) {
      case 'blood_pressure': return 'mmHg';
      case 'glucose': return 'mg/dL';
      case 'weight': return 'kg';
      case 'temperature': return '°C';
      case 'spo2': return '%';
      case 'heart_rate': return 'bpm';
      default: return unit ?? '';
    }
  }
}

class BloodPressureReading {
  final int systolic;
  final int diastolic;
  final int? pulse;
  final DateTime recordedAt;
  final String? notes;

  const BloodPressureReading({
    required this.systolic, required this.diastolic,
    this.pulse, required this.recordedAt, this.notes,
  });

  String get category {
    if (systolic < 90 || diastolic < 60) return 'Low';
    if (systolic < 120 && diastolic < 80) return 'Normal';
    if (systolic < 130 && diastolic < 80) return 'Elevated';
    if (systolic < 140 || diastolic < 90) return 'High Stage 1';
    if (systolic < 180 || diastolic < 120) return 'High Stage 2';
    return 'Crisis';
  }
}
