class AppConstants {
  static const String baseUrl = String.fromEnvironment('API_BASE_URL', defaultValue: 'https://api.inferapp.online/api');
  static String get fileBaseUrl => baseUrl.replaceFirst(RegExp(r'/api/?$'), '');
  static const int connectTimeout = 30000;
  static const int receiveTimeout = 30000;
  static const String tokenKey = 'auth_token';
  static const String refreshTokenKey = 'refresh_token';
  static const String userKey = 'user_data';
  static const String encryptionKey = 'encryption_key';

  static const Map<String, Map<String, double>> vitalThresholds = {
    'systolic': {'low': 90, 'normal_min': 90, 'normal_max': 120, 'elevated': 130, 'high': 140, 'crisis': 180},
    'diastolic': {'low': 60, 'normal_min': 60, 'normal_max': 80, 'elevated': 80, 'high': 90, 'crisis': 120},
    'glucose_fasting': {'low': 70, 'normal_max': 100, 'prediabetes': 126, 'diabetes': 200},
    'spo2': {'critical': 90, 'low': 94, 'normal_min': 95},
    'heart_rate': {'bradycardia': 60, 'normal_min': 60, 'normal_max': 100, 'tachycardia': 100},
    'temperature_c': {'low': 36.0, 'normal_min': 36.1, 'normal_max': 37.2, 'fever': 38.0, 'high_fever': 39.0},
  };

  static const Map<String, String> loincCodes = {
    'blood_pressure_systolic': '8480-6',
    'blood_pressure_diastolic': '8462-4',
    'blood_pressure_panel': '55284-4',
    'heart_rate': '8867-4',
    'body_weight': '29463-7',
    'body_height': '8302-2',
    'bmi': '39156-5',
    'body_temperature': '8310-5',
    'oxygen_saturation': '59408-5',
    'glucose': '15074-8',
    'glucose_fasting': '1558-6',
    'hemoglobin_a1c': '4548-4',
    'respiratory_rate': '9279-1',
  };

  static const List<String> documentTypes = [
    'Lab Report', 'Prescription', 'Discharge Summary',
    'Radiology Report', 'Consultation Notes', 'Vaccination Record',
    'Insurance Document', 'Other',
  ];

  static const List<String> commonConditions = [
    'Hypertension', 'Diabetes Type 1', 'Diabetes Type 2', 'Asthma',
    'Heart Disease', 'Kidney Disease', 'Thyroid Disorder', 'Arthritis',
    'COPD', 'Depression', 'Anxiety', 'High Cholesterol', 'None',
  ];

  static const List<String> bloodTypes = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];

}

class AppRoutes {
  static const String splash = '/';
  static const String login = '/login';
  static const String register = '/register';
  static const String home = '/home';
  static const String vitals = '/vitals';
  static const String addVital = '/vitals/add';
  static const String heartRate = '/vitals/heart-rate';
  static const String documents = '/documents';
  static const String uploadDocument = '/documents/upload';
  static const String documentDetail = '/documents/:id';
  static const String documentReport = '/documents/report';
  static const String profile = '/profile';
  static const String editProfile = '/profile/edit';
  static const String timeline = '/timeline';
  static const String healthbot = '/healthbot';
  static const String allVitals = '/all-vitals';
  static const String riskPrediction = '/risk';
  static const String selfAssessment = '/self-assessment';
  static const String onboarding = '/onboarding';

  // ABDM / ABHA routes
  static const String abdmHome         = '/abdm';
  static const String abhaCreate       = '/abdm/create';
  static const String abhaCard         = '/abdm/card';
  static const String abdmLinkRecords  = '/abdm/link-records';
  static const String abdmConsents     = '/abdm/consents';
  static const String abdmHealthRecords = '/abdm/health-records';
}
