class ProfileModel {
  final String id;
  final String accountId;
  final String fullName;
  final String relationship;
  final DateTime? dateOfBirth;
  final String? gender;
  final String? bloodGroup;
  final String? avatarUrl;
  final bool isPrimary;
  final double? heightCm;
  final double? weightKg;
  final List<String>? allergies;
  final List<String>? chronicConditions;
  final String? emergencyContactName;
  final String? emergencyContactPhone;
  final DateTime createdAt;

  ProfileModel({
    required this.id,
    required this.accountId,
    required this.fullName,
    required this.relationship,
    this.dateOfBirth,
    this.gender,
    this.bloodGroup,
    this.avatarUrl,
    this.isPrimary = false,
    this.heightCm,
    this.weightKg,
    this.allergies,
    this.chronicConditions,
    this.emergencyContactName,
    this.emergencyContactPhone,
    required this.createdAt,
  });

  factory ProfileModel.fromJson(Map<String, dynamic> json) => ProfileModel(
        id: json['id'],
        accountId: json['account_id'],
        fullName: json['full_name'],
        relationship: json['relationship'] ?? 'self',
        dateOfBirth: json['date_of_birth'] != null ? DateTime.parse(json['date_of_birth']) : null,
        gender: json['gender'],
        bloodGroup: json['blood_group'],
        avatarUrl: json['avatar_url'],
        isPrimary: json['is_primary'] ?? false,
        heightCm: json['height_cm']?.toDouble(),
        weightKg: json['weight_kg']?.toDouble(),
        allergies: json['allergies'] != null ? List<String>.from(json['allergies']) : null,
        chronicConditions: json['chronic_conditions'] != null ? List<String>.from(json['chronic_conditions']) : null,
        emergencyContactName: json['emergency_contact_name'],
        emergencyContactPhone: json['emergency_contact_phone'],
        createdAt: DateTime.parse(json['created_at']),
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'account_id': accountId,
        'full_name': fullName,
        'relationship': relationship,
        'date_of_birth': dateOfBirth?.toIso8601String(),
        'gender': gender,
        'blood_group': bloodGroup,
        'avatar_url': avatarUrl,
        'is_primary': isPrimary,
        'height_cm': heightCm,
        'weight_kg': weightKg,
        'allergies': allergies,
        'chronic_conditions': chronicConditions,
      };

  int? get age {
    if (dateOfBirth == null) return null;
    final now = DateTime.now();
    int age = now.year - dateOfBirth!.year;
    if (now.month < dateOfBirth!.month ||
        (now.month == dateOfBirth!.month && now.day < dateOfBirth!.day)) {
      age--;
    }
    return age;
  }

  String get relationshipLabel {
    const labels = {
      'self': 'Self',
      'spouse': 'Spouse',
      'child': 'Child',
      'parent': 'Parent',
      'sibling': 'Sibling',
      'other': 'Other',
    };
    return labels[relationship] ?? relationship;
  }

  ProfileModel copyWith({String? avatarUrl, double? heightCm, double? weightKg}) => ProfileModel(
        id: id, accountId: accountId, fullName: fullName, relationship: relationship,
        dateOfBirth: dateOfBirth, gender: gender, bloodGroup: bloodGroup,
        avatarUrl: avatarUrl ?? this.avatarUrl,
        isPrimary: isPrimary,
        heightCm: heightCm ?? this.heightCm,
        weightKg: weightKg ?? this.weightKg,
        allergies: allergies, chronicConditions: chronicConditions,
        emergencyContactName: emergencyContactName,
        emergencyContactPhone: emergencyContactPhone,
        createdAt: createdAt,
      );
}
