import 'dart:async';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../core/cubits/auth_cubit.dart';
import '../core/constants/app_constants.dart';
import '../features/auth/screens/splash_screen.dart';
import '../features/auth/screens/login_screen.dart';
import '../features/auth/screens/register_screen.dart';
import '../features/dashboard/screens/dashboard_screen.dart';
import '../features/vitals/screens/vitals_screen.dart';
import '../features/vitals/screens/add_vital_screen.dart';
import '../features/vitals/screens/heart_rate_screen.dart';
import '../features/documents/screens/documents_screen.dart';
import '../features/documents/screens/upload_document_screen.dart';
import '../features/profile/screens/profile_screen.dart';
import '../features/timeline/screens/timeline_screen.dart';
import '../features/healthbot/screens/healthbot_screen.dart';
import '../features/documents/screens/smart_report_screen.dart';
import '../features/vitals/screens/all_vitals_screen.dart';
import '../features/risk/screens/risk_detail_screen.dart';
import '../features/self_assessment/screens/self_assessment_screen.dart';
import '../features/auth/screens/onboarding_screen.dart';
import '../features/abdm/screens/abdm_home_screen.dart';
import '../features/abdm/screens/abha_create_screen.dart';
import '../features/abdm/screens/abha_card_screen.dart';
import '../features/abdm/screens/link_records_screen.dart';
import '../features/abdm/screens/consent_screen.dart';
import '../features/abdm/screens/health_records_screen.dart';
import '../core/models/document_model.dart';
import 'main_scaffold.dart';

CustomTransitionPage<void> _fadeSlideTransition({required Widget child, required GoRouterState state}) {
  return CustomTransitionPage<void>(
    key: state.pageKey,
    child: child,
    transitionDuration: const Duration(milliseconds: 280),
    transitionsBuilder: (context, animation, secondaryAnimation, child) {
      final curved = CurvedAnimation(parent: animation, curve: Curves.easeOutCubic);
      return FadeTransition(
        opacity: curved,
        child: SlideTransition(
          position: Tween<Offset>(begin: const Offset(0, 0.04), end: Offset.zero).animate(curved),
          child: child,
        ),
      );
    },
  );
}

class _GoRouterRefreshStream extends ChangeNotifier {
  late final StreamSubscription<dynamic> _sub;
  _GoRouterRefreshStream(Stream<dynamic> stream) {
    _sub = stream.asBroadcastStream().listen((_) => notifyListeners());
  }
  @override
  void dispose() { _sub.cancel(); super.dispose(); }
}

GoRouter createRouter(AuthCubit authCubit) {
  return GoRouter(
    initialLocation: AppRoutes.splash,
    refreshListenable: _GoRouterRefreshStream(authCubit.stream),
    redirect: (context, state) {
      final authState = authCubit.state;
      final isAuth = authState.status == AuthStatus.authenticated;
      final isUnknown = authState.status == AuthStatus.unknown;
      final onAuthPage = state.matchedLocation == AppRoutes.login ||
          state.matchedLocation == AppRoutes.register ||
          state.matchedLocation == AppRoutes.splash ||
          state.matchedLocation == AppRoutes.onboarding;
      if (isUnknown) return AppRoutes.splash;
      if (!isAuth && !onAuthPage) return AppRoutes.login;
      if (isAuth && (state.matchedLocation == AppRoutes.login || state.matchedLocation == AppRoutes.register)) {
        return AppRoutes.home;
      }
      return null;
    },
    routes: [
      GoRoute(path: AppRoutes.splash, builder: (_, __) => const SplashScreen()),
      GoRoute(
        path: AppRoutes.onboarding,
        pageBuilder: (_, s) => _fadeSlideTransition(child: const OnboardingScreen(), state: s),
      ),
      GoRoute(
        path: AppRoutes.documentReport,
        pageBuilder: (_, s) => _fadeSlideTransition(
          child: SmartReportScreen(doc: s.extra as DocumentModel),
          state: s,
        ),
      ),
      GoRoute(
        path: AppRoutes.login,
        pageBuilder: (_, s) => _fadeSlideTransition(child: const LoginScreen(), state: s),
      ),
      GoRoute(
        path: AppRoutes.register,
        pageBuilder: (_, s) => _fadeSlideTransition(child: const RegisterScreen(), state: s),
      ),
      ShellRoute(
        builder: (context, state, child) => MainScaffold(child: child),
        routes: [
          GoRoute(
            path: AppRoutes.home,
            pageBuilder: (_, s) => _fadeSlideTransition(child: const DashboardScreen(), state: s),
          ),
          GoRoute(
            path: AppRoutes.vitals,
            pageBuilder: (_, s) => _fadeSlideTransition(child: const VitalsScreen(), state: s),
            routes: [
              GoRoute(path: 'add', pageBuilder: (_, s) => _fadeSlideTransition(child: AddVitalScreen(vitalType: s.uri.queryParameters['type']), state: s)),
              GoRoute(path: 'heart-rate', pageBuilder: (_, s) => _fadeSlideTransition(child: const HeartRateScreen(), state: s)),
            ],
          ),
          GoRoute(
            path: AppRoutes.documents,
            pageBuilder: (_, s) => _fadeSlideTransition(child: const DocumentsScreen(), state: s),
            routes: [GoRoute(path: 'upload', pageBuilder: (_, s) => _fadeSlideTransition(child: const UploadDocumentScreen(), state: s))],
          ),
          GoRoute(
            path: AppRoutes.profile,
            pageBuilder: (_, s) => _fadeSlideTransition(child: const ProfileScreen(), state: s),
          ),
          GoRoute(
            path: AppRoutes.timeline,
            pageBuilder: (_, s) => _fadeSlideTransition(child: const TimelineScreen(), state: s),
          ),
          GoRoute(
            path: AppRoutes.healthbot,
            pageBuilder: (_, s) => _fadeSlideTransition(child: const HealthBotScreen(), state: s),
          ),
          GoRoute(
            path: AppRoutes.allVitals,
            pageBuilder: (_, s) => _fadeSlideTransition(child: const AllVitalsScreen(), state: s),
          ),
          GoRoute(
            path: AppRoutes.riskPrediction,
            pageBuilder: (_, s) => _fadeSlideTransition(child: const RiskDetailScreen(), state: s),
          ),
          GoRoute(
            path: AppRoutes.selfAssessment,
            pageBuilder: (_, s) => _fadeSlideTransition(child: const SelfAssessmentScreen(), state: s),
          ),
          GoRoute(
            path: AppRoutes.abdmHome,
            pageBuilder: (_, s) => _fadeSlideTransition(child: const AbdmHomeScreen(), state: s),
          ),
          GoRoute(
            path: AppRoutes.abdmLinkRecords,
            pageBuilder: (_, s) => _fadeSlideTransition(child: const LinkRecordsScreen(), state: s),
          ),
          GoRoute(
            path: AppRoutes.abdmConsents,
            pageBuilder: (_, s) => _fadeSlideTransition(child: const ConsentScreen(), state: s),
          ),
          GoRoute(
            path: AppRoutes.abdmHealthRecords,
            pageBuilder: (_, s) => _fadeSlideTransition(child: const HealthRecordsScreen(), state: s),
          ),
        ],
      ),
      GoRoute(
        path: AppRoutes.abhaCreate,
        pageBuilder: (_, s) => _fadeSlideTransition(
          child: AbhaCreateScreen(mode: s.extra as String?),
          state: s,
        ),
      ),
      GoRoute(
        path: AppRoutes.abhaCard,
        pageBuilder: (_, s) => _fadeSlideTransition(child: const AbhaCardScreen(), state: s),
      ),
    ],
  );
}
