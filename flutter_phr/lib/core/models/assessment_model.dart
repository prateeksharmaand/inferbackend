import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

class AssessmentQuestion {
  final int id;
  final String text;
  final String type;
  final List<String> options;

  const AssessmentQuestion({
    required this.id,
    required this.text,
    required this.type,
    required this.options,
  });

  bool get isMultiple => type == 'multiple_choice';

  factory AssessmentQuestion.fromJson(Map<String, dynamic> json) =>
      AssessmentQuestion(
        id:      json['id'] as int,
        text:    json['text'] as String,
        type:    json['type'] as String,
        options: (json['options'] as List).map((e) => e as String).toList(),
      );
}

class AssessmentAnswer {
  final int questionId;
  final String question;
  final dynamic answer;

  const AssessmentAnswer({
    required this.questionId,
    required this.question,
    required this.answer,
  });

  Map<String, dynamic> toJson() => {'question': question, 'answer': answer};
}

class AssessmentResult {
  final String riskLevel;
  final int riskScore;
  final String summary;
  final List<String> findings;
  final List<String> recommendations;
  final List<String> warningSigns;
  final String whenToSeeDoctor;

  const AssessmentResult({
    required this.riskLevel,
    required this.riskScore,
    required this.summary,
    required this.findings,
    required this.recommendations,
    required this.warningSigns,
    required this.whenToSeeDoctor,
  });

  factory AssessmentResult.fromJson(Map<String, dynamic> json) =>
      AssessmentResult(
        riskLevel:        json['risk_level'] as String,
        riskScore:        json['risk_score'] as int,
        summary:          json['summary'] as String,
        findings:         (json['findings'] as List).map((e) => e as String).toList(),
        recommendations:  (json['recommendations'] as List).map((e) => e as String).toList(),
        warningSigns:     (json['warning_signs'] as List).map((e) => e as String).toList(),
        whenToSeeDoctor:  json['when_to_see_doctor'] as String,
      );

  Color get levelColor {
    switch (riskLevel) {
      case 'critical': return const Color(0xFFDC2626);
      case 'high':     return const Color(0xFFEA580C);
      case 'moderate': return const Color(0xFFD97706);
      default:         return AppColors.success;
    }
  }

  Color get levelBgColor => levelColor.withValues(alpha: 0.1);

  String get levelLabel {
    switch (riskLevel) {
      case 'critical': return 'Critical Risk';
      case 'high':     return 'High Risk';
      case 'moderate': return 'Moderate Risk';
      default:         return 'Low Risk';
    }
  }

  IconData get levelIcon {
    switch (riskLevel) {
      case 'critical': return Icons.emergency_rounded;
      case 'high':     return Icons.warning_rounded;
      case 'moderate': return Icons.info_rounded;
      default:         return Icons.check_circle_rounded;
    }
  }
}
