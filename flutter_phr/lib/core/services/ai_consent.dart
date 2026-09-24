import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../constants/app_constants.dart';
import '../theme/app_theme.dart';
import 'package:url_launcher/url_launcher.dart';
import 'api_service.dart';

/// Consent to send health data to the third-party AI provider (Google Gemini).
/// Required by App Store guideline 5.1.2(i) before any personal data is shared with third-party AI.
class AiConsent {
  static const _key = 'ai_data_sharing_consent';
  static bool? _granted;

  /// null = not asked yet.
  static bool? get granted => _granted;
  static bool get isGranted => _granted == true;

  static Future<void> load() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      _granted = prefs.getBool(_key);
    } catch (_) {}
  }

  static Future<void> set(bool value) async {
    _granted = value;
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setBool(_key, value);
    } catch (_) {}
    // The server also needs it: Gmail imports and uploads are analysed server-side.
    try {
      await ApiService().put('/auth/ai-consent', data: {'granted': value});
    } catch (_) {}
  }

  static Future<void> clear() async {
    _granted = null;
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(_key);
    } catch (_) {}
  }

  /// Shows the consent dialog and stores the answer. Returns true if granted.
  static Future<bool> request(BuildContext context) async {
    final result = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        title: const Text('Allow AI health insights?'),
        content: SingleChildScrollView(child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text(
            'Infer\'s AI features — health chat, drug checker, risk scores, symptom self-check and automatic report analysis — '
            'send the data you enter, your vitals and the text of documents you upload to Google\'s Gemini AI service to generate results.',
            style: AppTextStyles.body2,
          ),
          const SizedBox(height: 10),
          const Text(
            'Google processes this data only to return a response to Infer. It is not used for advertising. '
            'You can still use the rest of the app if you don\'t allow this, and you can change your choice anytime in Profile.',
            style: AppTextStyles.body2,
          ),
          const SizedBox(height: 10),
          GestureDetector(
            onTap: () => launchUrl(Uri.parse(AppConstants.privacyPolicyUrl)),
            child: Text('Read our Privacy Policy', style: AppTextStyles.body2.copyWith(color: AppColors.primary, decoration: TextDecoration.underline)),
          ),
        ])),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Don\'t Allow')),
          TextButton(onPressed: () => Navigator.of(ctx).pop(true), child: const Text('Allow')),
        ],
      ),
    );
    final granted = result ?? false;
    await set(granted);
    return granted;
  }
}

/// Asks, for one specific document, whether it may be sent to the AI provider.
/// Returns true (analyse), false (don't analyse) or null (user cancelled).
Future<bool?> askAiAnalysisForDocument(BuildContext context) => showDialog<bool>(
  context: context,
  builder: (ctx) => AlertDialog(
    title: const Text('Analyse this report with AI?'),
    content: SingleChildScrollView(child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
      const Text(
        'To create a Smart Report, Infer sends the text of this document to Google\'s Gemini AI service, '
        'which reads the values and summarises them. The document is still saved to your records if you choose not to.',
        style: AppTextStyles.body2,
      ),
      const SizedBox(height: 10),
      GestureDetector(
        onTap: () => launchUrl(Uri.parse(AppConstants.privacyPolicyUrl)),
        child: Text('Read our Privacy Policy', style: AppTextStyles.body2.copyWith(color: AppColors.primary, decoration: TextDecoration.underline)),
      ),
    ])),
    actions: [
      TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Upload without AI')),
      TextButton(onPressed: () => Navigator.of(ctx).pop(true), child: const Text('Analyse with AI')),
    ],
  ),
);

/// Wraps an AI-powered screen: shows an explanation + Allow button until the user consents.
class AiConsentGate extends StatefulWidget {
  final Widget child;
  final String featureName;
  const AiConsentGate({super.key, required this.child, required this.featureName});

  @override
  State<AiConsentGate> createState() => _AiConsentGateState();
}

class _AiConsentGateState extends State<AiConsentGate> {
  @override
  Widget build(BuildContext context) {
    if (AiConsent.isGranted) return widget.child;
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(title: Text(widget.featureName)),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
          const Icon(Icons.auto_awesome, size: 48, color: AppColors.primary),
          const SizedBox(height: 16),
          Text('${widget.featureName} uses AI', style: AppTextStyles.h4, textAlign: TextAlign.center),
          const SizedBox(height: 8),
          const Text(
            'To use this feature, allow Infer to send the relevant health data to Google\'s Gemini AI service.',
            style: AppTextStyles.body2, textAlign: TextAlign.center,
          ),
          const SizedBox(height: 24),
          ElevatedButton(
            onPressed: () async {
              await AiConsent.request(context);
              if (mounted) setState(() {});
            },
            child: const Text('Review & Allow'),
          ),
        ]),
      ),
    );
  }
}
