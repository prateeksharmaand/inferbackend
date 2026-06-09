class AbhaAccount {
  final bool linked;
  final String? abhaNumber;
  final String? abhaAddress;
  final String? name;
  final String? mobile;
  final String? gender;
  final String? dateOfBirth;
  final DateTime? createdAt;

  const AbhaAccount({
    this.linked = false,
    this.abhaNumber,
    this.abhaAddress,
    this.name,
    this.mobile,
    this.gender,
    this.dateOfBirth,
    this.createdAt,
  });

  factory AbhaAccount.fromJson(Map<String, dynamic> j) => AbhaAccount(
        linked: j['linked'] as bool? ?? true,
        abhaNumber: j['abha_number'] as String? ?? j['ABHANumber'] as String?,
        abhaAddress: j['abha_address'] as String? ??
            (j['phrAddress'] is List ? (j['phrAddress'] as List).first as String? : null),
        name: j['name'] as String?,
        mobile: j['mobile'] as String?,
        gender: j['gender'] as String?,
        dateOfBirth: j['dateOfBirth'] as String?,
        createdAt: j['created_at'] != null ? DateTime.tryParse(j['created_at'] as String) : null,
      );

  String get formattedAbhaNumber {
    if (abhaNumber == null) return '';
    final n = abhaNumber!.replaceAll('-', '');
    if (n.length == 14) return '${n.substring(0, 2)}-${n.substring(2, 6)}-${n.substring(6, 10)}-${n.substring(10)}';
    return abhaNumber!;
  }
}

class CareContext {
  final String hipId;
  final String referenceNumber;
  final String display;
  final String hiType;
  final DateTime? linkedAt;

  const CareContext({
    required this.hipId,
    required this.referenceNumber,
    required this.display,
    this.hiType = 'OPConsultation',
    this.linkedAt,
  });

  factory CareContext.fromJson(Map<String, dynamic> j) => CareContext(
        hipId: j['hip_id'] as String? ?? j['hipId'] as String? ?? '',
        referenceNumber:
            j['reference_number'] as String? ?? j['referenceNumber'] as String? ?? '',
        display: j['display'] as String? ?? '',
        hiType: j['hi_type'] as String? ?? j['hiType'] as String? ?? 'OPConsultation',
        linkedAt: j['linked_at'] != null ? DateTime.tryParse(j['linked_at'] as String) : null,
      );
}

class ConsentRequest {
  final String id;
  final String requestId;
  final String hiuId;
  final String purpose;
  final String status;
  final DateTime createdAt;

  const ConsentRequest({
    required this.id,
    required this.requestId,
    required this.hiuId,
    required this.purpose,
    required this.status,
    required this.createdAt,
  });

  factory ConsentRequest.fromJson(Map<String, dynamic> j) => ConsentRequest(
        id: j['id']?.toString() ?? '',
        requestId: j['request_id'] as String? ?? '',
        hiuId: j['hiu_id'] as String? ?? '',
        purpose: j['purpose'] as String? ?? '',
        status: j['status'] as String? ?? 'REQUESTED',
        createdAt: DateTime.parse(j['created_at'] as String),
      );

  bool get isGranted => status == 'GRANTED';
  bool get isDenied  => status == 'DENIED' || status == 'REVOKED' || status == 'EXPIRED';
}

class HealthRecord {
  final String transactionId;
  final String careContextReference;
  final String? content;
  final String? media;
  final DateTime receivedAt;

  const HealthRecord({
    required this.transactionId,
    required this.careContextReference,
    this.content,
    this.media,
    required this.receivedAt,
  });

  factory HealthRecord.fromJson(Map<String, dynamic> j) => HealthRecord(
        transactionId: j['transaction_id'] as String? ?? '',
        careContextReference: j['care_context_reference'] as String? ?? '',
        content: j['content'] as String?,
        media: j['media'] as String?,
        receivedAt: DateTime.parse(j['received_at'] as String),
      );
}
