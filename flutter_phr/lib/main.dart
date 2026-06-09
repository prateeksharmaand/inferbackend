import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:firebase_core/firebase_core.dart';
import 'core/theme/app_theme.dart';
import 'core/cubits/auth_cubit.dart';
import 'core/cubits/vitals_cubit.dart';
import 'core/cubits/documents_cubit.dart';
import 'core/cubits/healthbot_cubit.dart';
import 'core/cubits/timeline_cubit.dart';
import 'core/cubits/health_sync_cubit.dart';
import 'core/cubits/all_vitals_cubit.dart';
import 'core/cubits/gmail_sync_cubit.dart';
import 'core/cubits/risk_cubit.dart';
import 'core/cubits/self_assessment_cubit.dart';
import 'core/cubits/abdm_cubit.dart';
import 'navigation/app_router.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp();
  AppTheme.applySystemUI();
  SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp, DeviceOrientation.portraitDown]);
  final authCubit = AuthCubit();
  runApp(PHRApp(authCubit: authCubit));
}

class PHRApp extends StatelessWidget {
  final AuthCubit authCubit;
  const PHRApp({super.key, required this.authCubit});

  @override
  Widget build(BuildContext context) {
    return MultiBlocProvider(
      providers: [
        BlocProvider.value(value: authCubit),
        BlocProvider(create: (_) => VitalsCubit()),
        BlocProvider(create: (_) => DocumentsCubit()),
        BlocProvider(create: (_) => HealthBotCubit()),
        BlocProvider(create: (_) => TimelineCubit()),
        BlocProvider(create: (_) => HealthSyncCubit()),
        BlocProvider(create: (_) => AllVitalsCubit()),
        BlocProvider(create: (_) => GmailSyncCubit()),
        BlocProvider(create: (_) => RiskCubit()),
        BlocProvider(create: (_) => SelfAssessmentCubit()),
        BlocProvider(create: (_) => AbdmCubit()),
      ],
      child: MaterialApp.router(
        title: 'PHR Health',
        debugShowCheckedModeBanner: false,
        theme: AppTheme.lightTheme,
        routerConfig: createRouter(authCubit),
      ),
    );
  }
}
