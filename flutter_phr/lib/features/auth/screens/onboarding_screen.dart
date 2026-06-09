import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../../core/constants/app_constants.dart';
import '../../../core/theme/app_theme.dart';

// ── Data ─────────────────────────────────────────────────────────────────────

class _Page {
  final IconData icon;
  final Color accentColor;
  final String tag;
  final String title;
  final String description;
  final List<(IconData, String)> features;

  const _Page({
    required this.icon,
    required this.accentColor,
    required this.tag,
    required this.title,
    required this.description,
    required this.features,
  });
}

const _kPages = [
  _Page(
    icon: Icons.health_and_safety_rounded,
    accentColor: Color(0xFF9C8FFA),
    tag: 'HEALTH RECORDS',
    title: 'Your Health,\nAll in One Place',
    description: 'Store medical records, lab reports, prescriptions and vitals securely in your personal health hub.',
    features: [
      (Icons.description_rounded,     'Lab Reports & Prescriptions'),
      (Icons.monitor_heart_outlined,  'Vital Signs Tracking'),
      (Icons.cloud_upload_rounded,    'Secure Cloud Storage'),
    ],
  ),
  _Page(
    icon: Icons.auto_awesome_rounded,
    accentColor: Color(0xFFB8AEFB),
    tag: 'AI INTELLIGENCE',
    title: 'AI-Powered Health\nInsights',
    description: 'Get personalised risk assessments, smart health advice, and deep analysis of your medical history.',
    features: [
      (Icons.analytics_rounded,       'Risk Prediction Engine'),
      (Icons.chat_bubble_rounded,     'AI Health Consultation'),
      (Icons.assignment_rounded,      'Self Assessment Tool'),
    ],
  ),
  _Page(
    icon: Icons.timeline_rounded,
    accentColor: Color(0xFF7B6EF6),
    tag: 'STAY IN CONTROL',
    title: 'Stay Ahead of\nYour Health',
    description: 'Track your health journey over time, set smart reminders, and never miss an important health update.',
    features: [
      (Icons.timeline_rounded,        'Health Timeline'),
      (Icons.alarm_rounded,           'Medication Reminders'),
      (Icons.mail_rounded,            'Auto Gmail Import'),
    ],
  ),
];

// ── Screen ────────────────────────────────────────────────────────────────────

class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({super.key});

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen>
    with TickerProviderStateMixin {
  final _pageCtrl = PageController();
  int _page = 0;

  late final AnimationController _pulseCtrl;
  late final AnimationController _enterCtrl;
  late final Animation<double> _pulseScale;
  late final Animation<double> _enterFade;

  @override
  void initState() {
    super.initState();
    _pulseCtrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 1800))
      ..repeat(reverse: true);
    _enterCtrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 500));
    _pulseScale = Tween<double>(begin: 1.0, end: 1.07)
        .animate(CurvedAnimation(parent: _pulseCtrl, curve: Curves.easeInOut));
    _enterFade = Tween<double>(begin: 0.0, end: 1.0)
        .animate(CurvedAnimation(parent: _enterCtrl, curve: Curves.easeOut));
    _enterCtrl.forward();
  }

  @override
  void dispose() {
    _pageCtrl.dispose();
    _pulseCtrl.dispose();
    _enterCtrl.dispose();
    super.dispose();
  }

  Future<void> _complete() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('onboarding_done', true);
    if (mounted) context.go(AppRoutes.login);
  }

  void _next() {
    if (_page < _kPages.length - 1) {
      _pageCtrl.nextPage(
          duration: const Duration(milliseconds: 380), curve: Curves.easeOutCubic);
    } else {
      _complete();
    }
  }

  void _onPageChanged(int i) {
    setState(() => _page = i);
    _enterCtrl.forward(from: 0);
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.of(context).size;
    final isLast = _page == _kPages.length - 1;

    return Scaffold(
      body: AnimatedContainer(
        duration: const Duration(milliseconds: 500),
        curve: Curves.easeInOut,
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: [
              const Color(0xFF3A2ED4),
              const Color(0xFF5E4FE0),
              _kPages[_page].accentColor,
            ],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
        ),
        child: Stack(children: [
          // Orbs
          _Orb(diameter: size.width * 1.2,  dx: -size.width * 0.32, dy: -size.width * 0.32, opacity: 0.045),
          _Orb(diameter: size.width * 0.65, dx:  size.width * 0.55, dy:  size.height * 0.18, opacity: 0.05),
          _Orb(diameter: size.width * 0.42, dx: -size.width * 0.08, dy:  size.height * 0.38, opacity: 0.035),
          _Orb(diameter: size.width * 0.28, dx:  size.width * 0.78, dy:  size.height * 0.52, opacity: 0.04),

          Column(children: [
            // ── Top bar ─────────────────────────────────────────────────────
            SafeArea(
              bottom: false,
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
                child: Row(children: [
                  // Logo chip
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: Colors.white.withValues(alpha: 0.2)),
                    ),
                    child: Row(mainAxisSize: MainAxisSize.min, children: [
                      const Icon(Icons.favorite_rounded, color: Colors.white, size: 13),
                      const SizedBox(width: 5),
                      Text('Infer Health',
                          style: TextStyle(fontFamily: 'Poppins', fontSize: 11, fontWeight: FontWeight.w600, color: Colors.white.withValues(alpha: 0.95))),
                    ]),
                  ),
                  const Spacer(),
                  if (!isLast)
                    TextButton(
                      onPressed: _complete,
                      style: TextButton.styleFrom(
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                        backgroundColor: Colors.white.withValues(alpha: 0.12),
                      ),
                      child: Text('Skip',
                          style: TextStyle(fontFamily: 'Poppins', fontSize: 13, fontWeight: FontWeight.w500, color: Colors.white.withValues(alpha: 0.85))),
                    ),
                ]),
              ),
            ),

            // ── Icon area (PageView) ─────────────────────────────────────────
            Expanded(
              flex: 10,
              child: PageView.builder(
                controller: _pageCtrl,
                onPageChanged: _onPageChanged,
                itemCount: _kPages.length,
                itemBuilder: (_, i) => _IllustrationView(
                  page: _kPages[i],
                  pulseAnim: _pulseScale,
                  isActive: i == _page,
                ),
              ),
            ),

            // ── Bottom card ─────────────────────────────────────────────────
            Container(
              width: double.infinity,
              decoration: const BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.vertical(top: Radius.circular(32)),
              ),
              child: SafeArea(
                top: false,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(28, 28, 28, 20),
                  child: Column(mainAxisSize: MainAxisSize.min, children: [
                    // Page tag
                    FadeTransition(
                      opacity: _enterFade,
                      child: Align(
                        alignment: Alignment.centerLeft,
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                          decoration: BoxDecoration(
                            color: AppColors.primaryLight,
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: Text(_kPages[_page].tag,
                              style: const TextStyle(fontFamily: 'Poppins', fontSize: 10, fontWeight: FontWeight.w700, color: AppColors.primary, letterSpacing: 0.8)),
                        ),
                      ),
                    ),
                    const SizedBox(height: 10),

                    // Title + description
                    AnimatedSwitcher(
                      duration: const Duration(milliseconds: 300),
                      transitionBuilder: (child, anim) => FadeTransition(
                        opacity: anim,
                        child: SlideTransition(
                          position: Tween<Offset>(begin: const Offset(0.08, 0), end: Offset.zero)
                              .animate(CurvedAnimation(parent: anim, curve: Curves.easeOut)),
                          child: child,
                        ),
                      ),
                      child: Column(
                        key: ValueKey(_page),
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            _kPages[_page].title,
                            style: const TextStyle(
                              fontFamily: 'Poppins', fontSize: 24, fontWeight: FontWeight.w700,
                              color: AppColors.textPrimary, height: 1.25,
                            ),
                          ),
                          const SizedBox(height: 8),
                          Text(
                            _kPages[_page].description,
                            style: const TextStyle(
                              fontFamily: 'Poppins', fontSize: 13, fontWeight: FontWeight.w400,
                              color: AppColors.textSecondary, height: 1.65,
                            ),
                          ),
                          const SizedBox(height: 16),
                          // Feature pills
                          ..._kPages[_page].features.map((f) => Padding(
                            padding: const EdgeInsets.only(bottom: 8),
                            child: Row(children: [
                              Container(
                                width: 28, height: 28,
                                decoration: BoxDecoration(
                                  color: AppColors.primaryLight,
                                  borderRadius: BorderRadius.circular(8),
                                ),
                                child: Icon(f.$1, color: AppColors.primary, size: 14),
                              ),
                              const SizedBox(width: 10),
                              Text(f.$2,
                                  style: const TextStyle(fontFamily: 'Poppins', fontSize: 13, fontWeight: FontWeight.w500, color: AppColors.textPrimary)),
                            ]),
                          )),
                        ],
                      ),
                    ),

                    const SizedBox(height: 24),

                    // Dots + button
                    Row(crossAxisAlignment: CrossAxisAlignment.center, children: [
                      // Dots
                      Row(children: List.generate(_kPages.length, (i) => AnimatedContainer(
                        duration: const Duration(milliseconds: 260),
                        curve: Curves.easeOut,
                        margin: const EdgeInsets.only(right: 6),
                        width:  i == _page ? 22 : 8,
                        height: 8,
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(4),
                          color: i == _page ? AppColors.primary : AppColors.border,
                        ),
                      ))),
                      const Spacer(),
                      // Button
                      GestureDetector(
                        onTap: _next,
                        child: AnimatedContainer(
                          duration: const Duration(milliseconds: 300),
                          curve: Curves.easeOut,
                          padding: isLast
                              ? const EdgeInsets.symmetric(horizontal: 22, vertical: 14)
                              : const EdgeInsets.all(15),
                          decoration: BoxDecoration(
                            gradient: const LinearGradient(
                              colors: AppColors.aiGradient,
                              begin: Alignment.topLeft,
                              end: Alignment.bottomRight,
                            ),
                            borderRadius: BorderRadius.circular(isLast ? 16 : 50),
                            boxShadow: [BoxShadow(
                              color: AppColors.primary.withValues(alpha: 0.35),
                              blurRadius: 14,
                              offset: const Offset(0, 4),
                            )],
                          ),
                          child: Row(mainAxisSize: MainAxisSize.min, children: [
                            if (isLast) ...[
                              const Text('Get Started',
                                  style: TextStyle(fontFamily: 'Poppins', fontSize: 15, fontWeight: FontWeight.w700, color: Colors.white)),
                              const SizedBox(width: 8),
                            ],
                            const Icon(Icons.arrow_forward_rounded, color: Colors.white, size: 20),
                          ]),
                        ),
                      ),
                    ]),
                  ]),
                ),
              ),
            ),
          ]),
        ]),
      ),
    );
  }
}

// ── Illustration ──────────────────────────────────────────────────────────────

class _IllustrationView extends StatelessWidget {
  final _Page page;
  final Animation<double> pulseAnim;
  final bool isActive;
  const _IllustrationView({required this.page, required this.pulseAnim, required this.isActive});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: ScaleTransition(
        scale: pulseAnim,
        child: Stack(alignment: Alignment.center, children: [
          // Outermost ring
          Container(
            width: 210, height: 210,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: Colors.white.withValues(alpha: 0.04),
              border: Border.all(color: Colors.white.withValues(alpha: 0.1), width: 1),
            ),
          ),
          // Middle ring
          Container(
            width: 165, height: 165,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: Colors.white.withValues(alpha: 0.07),
              border: Border.all(color: Colors.white.withValues(alpha: 0.18), width: 1.5),
            ),
          ),
          // Inner circle
          Container(
            width: 118, height: 118,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              gradient: LinearGradient(
                colors: [Colors.white.withValues(alpha: 0.3), Colors.white.withValues(alpha: 0.14)],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              border: Border.all(color: Colors.white.withValues(alpha: 0.45), width: 1.5),
              boxShadow: [BoxShadow(
                color: Colors.black.withValues(alpha: 0.12),
                blurRadius: 24,
                offset: const Offset(0, 10),
              )],
            ),
            child: Icon(page.icon, color: Colors.white, size: 52),
          ),
        ]),
      ),
    );
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

class _Orb extends StatelessWidget {
  final double diameter;
  final double dx;
  final double dy;
  final double opacity;
  const _Orb({required this.diameter, required this.dx, required this.dy, required this.opacity});

  @override
  Widget build(BuildContext context) => Positioned(
    left: dx, top: dy,
    child: Container(
      width: diameter, height: diameter,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: Colors.white.withValues(alpha: opacity),
      ),
    ),
  );
}
