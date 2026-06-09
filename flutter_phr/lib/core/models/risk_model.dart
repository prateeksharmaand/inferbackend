import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

enum RiskLevel { low, moderate, high, critical }

class RiskFactor {
  final String label;
  final int weight;
  final String category;
  final double value;

  const RiskFactor({
    required this.label,
    required this.weight,
    required this.category,
    required this.value,
  });

  factory RiskFactor.fromJson(Map<String, dynamic> json) => RiskFactor(
    label:    json['label']    as String? ?? '',
    weight:   (json['weight']  as num?)?.toInt() ?? 0,
    category: json['category'] as String? ?? 'general',
    value:    (json['value']   as num?)?.toDouble() ?? 0,
  );
}

class RiskRecommendation {
  final String summary;
  final List<String> recommendations;
  final bool urgent;

  const RiskRecommendation({
    required this.summary,
    required this.recommendations,
    required this.urgent,
  });

  factory RiskRecommendation.fromJson(Map<String, dynamic> json) =>
      RiskRecommendation(
        summary:         json['summary'] as String? ?? '',
        recommendations: (json['recommendations'] as List<dynamic>?)
                ?.map((e) => e.toString())
                .toList() ??
            [],
        urgent: json['urgent'] as bool? ?? false,
      );

  factory RiskRecommendation.empty() => const RiskRecommendation(
    summary: '',
    recommendations: [],
    urgent: false,
  );
}

class RiskResult {
  final String id;
  final int score;
  final RiskLevel level;
  final List<RiskFactor> factors;
  final RiskRecommendation recommendation;
  final DateTime computedAt;

  const RiskResult({
    required this.id,
    required this.score,
    required this.level,
    required this.factors,
    required this.recommendation,
    required this.computedAt,
  });

  factory RiskResult.fromJson(Map<String, dynamic> json) {
    final levelStr = json['level'] as String? ?? 'low';
    final level = RiskLevel.values.firstWhere(
      (e) => e.name == levelStr,
      orElse: () => RiskLevel.low,
    );

    final factorsRaw = json['factors'];
    final factors = factorsRaw is List
        ? factorsRaw.map((e) => RiskFactor.fromJson(e as Map<String, dynamic>)).toList()
        : <RiskFactor>[];

    final recRaw = json['recommendation'];
    final recommendation = recRaw is Map<String, dynamic>
        ? RiskRecommendation.fromJson(recRaw)
        : RiskRecommendation.empty();

    return RiskResult(
      id:             json['id'] as String? ?? '',
      score:          (json['score'] as num?)?.toInt() ?? 0,
      level:          level,
      factors:        factors,
      recommendation: recommendation,
      computedAt:     DateTime.tryParse(json['computedAt'] as String? ?? '') ?? DateTime.now(),
    );
  }

  Color get levelColor {
    switch (level) {
      case RiskLevel.low:      return AppColors.success;
      case RiskLevel.moderate: return AppColors.warning;
      case RiskLevel.high:     return const Color(0xFFFF6B35);
      case RiskLevel.critical: return AppColors.error;
    }
  }

  Color get levelBgColor {
    switch (level) {
      case RiskLevel.low:      return AppColors.successLight;
      case RiskLevel.moderate: return const Color(0xFFFFF8E1);
      case RiskLevel.high:     return const Color(0xFFFFF0E8);
      case RiskLevel.critical: return const Color(0xFFFFEBEE);
    }
  }

  String get levelLabel {
    switch (level) {
      case RiskLevel.low:      return 'Low Risk';
      case RiskLevel.moderate: return 'Moderate Risk';
      case RiskLevel.high:     return 'High Risk';
      case RiskLevel.critical: return 'Critical';
    }
  }

  IconData get levelIcon {
    switch (level) {
      case RiskLevel.low:      return Icons.shield_outlined;
      case RiskLevel.moderate: return Icons.warning_amber_rounded;
      case RiskLevel.high:     return Icons.dangerous_outlined;
      case RiskLevel.critical: return Icons.emergency_rounded;
    }
  }

  String get categoryIcon {
    if (factors.isEmpty) return 'shield';
    final topCategory = factors.reduce((a, b) => a.weight >= b.weight ? a : b).category;
    return topCategory;
  }
}
