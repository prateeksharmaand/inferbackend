import 'package:flutter/material.dart';
import '../../core/theme/app_theme.dart';

class CustomButton extends StatelessWidget {
  final String text;
  final VoidCallback? onPressed;
  final bool isLoading;
  final Color? backgroundColor;
  final IconData? icon;
  final bool outlined;

  const CustomButton({super.key, required this.text, this.onPressed, this.isLoading = false, this.backgroundColor, this.icon, this.outlined = false});

  @override
  Widget build(BuildContext context) {
    final btn = SizedBox(width: double.infinity, height: 52, child: outlined ? OutlinedButton(
      onPressed: isLoading ? null : onPressed,
      style: OutlinedButton.styleFrom(foregroundColor: backgroundColor ?? AppColors.primary, side: BorderSide(color: backgroundColor ?? AppColors.primary, width: 1.5), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14))),
      child: _content(backgroundColor ?? AppColors.primary),
    ) : ElevatedButton(
      onPressed: isLoading ? null : onPressed,
      style: ElevatedButton.styleFrom(backgroundColor: backgroundColor ?? AppColors.primary, foregroundColor: Colors.white, elevation: 0, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14))),
      child: _content(Colors.white),
    ));
    return btn;
  }

  Widget _content(Color color) => isLoading
    ? SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.5, color: color))
    : Row(mainAxisAlignment: MainAxisAlignment.center, children: [
        if (icon != null) ...[Icon(icon, size: 18), const SizedBox(width: 8)],
        Text(text, style: TextStyle(fontFamily: 'Poppins', fontSize: 15, fontWeight: FontWeight.w600, color: color)),
      ]);
}

class CustomTextField extends StatelessWidget {
  final TextEditingController controller;
  final String label;
  final String? hint;
  final bool obscureText;
  final TextInputType? keyboardType;
  final Widget? prefixIcon;
  final Widget? suffixIcon;
  final String? suffixText;
  final FormFieldValidator<String>? validator;
  final int? maxLines;
  final bool enabled;
  final void Function(String)? onChanged;

  const CustomTextField({
    super.key, required this.controller, required this.label,
    this.hint, this.obscureText = false, this.keyboardType,
    this.prefixIcon, this.suffixIcon, this.suffixText,
    this.validator, this.maxLines = 1, this.enabled = true, this.onChanged,
  });

  @override
  Widget build(BuildContext context) => TextFormField(
    controller: controller, obscureText: obscureText,
    keyboardType: keyboardType, maxLines: maxLines, enabled: enabled,
    style: AppTextStyles.body1, onChanged: onChanged,
    decoration: InputDecoration(
      labelText: label, hintText: hint,
      prefixIcon: prefixIcon, suffixIcon: suffixIcon,
      suffix: suffixText != null ? Text(suffixText!, style: AppTextStyles.caption) : null,
    ),
    validator: validator,
  );
}

class SectionHeader extends StatelessWidget {
  final String title;
  final String? actionLabel;
  final VoidCallback? onAction;
  const SectionHeader({super.key, required this.title, this.actionLabel, this.onAction});

  @override
  Widget build(BuildContext context) => Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
    Text(title, style: AppTextStyles.h5),
    if (actionLabel != null) TextButton(onPressed: onAction, child: Text(actionLabel!, style: const TextStyle(fontFamily: 'Poppins', fontSize: 12, color: AppColors.primary))),
  ]);
}

class LoadingWidget extends StatelessWidget {
  final String? message;
  const LoadingWidget({super.key, this.message});
  @override
  Widget build(BuildContext context) => Center(child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
    const CircularProgressIndicator(color: AppColors.primary, strokeWidth: 2.5),
    if (message != null) ...[const SizedBox(height: 16), Text(message!, style: AppTextStyles.body2)],
  ]));
}

class ErrorWidget extends StatelessWidget {
  final String message;
  final VoidCallback? onRetry;
  const ErrorWidget({super.key, required this.message, this.onRetry});
  @override
  Widget build(BuildContext context) => Center(child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
    const Icon(Icons.error_outline, size: 48, color: AppColors.error),
    const SizedBox(height: 16),
    Text(message, style: AppTextStyles.body2, textAlign: TextAlign.center),
    if (onRetry != null) ...[const SizedBox(height: 16), ElevatedButton(onPressed: onRetry, child: const Text('Retry'))],
  ]));
}

class VitalStatusBadge extends StatelessWidget {
  final String status;
  const VitalStatusBadge({super.key, required this.status});

  @override
  Widget build(BuildContext context) {
    final data = _data(status);
    return Container(padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3), decoration: BoxDecoration(color: data.$1.withOpacity(0.1), borderRadius: BorderRadius.circular(8)), child: Row(mainAxisSize: MainAxisSize.min, children: [
      Icon(data.$2, color: data.$1, size: 12),
      const SizedBox(width: 4),
      Text(status.toUpperCase(), style: TextStyle(fontFamily: 'Poppins', fontSize: 10, color: data.$1, fontWeight: FontWeight.w600)),
    ]));
  }

  (Color, IconData) _data(String status) {
    switch (status) {
      case 'normal': return (AppColors.success, Icons.check_circle_outline);
      case 'elevated': return (AppColors.warning, Icons.arrow_upward);
      case 'high': return (AppColors.error, Icons.warning_amber_outlined);
      case 'critical': return (const Color(0xFFDC2626), Icons.emergency_outlined);
      case 'low': return (AppColors.info, Icons.arrow_downward);
      default: return (AppColors.textSecondary, Icons.help_outline);
    }
  }
}
