class DocumentModel {
  final String? id;
  final String userId;
  final String title;
  final String type;
  final String? filePath;
  final String? fileUrl;
  final String? mimeType;
  final int? fileSize;
  final String? ocrText;
  final Map<String, dynamic>? extractedVitals;
  final bool isEncrypted;
  final String? doctorName;
  final String? facilityName;
  final DateTime? documentDate;
  final DateTime uploadedAt;
  final List<String> tags;

  const DocumentModel({
    this.id, required this.userId, required this.title, required this.type,
    this.filePath, this.fileUrl, this.mimeType, this.fileSize,
    this.ocrText, this.extractedVitals, this.isEncrypted = true,
    this.doctorName, this.facilityName, this.documentDate,
    required this.uploadedAt, this.tags = const [],
  });

  factory DocumentModel.fromJson(Map<String, dynamic> json) => DocumentModel(
    id: json['id']?.toString(),
    userId: json['user_id']?.toString() ?? '',
    title: json['title'] ?? '',
    type: json['type'] ?? 'Other',
    filePath: json['file_path'],
    fileUrl: json['file_url'],
    mimeType: json['mime_type'],
    fileSize: json['file_size'],
    ocrText: json['ocr_text'],
    extractedVitals: json['extracted_vitals'] != null ? Map<String, dynamic>.from(json['extracted_vitals']) : null,
    isEncrypted: json['is_encrypted'] ?? true,
    doctorName: json['doctor_name'],
    facilityName: json['facility_name'],
    documentDate: json['document_date'] != null ? DateTime.parse(json['document_date']) : null,
    uploadedAt: DateTime.parse(json['uploaded_at'] ?? DateTime.now().toIso8601String()),
    tags: List<String>.from(json['tags'] ?? []),
  );

  Map<String, dynamic> toJson() => {
    'user_id': userId, 'title': title, 'type': type,
    'ocr_text': ocrText, 'extracted_vitals': extractedVitals,
    'is_encrypted': isEncrypted, 'doctor_name': doctorName,
    'facility_name': facilityName, 'document_date': documentDate?.toIso8601String(),
    'tags': tags,
  };

  String get fileSizeDisplay {
    if (fileSize == null) return '';
    if (fileSize! < 1024) return '$fileSize B';
    if (fileSize! < 1024 * 1024) return '${(fileSize! / 1024).toStringAsFixed(1)} KB';
    return '${(fileSize! / (1024 * 1024)).toStringAsFixed(1)} MB';
  }
}

class TimelineEvent {
  final String id;
  final String userId;
  final String eventType;
  final String title;
  final String? description;
  final Map<String, dynamic>? data;
  final DateTime eventDate;
  final String? icon;
  final String? color;

  const TimelineEvent({
    required this.id, required this.userId, required this.eventType,
    required this.title, this.description, this.data,
    required this.eventDate, this.icon, this.color,
  });

  factory TimelineEvent.fromJson(Map<String, dynamic> json) => TimelineEvent(
    id: json['id']?.toString() ?? '',
    userId: json['user_id']?.toString() ?? '',
    eventType: json['event_type'] ?? '',
    title: json['title'] ?? '',
    description: json['description'],
    data: json['data'] != null ? Map<String, dynamic>.from(json['data']) : null,
    eventDate: DateTime.parse(json['event_date']),
    icon: json['icon'],
    color: json['color'],
  );
}
