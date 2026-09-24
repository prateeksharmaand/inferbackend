import 'package:flutter/material.dart';
import '../../core/theme/app_theme.dart';

/// Shown on AI-generated health content (App Store guideline 1.4.1).
class MedicalDisclaimer extends StatelessWidget {
  final String text;
  const MedicalDisclaimer({
    super.key,
    this.text = 'AI-generated information for general awareness only — not a medical diagnosis or advice. Always consult a qualified doctor. In an emergency, call 112.',
  });

  @override
  Widget build(BuildContext context) => Container(
    width: double.infinity,
    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
    color: AppColors.surfaceVariant,
    child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const Icon(Icons.info_outline_rounded, size: 14, color: AppColors.textHint),
      const SizedBox(width: 8),
      Expanded(child: Text(text, style: AppTextStyles.caption.copyWith(color: AppColors.textHint, height: 1.4))),
    ]),
  );
}
