import 'dart:async';
import 'dart:math' as math;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import '../../../core/cubits/auth_cubit.dart';
import '../../../core/constants/app_constants.dart';

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});
  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> with TickerProviderStateMixin {
  late final AnimationController _initCtrl;
  late final AnimationController _contentCtrl;
  late final AnimationController _pulseCtrl;
  late final AnimationController _dotsCtrl;

  late final Animation<double> _logoScale;
  late final Animation<double> _logoFade;
  late final Animation<double> _textFade;
  late final Animation<Offset> _textSlide;
  late final Animation<double> _pillsFade;
  late final Animation<double> _glowOpacity;
  late final Animation<double> _pulseScale;

  bool _canNavigate = false;
  bool _isFirstTime = false;
  Timer? _navTimer;

  static const _features = [
    (Icons.description_rounded,   'Health Records'),
    (Icons.auto_awesome_rounded,  'AI Health Bot'),
    (Icons.analytics_rounded,     'Risk Prediction'),
    (Icons.timeline_rounded,      'Health Timeline'),
    (Icons.assignment_rounded,    'Self Assessment'),
  ];

  @override
  void initState() {
    super.initState();

    _initCtrl    = AnimationController(vsync: this, duration: const Duration(milliseconds: 750));
    _contentCtrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 700));
    _pulseCtrl   = AnimationController(vsync: this, duration: const Duration(milliseconds: 1800))..repeat(reverse: true);
    _dotsCtrl    = AnimationController(vsync: this, duration: const Duration(milliseconds: 900))..repeat();

    _logoScale = Tween<double>(begin: 0.4, end: 1.0).animate(
        CurvedAnimation(parent: _initCtrl, curve: Curves.elasticOut));
    _logoFade = Tween<double>(begin: 0.0, end: 1.0).animate(
        CurvedAnimation(parent: _initCtrl, curve: const Interval(0.0, 0.4, curve: Curves.easeIn)));
    _textFade = Tween<double>(begin: 0.0, end: 1.0).animate(
        CurvedAnimation(parent: _contentCtrl, curve: const Interval(0.0, 0.6, curve: Curves.easeOut)));
    _textSlide = Tween<Offset>(begin: const Offset(0, 0.25), end: Offset.zero).animate(
        CurvedAnimation(parent: _contentCtrl, curve: Curves.easeOutCubic));
    _pillsFade = Tween<double>(begin: 0.0, end: 1.0).animate(
        CurvedAnimation(parent: _contentCtrl, curve: const Interval(0.3, 1.0, curve: Curves.easeOut)));
    _glowOpacity = Tween<double>(begin: 0.25, end: 0.55).animate(
        CurvedAnimation(parent: _pulseCtrl, curve: Curves.easeInOut));
    _pulseScale = Tween<double>(begin: 1.0, end: 1.08).animate(
        CurvedAnimation(parent: _pulseCtrl, curve: Curves.easeInOut));

    _initCtrl.forward().then((_) => _contentCtrl.forward());
    _loadPrefs();
    _navTimer = Timer(const Duration(seconds: 3), () {
      if (mounted) setState(() => _canNavigate = true);
    });
  }

  Future<void> _loadPrefs() async {
    final prefs = await SharedPreferences.getInstance();
    _isFirstTime = !(prefs.getBool('onboarding_done') ?? false);
  }

  @override
  void dispose() {
    _navTimer?.cancel();
    _initCtrl.dispose();
    _contentCtrl.dispose();
    _pulseCtrl.dispose();
    _dotsCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthCubit>().state;
    if (_canNavigate) {
      if (_isFirstTime) {
        WidgetsBinding.instance.addPostFrameCallback((_) => context.go(AppRoutes.onboarding));
      } else if (auth.status == AuthStatus.authenticated) {
        WidgetsBinding.instance.addPostFrameCallback((_) => context.go(AppRoutes.home));
      } else if (auth.status == AuthStatus.unauthenticated) {
        WidgetsBinding.instance.addPostFrameCallback((_) => context.go(AppRoutes.login));
      }
    }

    final size = MediaQuery.of(context).size;

    return Scaffold(
      body: Container(
        width: double.infinity,
        height: double.infinity,
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            colors: [Color(0xFF3A2ED4), Color(0xFF6657E8), Color(0xFF9C8FFA)],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
        ),
        child: Stack(children: [
          // ── Background orbs ──────────────────────────────────────────────
          _Orb(diameter: size.width * 1.3,  dx: -size.width * 0.35, dy: -size.width * 0.35, opacity: 0.045),
          _Orb(diameter: size.width * 0.9,  dx:  size.width * 0.45, dy:  size.height * 0.55, opacity: 0.055),
          _Orb(diameter: size.width * 0.55, dx: -size.width * 0.12, dy:  size.height * 0.68, opacity: 0.035),
          _Orb(diameter: size.width * 0.35, dx:  size.width * 0.75, dy:  size.height * 0.08, opacity: 0.06),
          _Orb(diameter: size.width * 0.25, dx:  size.width * 0.1,  dy:  size.height * 0.25, opacity: 0.04),

          // ── Main content ─────────────────────────────────────────────────
          SafeArea(
            child: Column(children: [
              const Spacer(flex: 2),

              // Logo
              AnimatedBuilder(
                animation: Listenable.merge([_initCtrl, _pulseCtrl]),
                builder: (_, child) => FadeTransition(
                  opacity: _logoFade,
                  child: ScaleTransition(
                    scale: _logoScale,
                    child: ScaleTransition(
                      scale: _pulseScale,
                      child: Stack(alignment: Alignment.center, children: [
                        // Outer glow ring
                        Container(
                          width: 124, height: 124,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            boxShadow: [BoxShadow(
                              color: Colors.white.withValues(alpha: _glowOpacity.value),
                              blurRadius: 50,
                              spreadRadius: 12,
                            )],
                          ),
                        ),
                        // Frosted ring
                        Container(
                          width: 112, height: 112,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: Colors.white.withValues(alpha: 0.1),
                            border: Border.all(color: Colors.white.withValues(alpha: 0.25), width: 1.5),
                          ),
                        ),
                        // Inner icon container
                        Container(
                          width: 88, height: 88,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            gradient: LinearGradient(
                              colors: [Colors.white.withValues(alpha: 0.28), Colors.white.withValues(alpha: 0.12)],
                              begin: Alignment.topLeft,
                              end: Alignment.bottomRight,
                            ),
                            border: Border.all(color: Colors.white.withValues(alpha: 0.4), width: 1.5),
                            boxShadow: [BoxShadow(
                              color: Colors.black.withValues(alpha: 0.12),
                              blurRadius: 16,
                              offset: const Offset(0, 6),
                            )],
                          ),
                          child: const Icon(Icons.favorite_rounded, color: Colors.white, size: 42),
                        ),
                      ]),
                    ),
                  ),
                ),
              ),

              const SizedBox(height: 32),

              // Brand name + tagline
              FadeTransition(
                opacity: _textFade,
                child: SlideTransition(
                  position: _textSlide,
                  child: Column(children: [
                    ShaderMask(
                      shaderCallback: (bounds) => const LinearGradient(
                        colors: [Colors.white, Color(0xFFE0D8FF)],
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                      ).createShader(bounds),
                      child: const Text(
                        'Infer Health',
                        style: TextStyle(
                          fontFamily: 'Poppins',
                          fontSize: 34,
                          fontWeight: FontWeight.w700,
                          color: Colors.white,
                          letterSpacing: -0.5,
                          height: 1.2,
                        ),
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      'Your Personal Health Intelligence',
                      style: TextStyle(
                        fontFamily: 'Poppins',
                        fontSize: 14,
                        fontWeight: FontWeight.w400,
                        color: Colors.white.withValues(alpha: 0.72),
                        letterSpacing: 0.2,
                      ),
                    ),
                  ]),
                ),
              ),

              const SizedBox(height: 36),

              // Feature pills
              FadeTransition(
                opacity: _pillsFade,
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 32),
                  child: Wrap(
                    spacing: 10,
                    runSpacing: 10,
                    alignment: WrapAlignment.center,
                    children: _features.map((f) => _FeaturePill(icon: f.$1, label: f.$2)).toList(),
                  ),
                ),
              ),

              const Spacer(flex: 3),

              // Bouncing dots
              AnimatedBuilder(
                animation: _dotsCtrl,
                builder: (_, __) => Row(
                  mainAxisSize: MainAxisSize.min,
                  children: List.generate(3, (i) {
                    final phase = i / 3.0;
                    final t = ((_dotsCtrl.value + phase) % 1.0);
                    final wave = t < 0.5 ? t * 2 : (1.0 - t) * 2;
                    return Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 5),
                      child: Transform.translate(
                        offset: Offset(0, -7 * wave),
                        child: Opacity(
                          opacity: 0.3 + wave * 0.7,
                          child: Container(
                            width: 8, height: 8,
                            decoration: const BoxDecoration(
                              shape: BoxShape.circle,
                              color: Colors.white,
                            ),
                          ),
                        ),
                      ),
                    );
                  }),
                ),
              ),

              const SizedBox(height: 12),
              Text(
                'Loading your health data…',
                style: TextStyle(
                  fontFamily: 'Poppins',
                  fontSize: 12,
                  color: Colors.white.withValues(alpha: 0.55),
                ),
              ),
              const SizedBox(height: 36),
            ]),
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
    left: dx,
    top: dy,
    child: Container(
      width: diameter,
      height: diameter,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: Colors.white.withValues(alpha: opacity),
      ),
    ),
  );
}

class _FeaturePill extends StatelessWidget {
  final IconData icon;
  final String label;
  const _FeaturePill({required this.icon, required this.label});

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 7),
    decoration: BoxDecoration(
      color: Colors.white.withValues(alpha: 0.13),
      borderRadius: BorderRadius.circular(20),
      border: Border.all(color: Colors.white.withValues(alpha: 0.22), width: 1),
    ),
    child: Row(mainAxisSize: MainAxisSize.min, children: [
      Icon(icon, size: 13, color: Colors.white.withValues(alpha: 0.9)),
      const SizedBox(width: 6),
      Text(
        label,
        style: TextStyle(
          fontFamily: 'Poppins',
          fontSize: 12,
          fontWeight: FontWeight.w500,
          color: Colors.white.withValues(alpha: 0.9),
        ),
      ),
    ]),
  );
}

// ignore: unused_element
double _clamp(double v, double lo, double hi) => math.max(lo, math.min(hi, v));
