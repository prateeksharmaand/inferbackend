class ChatMessage {
  final String id;
  final String content;
  final bool isUser;
  final DateTime timestamp;
  final String? messageType;
  final Map<String, dynamic>? metadata;

  const ChatMessage({
    required this.id, required this.content, required this.isUser,
    required this.timestamp, this.messageType, this.metadata,
  });

  factory ChatMessage.fromJson(Map<String, dynamic> json) => ChatMessage(
    id: json['id']?.toString() ?? '',
    content: json['content'] ?? '',
    isUser: json['is_user'] ?? false,
    timestamp: DateTime.parse(json['timestamp'] ?? DateTime.now().toIso8601String()),
    messageType: json['message_type'],
    metadata: json['metadata'] != null ? Map<String, dynamic>.from(json['metadata']) : null,
  );

  Map<String, dynamic> toJson() => {
    'id': id, 'content': content, 'is_user': isUser,
    'timestamp': timestamp.toIso8601String(), 'message_type': messageType,
    'metadata': metadata,
  };
}

class DrugInteraction {
  final String drug1;
  final String drug2;
  final String severity;
  final String description;
  final String recommendation;

  const DrugInteraction({
    required this.drug1, required this.drug2, required this.severity,
    required this.description, required this.recommendation,
  });

  factory DrugInteraction.fromJson(Map<String, dynamic> json) => DrugInteraction(
    drug1: json['drug1'] ?? '',
    drug2: json['drug2'] ?? '',
    severity: json['severity'] ?? 'unknown',
    description: json['description'] ?? '',
    recommendation: json['recommendation'] ?? '',
  );
}

class NotificationModel {
  final String id;
  final String title;
  final String body;
  final String type;
  final Map<String, dynamic>? data;
  final DateTime createdAt;
  final bool isRead;

  const NotificationModel({
    required this.id, required this.title, required this.body,
    required this.type, this.data, required this.createdAt, this.isRead = false,
  });

  factory NotificationModel.fromJson(Map<String, dynamic> json) => NotificationModel(
    id: json['id']?.toString() ?? '',
    title: json['title'] ?? '',
    body: json['body'] ?? '',
    type: json['type'] ?? '',
    data: json['data'] != null ? Map<String, dynamic>.from(json['data']) : null,
    createdAt: DateTime.parse(json['created_at']),
    isRead: json['is_read'] ?? false,
  );
}
