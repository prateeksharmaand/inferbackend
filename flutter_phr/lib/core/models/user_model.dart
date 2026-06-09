class UserModel {
  final String? id;
  final String email;
  final String? firstName;
  final String? lastName;
  final String? phone;
  final DateTime? dateOfBirth;
  final String? gender;
  final String? bloodType;
  final double? height;
  final double? weight;
  final List<String> conditions;
  final List<String> allergies;
  final String? emergencyContactName;
  final String? emergencyContactPhone;
  final String? avatarUrl;
  final String? token;

  const UserModel({
    this.id, required this.email, this.firstName, this.lastName,
    this.phone, this.dateOfBirth, this.gender, this.bloodType,
    this.height, this.weight, this.conditions = const [], this.allergies = const [],
    this.emergencyContactName, this.emergencyContactPhone,
    this.avatarUrl, this.token,
  });

  String get fullName => '${firstName ?? ''} ${lastName ?? ''}'.trim();
  String get initials {
    final f = firstName?.isNotEmpty == true ? firstName![0] : '';
    final l = lastName?.isNotEmpty == true ? lastName![0] : '';
    return (f + l).toUpperCase();
  }
  int? get age {
    if (dateOfBirth == null) return null;
    final now = DateTime.now();
    int age = now.year - dateOfBirth!.year;
    if (now.month < dateOfBirth!.month || (now.month == dateOfBirth!.month && now.day < dateOfBirth!.day)) age--;
    return age;
  }

  factory UserModel.fromJson(Map<String, dynamic> json) => UserModel(
    id: json['id']?.toString(),
    email: json['email'] ?? '',
    firstName: json['first_name'],
    lastName: json['last_name'],
    phone: json['phone'],
    dateOfBirth: json['date_of_birth'] != null ? DateTime.parse(json['date_of_birth']) : null,
    gender: json['gender'],
    bloodType: json['blood_type'],
    height: json['height']?.toDouble(),
    weight: json['weight']?.toDouble(),
    conditions: List<String>.from(json['conditions'] ?? []),
    allergies: List<String>.from(json['allergies'] ?? []),
    emergencyContactName: json['emergency_contact_name'],
    emergencyContactPhone: json['emergency_contact_phone'],
    avatarUrl: json['avatar_url'],
    token: json['token'],
  );

  Map<String, dynamic> toJson() => {
    'email': email, 'first_name': firstName, 'last_name': lastName,
    'phone': phone, 'date_of_birth': dateOfBirth?.toIso8601String(),
    'gender': gender, 'blood_type': bloodType, 'height': height, 'weight': weight,
    'conditions': conditions, 'allergies': allergies,
    'emergency_contact_name': emergencyContactName,
    'emergency_contact_phone': emergencyContactPhone,
  };

  UserModel copyWith({String? firstName, String? lastName, String? phone,
    DateTime? dateOfBirth, String? gender, String? bloodType,
    double? height, double? weight, List<String>? conditions,
    List<String>? allergies, String? emergencyContactName,
    String? emergencyContactPhone, String? avatarUrl}) => UserModel(
    id: id, email: email, token: token,
    firstName: firstName ?? this.firstName, lastName: lastName ?? this.lastName,
    phone: phone ?? this.phone, dateOfBirth: dateOfBirth ?? this.dateOfBirth,
    gender: gender ?? this.gender, bloodType: bloodType ?? this.bloodType,
    height: height ?? this.height, weight: weight ?? this.weight,
    conditions: conditions ?? this.conditions, allergies: allergies ?? this.allergies,
    emergencyContactName: emergencyContactName ?? this.emergencyContactName,
    emergencyContactPhone: emergencyContactPhone ?? this.emergencyContactPhone,
    avatarUrl: avatarUrl ?? this.avatarUrl,
  );
}
