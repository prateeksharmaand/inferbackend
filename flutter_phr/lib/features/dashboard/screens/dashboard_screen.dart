import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../core/cubits/auth_cubit.dart';
import '../../../core/cubits/vitals_cubit.dart';
import '../../../core/cubits/gmail_sync_cubit.dart';
import '../../../core/cubits/documents_cubit.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/constants/app_constants.dart';
import '../../../core/widgets/shimmer_widgets.dart';
import '../../../core/cubits/health_sync_cubit.dart';
import '../../../core/cubits/risk_cubit.dart';
import '../../../core/models/risk_model.dart';
import '../../../core/cubits/timeline_cubit.dart';
import '../../../core/cubits/self_assessment_cubit.dart';
import '../../../core/models/document_model.dart';
import '../../vitals/screens/health_sync_sheet.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});
  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  Timer? _gmailPollTimer;
  bool _isRefreshing = false;

  @override
  void initState() {
    super.initState();
    Future.microtask(() {
      context.read<VitalsCubit>().loadLatestVitals();
      context.read<GmailSyncCubit>().loadStatus();
      context.read<RiskCubit>().loadRisk();
      context.read<TimelineCubit>().loadTimeline();
    });
  }

  Future<void> _onRefresh() async {
    setState(() => _isRefreshing = true);
    await Future.wait([
      context.read<VitalsCubit>().loadLatestVitals(),
      context.read<GmailSyncCubit>().loadStatus(),
      context.read<TimelineCubit>().loadTimeline(),
    ]);
    if (mounted) setState(() => _isRefreshing = false);
  }

  void _startGmailPoll() {
    _gmailPollTimer?.cancel();
    _gmailPollTimer = Timer.periodic(const Duration(seconds: 4), (_) async {
      if (!mounted) return;
      await context.read<GmailSyncCubit>().loadStatus();
      if (context.read<GmailSyncCubit>().state.status == GmailStatus.connected) {
        _gmailPollTimer?.cancel();
      }
    });
    Future.delayed(const Duration(minutes: 5), () => _gmailPollTimer?.cancel());
  }

  @override
  void dispose() {
    _gmailPollTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final user = context.watch<AuthCubit>().state.user;
    final vitals = context.watch<VitalsCubit>().state;
    final showShimmer = _isRefreshing || vitals.isLoading;
    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: RefreshIndicator(
          color: AppColors.primary,
          onRefresh: _onRefresh,
          child: SingleChildScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const SizedBox(height: 16),
              _buildTopBar(user?.firstName ?? 'User'),
              const SizedBox(height: 20),
              showShimmer ? const ShimmerAiBanner() : _buildAiConsultBanner(),
              const SizedBox(height: 16),
              showShimmer ? const ShimmerRiskCard() : _buildRiskCard(),
              const SizedBox(height: 16),
              showShimmer ? const ShimmerQuickActions() : _buildQuickActions(),
              const SizedBox(height: 12),
              _buildSelfAssessmentCard(),
              const SizedBox(height: 12),
              _buildAbdmCard(),
              const SizedBox(height: 16),
              showShimmer
                ? const Row(children: [
                    Expanded(child: ShimmerMetricCard()),
                    SizedBox(width: 12),
                    Expanded(child: ShimmerMetricCard()),
                  ])
                : _buildMetricsRow(vitals),
              const SizedBox(height: 16),
              showShimmer ? const ShimmerHeartHealthCard() : _buildHeartHealthCard(vitals),
              const SizedBox(height: 16),
              showShimmer ? const ShimmerSyncCard() : _buildHealthSyncCard(),
              const SizedBox(height: 12),
              showShimmer ? const ShimmerSyncCard() : _buildGmailSyncCard(),
              const SizedBox(height: 12),
              _buildHealthRiskChecks(),
              const SizedBox(height: 16),
              BlocBuilder<TimelineCubit, TimelineState>(
                builder: (context, tlState) => tlState.isLoading && tlState.events.isEmpty
                    ? const ShimmerTimelineCard()
                    : _buildTimelineCard(tlState.events),
              ),
              const SizedBox(height: 100),
            ]),
          ),
        ),
      ),
    );
  }

  Widget _buildTopBar(String name) => Row(children: [
    GestureDetector(
      onTap: () => context.push(AppRoutes.profile),
      child: Container(
        width: 44, height: 44,
        decoration: const BoxDecoration(
          gradient: LinearGradient(colors: AppColors.aiGradient),
          shape: BoxShape.circle,
        ),
        child: Center(child: Text(
          name.isNotEmpty ? name[0].toUpperCase() : 'U',
          style: const TextStyle(fontFamily: 'Poppins', fontSize: 18, fontWeight: FontWeight.w700, color: Colors.white),
        )),
      ),
    ),
    const SizedBox(width: 12),
    Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text('Good Morning!', style: AppTextStyles.caption.copyWith(color: AppColors.textSecondary)),
      Text(name, style: AppTextStyles.h5),
    ]),
    const Spacer(),
    _iconBtn(Icons.favorite_rounded, () => context.go(AppRoutes.heartRate), color: AppColors.heartRate),
    const SizedBox(width: 8),
    _iconBtn(Icons.chat_bubble_outline_rounded, () => context.push(AppRoutes.healthbot)),
    const SizedBox(width: 8),
    _iconBtn(Icons.notifications_outlined, () {}),
  ]);

  Widget _iconBtn(IconData icon, VoidCallback onTap, {Color? color}) => GestureDetector(
    onTap: onTap,
    child: Container(
      width: 40, height: 40,
      decoration: BoxDecoration(color: AppColors.surface, shape: BoxShape.circle,
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha:0.05), blurRadius: 8)]),
      child: Icon(icon, size: 20, color: color ?? AppColors.textPrimary),
    ),
  );

  Widget _buildAiConsultBanner() => GestureDetector(
    onTap: () => context.go(AppRoutes.healthbot),
    child: Container(
      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
      decoration: BoxDecoration(
        gradient: const LinearGradient(colors: AppColors.aiGradient, begin: Alignment.topLeft, end: Alignment.bottomRight),
        borderRadius: BorderRadius.circular(20),
        boxShadow: [BoxShadow(color: AppColors.primary.withValues(alpha:0.3), blurRadius: 16, offset: const Offset(0, 6))],
      ),
      child: Row(children: [
        Container(
          width: 40, height: 40,
          decoration: BoxDecoration(color: Colors.white.withValues(alpha:0.2), borderRadius: BorderRadius.circular(12)),
          child: const Icon(Icons.auto_awesome, color: Colors.white, size: 22),
        ),
        const SizedBox(width: 14),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('Start Consult Health with AI', style: TextStyle(fontFamily: 'Poppins', fontSize: 14, fontWeight: FontWeight.w600, color: Colors.white)),
          Text('Your Health, Smarter Every Day', style: TextStyle(fontFamily: 'Poppins', fontSize: 11, color: Colors.white.withValues(alpha:0.8))),
        ])),
        const Icon(Icons.arrow_forward_ios_rounded, color: Colors.white, size: 16),
      ]),
    ),
  );

  Widget _buildRiskCard() {
    final riskState = context.watch<RiskCubit>().state;
    if (riskState.isLoading) return const ShimmerRiskCard();
    final result = riskState.result;
    if (result == null) return const SizedBox.shrink();

    return GestureDetector(
      onTap: () => context.push(AppRoutes.riskPrediction),
      child: Container(
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(
          color: result.levelBgColor,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: result.levelColor.withValues(alpha: 0.25), width: 1.2),
          boxShadow: [BoxShadow(color: result.levelColor.withValues(alpha: 0.08), blurRadius: 12, offset: const Offset(0, 4))],
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Container(
              width: 46, height: 46,
              decoration: BoxDecoration(
                color: result.levelColor.withValues(alpha: 0.15),
                shape: BoxShape.circle,
              ),
              child: Icon(result.levelIcon, color: result.levelColor, size: 24),
            ),
            const SizedBox(width: 12),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('RISK PREDICTION', style: AppTextStyles.label),
              const SizedBox(height: 2),
              Text(result.levelLabel,
                  style: TextStyle(fontFamily: 'Poppins', fontSize: 16, fontWeight: FontWeight.w700, color: result.levelColor)),
            ])),
            Stack(alignment: Alignment.center, children: [
              SizedBox(
                width: 56, height: 56,
                child: CircularProgressIndicator(
                  value: result.score / 100,
                  strokeWidth: 5,
                  backgroundColor: result.levelColor.withValues(alpha: 0.15),
                  valueColor: AlwaysStoppedAnimation(result.levelColor),
                ),
              ),
              Text('${result.score}',
                  style: TextStyle(fontFamily: 'Poppins', fontSize: 16, fontWeight: FontWeight.w700, color: result.levelColor)),
            ]),
          ]),
          if (result.recommendation.summary.isNotEmpty) ...[
            const SizedBox(height: 12),
            Text(result.recommendation.summary,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: AppTextStyles.body2.copyWith(color: AppColors.textSecondary, height: 1.5)),
          ],
          const SizedBox(height: 12),
          Row(children: [
            if (result.factors.isNotEmpty) ...[
              Icon(Icons.circle, size: 6, color: result.levelColor),
              const SizedBox(width: 6),
              Text('${result.factors.length} factor${result.factors.length == 1 ? '' : 's'} detected',
                  style: AppTextStyles.caption.copyWith(fontWeight: FontWeight.w600, color: result.levelColor)),
              const SizedBox(width: 12),
            ],
            const Spacer(),
            Text('View details', style: AppTextStyles.caption.copyWith(color: result.levelColor, fontWeight: FontWeight.w600)),
            const SizedBox(width: 4),
            Icon(Icons.arrow_forward_ios_rounded, size: 11, color: result.levelColor),
          ]),
        ]),
      ),
    );
  }

  Widget _buildMetricsRow(VitalsState vitals) {
    if (vitals.isLoading) {
      return const Row(children: [
        Expanded(child: ShimmerMetricCard()),
        SizedBox(width: 12),
        Expanded(child: ShimmerMetricCard()),
      ]);
    }
    return Row(children: [
      Expanded(child: _buildMetricCard(
        label: 'HEART RATE',
        value: vitals.latestHeartRate?.displayValue ?? '--',
        unit: 'Bpm',
        icon: Icons.favorite_rounded,
        iconColor: AppColors.heartRate,
        status: vitals.latestHeartRate?.status,
      )),
      const SizedBox(width: 12),
      Expanded(child: _buildMetricCard(
        label: 'BLOOD GLUCOSE',
        value: vitals.latestGlucose?.displayValue ?? '--',
        unit: 'mg/dL',
        icon: Icons.water_drop_rounded,
        iconColor: AppColors.info,
        status: vitals.latestGlucose?.status,
      )),
    ]);
  }

  Widget _buildMetricCard({
    required String label, required String value, required String unit,
    required IconData icon, required Color iconColor, String? status,
  }) => Container(
    padding: const EdgeInsets.all(16),
    decoration: BoxDecoration(
      color: AppColors.surface,
      borderRadius: BorderRadius.circular(20),
      boxShadow: [BoxShadow(color: Colors.black.withValues(alpha:0.05), blurRadius: 12, offset: const Offset(0, 4))],
    ),
    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(children: [
        Flexible(child: Text(label, style: AppTextStyles.label, overflow: TextOverflow.ellipsis, maxLines: 1)),
        if (status != null) ...[
          const SizedBox(width: 6),
          _buildStatusBadge(status),
        ],
      ]),
      const SizedBox(height: 10),
      Row(crossAxisAlignment: CrossAxisAlignment.center, children: [
        Expanded(child: Text(value, style: const TextStyle(fontFamily: 'Poppins', fontSize: 26, fontWeight: FontWeight.w700, color: AppColors.textPrimary, height: 1), maxLines: 1, overflow: TextOverflow.ellipsis)),
        Icon(icon, color: iconColor, size: 22),
      ]),
      const SizedBox(height: 2),
      Text(unit, style: AppTextStyles.caption),
    ]),
  );

  Widget _buildStatusBadge(String status) {
    Color color;
    String text;
    switch (status.toLowerCase()) {
      case 'normal': color = AppColors.success; text = 'Normal'; break;
      case 'elevated': color = AppColors.warning; text = 'Elevated'; break;
      case 'high': case 'critical': color = AppColors.error; text = 'High Risk'; break;
      case 'low': color = AppColors.info; text = 'Low'; break;
      default: color = AppColors.success; text = 'Normal';
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(color: color.withValues(alpha:0.12), borderRadius: BorderRadius.circular(20)),
      child: Text(text, style: TextStyle(fontFamily: 'Poppins', fontSize: 10, fontWeight: FontWeight.w600, color: color)),
    );
  }

  Widget _buildQuickActions() {
    final actions = [
      (Icons.upload_file_rounded,     'Upload Report',  AppColors.primary,    AppColors.primaryLight,  () => context.go(AppRoutes.uploadDocument)),
      (Icons.monitor_heart_outlined,  'Add Vital',      AppColors.heartRate,  const Color(0xFFFFEBEE), () => context.go(AppRoutes.addVital)),
      (Icons.timeline_rounded,         'Timeline',       AppColors.success,    AppColors.successLight,  () => context.go(AppRoutes.timeline)),
      (Icons.auto_awesome_rounded,    'Ask AI',         AppColors.primary,       AppColors.primaryLight,  () => context.go(AppRoutes.healthbot)),
    ];
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const Text('QUICK ACTIONS', style: AppTextStyles.label),
      const SizedBox(height: 12),
      GridView.count(
        crossAxisCount: 2,
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        crossAxisSpacing: 12,
        mainAxisSpacing: 12,
        childAspectRatio: 2.4,
        children: actions.map((a) => GestureDetector(
          onTap: a.$5,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            decoration: BoxDecoration(
              color: AppColors.surface,
              borderRadius: BorderRadius.circular(16),
              boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 8, offset: const Offset(0, 2))],
            ),
            child: Row(children: [
              Container(
                width: 36, height: 36,
                decoration: BoxDecoration(color: a.$4, borderRadius: BorderRadius.circular(10)),
                child: Icon(a.$1, color: a.$3, size: 18),
              ),
              const SizedBox(width: 10),
              Expanded(child: Text(a.$2, style: AppTextStyles.body2.copyWith(fontWeight: FontWeight.w600), maxLines: 2)),
            ]),
          ),
        )).toList(),
      ),
    ]);
  }

  Widget _buildHeartHealthCard(VitalsState vitals) {
    final hr = vitals.latestHeartRate;
    return GestureDetector(
      onTap: () => context.go(AppRoutes.heartRate),
      child: Container(
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            colors: [Color(0xFFFF5F7E), Color(0xFFFF2D55)],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          borderRadius: BorderRadius.circular(20),
          boxShadow: [BoxShadow(color: const Color(0xFFFF2D55).withValues(alpha: 0.3), blurRadius: 16, offset: const Offset(0, 6))],
        ),
        child: Row(children: [
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('Heart Health Monitor', style: TextStyle(fontFamily: 'Poppins', fontSize: 15, fontWeight: FontWeight.w700, color: Colors.white)),
            const SizedBox(height: 4),
            Text(
              hr != null ? 'Current: ${hr.displayValue} bpm · ${hr.status}' : 'Measure heart rate using your camera',
              style: TextStyle(fontFamily: 'Poppins', fontSize: 11, color: Colors.white.withValues(alpha: 0.85)),
            ),
            const SizedBox(height: 14),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
              decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.2), borderRadius: BorderRadius.circular(20)),
              child: const Row(mainAxisSize: MainAxisSize.min, children: [
                Icon(Icons.favorite_rounded, color: Colors.white, size: 14),
                SizedBox(width: 6),
                Text('Measure Now', style: TextStyle(fontFamily: 'Poppins', fontSize: 12, fontWeight: FontWeight.w600, color: Colors.white)),
              ]),
            ),
          ])),
          const SizedBox(width: 16),
          Stack(alignment: Alignment.center, children: [
            Container(
              width: 72, height: 72,
              decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.15), shape: BoxShape.circle),
            ),
            Container(
              width: 52, height: 52,
              decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.2), shape: BoxShape.circle),
            ),
            const Icon(Icons.favorite_rounded, color: Colors.white, size: 30),
          ]),
        ]),
      ),
    );
  }

  Widget _buildHealthSyncCard() {
    final syncState = context.watch<HealthSyncCubit>().state;
    final lastSync = syncState.lastSyncedAt;

    String subtitle;
    if (syncState.status == HealthSyncStatus.syncing) {
      subtitle = 'Syncing ${syncState.synced} / ${syncState.total} vitals...';
    } else if (lastSync != null) {
      final diff = DateTime.now().difference(lastSync);
      if (diff.inMinutes < 1) subtitle = 'Last synced just now';
      else if (diff.inHours < 1) subtitle = 'Last synced ${diff.inMinutes}m ago';
      else if (diff.inHours < 24) subtitle = 'Last synced ${diff.inHours}h ago';
      else subtitle = 'Last synced ${lastSync.day}/${lastSync.month}/${lastSync.year}';
    } else {
      subtitle = 'Auto-import vitals from Samsung Health, Fitbit & more';
    }

    return GestureDetector(
      onTap: () => HealthSyncSheet.show(context),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(20),
          boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 12, offset: const Offset(0, 4))],
        ),
        child: Row(children: [
          Container(
            width: 48, height: 48,
            decoration: BoxDecoration(
              color: AppColors.successLight,
              borderRadius: BorderRadius.circular(14),
            ),
            child: const Icon(Icons.health_and_safety_rounded, color: AppColors.success, size: 24),
          ),
          const SizedBox(width: 14),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('Health Connect', style: AppTextStyles.h5),
            const SizedBox(height: 2),
            Text(subtitle, style: AppTextStyles.caption),
          ])),
          const SizedBox(width: 8),
          if (syncState.status == HealthSyncStatus.syncing)
            const SizedBox(
              width: 20, height: 20,
              child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.success),
            )
          else
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(
                color: lastSync != null ? AppColors.successLight : AppColors.primary,
                borderRadius: BorderRadius.circular(20),
              ),
              child: Text(
                lastSync != null ? 'Sync' : 'Connect',
                style: TextStyle(
                  fontFamily: 'Poppins', fontSize: 12, fontWeight: FontWeight.w600,
                  color: lastSync != null ? AppColors.success : Colors.white,
                ),
              ),
            ),
        ]),
      ),
    );
  }

  Widget _buildGmailSyncCard() {
    final gmail = context.watch<GmailSyncCubit>().state;
    final connected = gmail.status == GmailStatus.connected;

    String lastSyncText = '';
    if (gmail.isSyncing) {
      lastSyncText = 'Syncing your inbox now...';
    } else if (connected && gmail.lastSyncedAt != null) {
      final diff = DateTime.now().difference(gmail.lastSyncedAt!);
      if (diff.inMinutes < 1)     lastSyncText = 'Last synced just now';
      else if (diff.inHours < 1)  lastSyncText = 'Last synced ${diff.inMinutes}m ago';
      else if (diff.inHours < 24) lastSyncText = 'Last synced ${diff.inHours}h ago';
      else                        lastSyncText = 'Last synced ${diff.inDays}d ago';
    } else if (connected) {
      lastSyncText = 'Syncs every 30 minutes automatically';
    }

    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(20),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 12, offset: const Offset(0, 4))],
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [

        // ── Header row ──
        Row(children: [
          Container(
            width: 46, height: 46,
            decoration: BoxDecoration(
              color: connected ? const Color(0xFFFFEBEE) : AppColors.primaryLight,
              borderRadius: BorderRadius.circular(13),
            ),
            child: Icon(
              connected ? Icons.mark_email_read_outlined : Icons.mail_outline_rounded,
              color: connected ? const Color(0xFFE53935) : AppColors.primary,
              size: 22,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('Gmail Sync', style: AppTextStyles.h5),
            if (connected && gmail.email != null)
              Text(gmail.email!, style: AppTextStyles.caption.copyWith(color: AppColors.primary, fontWeight: FontWeight.w600),
                  maxLines: 1, overflow: TextOverflow.ellipsis),
          ])),
          if (connected)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
              decoration: BoxDecoration(
                color: AppColors.successLight,
                borderRadius: BorderRadius.circular(20),
              ),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                Container(width: 6, height: 6,
                  decoration: const BoxDecoration(color: AppColors.success, shape: BoxShape.circle)),
                const SizedBox(width: 5),
                const Text('Active', style: TextStyle(fontFamily: 'Poppins', fontSize: 11,
                    fontWeight: FontWeight.w600, color: AppColors.success)),
              ]),
            ),
        ]),

        const SizedBox(height: 14),
        const Divider(height: 1),
        const SizedBox(height: 14),

        // ── Description ──
        Text(
          connected
              ? 'Your inbox is being monitored. Any medical report, lab result, prescription or discharge summary arriving from hospitals, labs or clinics is automatically saved to your health records.'
              : 'Connect Gmail to automatically import medical reports from your inbox. Lab results, prescriptions, discharge summaries and diagnostic reports sent by hospitals and labs will be saved directly to your records — no manual uploads needed.',
          style: AppTextStyles.body2.copyWith(height: 1.6),
        ),

        const SizedBox(height: 14),

        // ── Feature pills ──
        Wrap(spacing: 8, runSpacing: 8, children: [
          _gmailPill(Icons.science_outlined,        'Lab Reports'),
          _gmailPill(Icons.medication_outlined,     'Prescriptions'),
          _gmailPill(Icons.local_hospital_outlined, 'Discharge'),
          _gmailPill(Icons.image_search_outlined,   'Radiology'),
        ]),

        const SizedBox(height: 16),

        // ── Last sync info ──
        if (lastSyncText.isNotEmpty) ...[
          Row(children: [
            const Icon(Icons.access_time_rounded, size: 13, color: AppColors.textHint),
            const SizedBox(width: 5),
            Text(lastSyncText, style: AppTextStyles.caption.copyWith(fontSize: 11)),
          ]),
          const SizedBox(height: 12),
        ],

        // ── Action buttons ──
        if (gmail.isSyncing)
          const Row(children: [
            SizedBox(width: 18, height: 18,
                child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.primary)),
            SizedBox(width: 10),
            Text('Syncing inbox...', style: TextStyle(fontFamily: 'Poppins', fontSize: 13,
                fontWeight: FontWeight.w500, color: AppColors.textSecondary)),
          ])
        else if (!connected)
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: () async {
                final url = await context.read<GmailSyncCubit>().getAuthUrl();
                if (url != null && mounted) {
                  final uri = Uri.parse(url);
                  if (await canLaunchUrl(uri)) {
                    await launchUrl(uri, mode: LaunchMode.externalApplication);
                    _startGmailPoll();
                  }
                }
              },
              icon: const Icon(Icons.mail_outline_rounded, size: 18),
              label: const Text('Connect Gmail'),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primary,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 13),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                textStyle: const TextStyle(fontFamily: 'Poppins', fontSize: 14, fontWeight: FontWeight.w600),
              ),
            ),
          )
        else
          Row(children: [
            Expanded(
              child: OutlinedButton.icon(
                onPressed: () async {
                  final count = await context.read<GmailSyncCubit>().triggerSync();
                  if (count > 0 && mounted) {
                    context.read<DocumentsCubit>().loadDocuments();
                    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                      content: Text('Imported $count new report${count == 1 ? '' : 's'} from Gmail'),
                    ));
                  } else if (mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('No new reports found')),
                    );
                  }
                },
                icon: const Icon(Icons.sync_rounded, size: 16),
                label: const Text('Sync Now'),
                style: OutlinedButton.styleFrom(
                  foregroundColor: AppColors.primary,
                  side: const BorderSide(color: AppColors.primary),
                  padding: const EdgeInsets.symmetric(vertical: 11),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  textStyle: const TextStyle(fontFamily: 'Poppins', fontSize: 13, fontWeight: FontWeight.w600),
                ),
              ),
            ),
            const SizedBox(width: 10),
            OutlinedButton(
              onPressed: () => context.read<GmailSyncCubit>().disconnect(),
              style: OutlinedButton.styleFrom(
                foregroundColor: AppColors.textHint,
                side: const BorderSide(color: AppColors.border),
                padding: const EdgeInsets.symmetric(vertical: 11, horizontal: 14),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              child: const Text('Disconnect', style: TextStyle(fontFamily: 'Poppins', fontSize: 12)),
            ),
          ]),
      ]),
    );
  }

  Widget _gmailPill(IconData icon, String label) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
    decoration: BoxDecoration(
      color: AppColors.surfaceVariant,
      borderRadius: BorderRadius.circular(20),
    ),
    child: Row(mainAxisSize: MainAxisSize.min, children: [
      Icon(icon, size: 13, color: AppColors.textSecondary),
      const SizedBox(width: 5),
      Text(label, style: AppTextStyles.caption.copyWith(fontSize: 11, fontWeight: FontWeight.w500)),
    ]),
  );

  // ── Health Risk Checks card ────────────────────────────────────────────────

  static const _riskChecks = [
    (Icons.water_drop_rounded,  'Diabetes',     'Diabetes Complications',        'Diabetic Complications Assessment', Color(0xFF7B6EF6)),
    (Icons.favorite_rounded,    'Heart Health', 'General Health Problems',        'Cardiovascular Health Check',       Color(0xFF1E88E5)),
    (Icons.psychology_rounded,  'Mental Health','Mental & Neurological Health',   'Stress & Burnout',                  Color(0xFF8B5CF6)),
  ];

  Widget _buildHealthRiskChecks() => Container(
    padding: const EdgeInsets.all(18),
    decoration: BoxDecoration(
      color: AppColors.surface,
      borderRadius: BorderRadius.circular(20),
      boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 12, offset: const Offset(0, 4))],
    ),
    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(children: [
        Container(
          width: 32, height: 32,
          decoration: BoxDecoration(color: AppColors.primaryLight, borderRadius: BorderRadius.circular(8)),
          child: const Icon(Icons.health_and_safety_rounded, color: AppColors.primary, size: 17),
        ),
        const SizedBox(width: 10),
        Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('Check Health Risks', style: AppTextStyles.h5),
          Text('Tap any topic to start AI assessment', style: AppTextStyles.caption.copyWith(color: AppColors.textSecondary)),
        ]),
      ]),
      const SizedBox(height: 14),
      IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: _riskChecks.map((r) => Expanded(
            child: Padding(
              padding: EdgeInsets.only(right: r == _riskChecks.last ? 0 : 10),
              child: _riskCheckTile(icon: r.$1, label: r.$2, category: r.$3, subcategory: r.$4, color: r.$5),
            ),
          )).toList(),
        ),
      ),
    ]),
  );

  Widget _riskCheckTile({
    required IconData icon,
    required String label,
    required String category,
    required String subcategory,
    required Color color,
  }) =>
    GestureDetector(
      onTap: () {
        context.read<SelfAssessmentCubit>().startAssessment(category, subcategory);
        context.push(AppRoutes.selfAssessment);
      },
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 6),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.07),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: color.withValues(alpha: 0.2), width: 1.2),
        ),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Container(
            width: 40, height: 40,
            decoration: BoxDecoration(color: color.withValues(alpha: 0.14), shape: BoxShape.circle),
            child: Icon(icon, color: color, size: 20),
          ),
          const SizedBox(height: 8),
          Text(
            label,
            style: AppTextStyles.caption.copyWith(fontWeight: FontWeight.w600, color: AppColors.textPrimary),
            textAlign: TextAlign.center,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 4),
          Text('AI Check', style: AppTextStyles.caption.copyWith(fontSize: 10, color: color, fontWeight: FontWeight.w500)),
        ]),
      ),
    );

  // ── ABDM Health Locker card ───────────────────────────────────────────────

  Widget _buildAbdmCard() => GestureDetector(
    onTap: () => context.push(AppRoutes.abdmHome),
    child: Container(
      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 15),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFF1976D2), Color(0xFF42A5F5)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(18),
        boxShadow: [BoxShadow(color: const Color(0xFF1976D2).withValues(alpha: 0.28), blurRadius: 14, offset: const Offset(0, 5))],
      ),
      child: Row(children: [
        Container(
          width: 46, height: 46,
          decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.18), borderRadius: BorderRadius.circular(13)),
          child: const Icon(Icons.health_and_safety_rounded, color: Colors.white, size: 26),
        ),
        const SizedBox(width: 14),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('ABDM Health Locker', style: TextStyle(fontFamily: 'Poppins', fontSize: 15, fontWeight: FontWeight.w700, color: Colors.white)),
          Text('M1 · M2 · M3  — ABHA, Linked Records & Consents', style: TextStyle(fontFamily: 'Poppins', fontSize: 11, color: Colors.white.withValues(alpha: 0.85))),
        ])),
        Icon(Icons.arrow_forward_ios_rounded, color: Colors.white.withValues(alpha: 0.7), size: 16),
      ]),
    ),
  );

  // ── Self Assessment card ───────────────────────────────────────────────────

  Widget _buildSelfAssessmentCard() => GestureDetector(
    onTap: () => context.push(AppRoutes.selfAssessment),
    child: Container(
      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 15),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: AppColors.aiGradient,
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(20),
        boxShadow: [BoxShadow(color: AppColors.primary.withValues(alpha: 0.3), blurRadius: 16, offset: const Offset(0, 6))],
      ),
      child: Row(children: [
        Container(
          width: 46, height: 46,
          decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.2), borderRadius: BorderRadius.circular(14)),
          child: const Icon(Icons.assignment_rounded, color: Colors.white, size: 24),
        ),
        const SizedBox(width: 14),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('Self Assessment', style: TextStyle(fontFamily: 'Poppins', fontSize: 15, fontWeight: FontWeight.w700, color: Colors.white)),
          Text('15 categories · AI-powered risk results',
              style: TextStyle(fontFamily: 'Poppins', fontSize: 11, color: Colors.white.withValues(alpha: 0.85))),
        ])),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
          decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.2), borderRadius: BorderRadius.circular(20)),
          child: const Text('Start', style: TextStyle(fontFamily: 'Poppins', fontSize: 12, fontWeight: FontWeight.w600, color: Colors.white)),
        ),
      ]),
    ),
  );

  // ── Timeline card ──────────────────────────────────────────────────────────

  Widget _buildTimelineCard(List<TimelineEvent> events) {
    final recent = events.take(4).toList();
    return GestureDetector(
      onTap: () => context.push(AppRoutes.timeline),
      child: Container(
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(20),
          boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 12, offset: const Offset(0, 4))],
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Container(
              width: 32, height: 32,
              decoration: BoxDecoration(color: AppColors.primaryLight, borderRadius: BorderRadius.circular(8)),
              child: const Icon(Icons.timeline_rounded, color: AppColors.primary, size: 17),
            ),
            const SizedBox(width: 10),
            const Text('Recent Activity', style: AppTextStyles.h5),
            const Spacer(),
            Text('View all', style: AppTextStyles.caption.copyWith(color: AppColors.primary, fontWeight: FontWeight.w600)),
            const Icon(Icons.chevron_right_rounded, size: 16, color: AppColors.primary),
          ]),
          const SizedBox(height: 14),
          if (recent.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 6),
              child: Text('No recent activity', style: AppTextStyles.body2.copyWith(color: AppColors.textHint)),
            )
          else
            ...recent.map(_tlRow),
        ]),
      ),
    );
  }

  Widget _tlRow(TimelineEvent e) {
    final color = _tlColor(e.eventType);
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(children: [
        Container(
          width: 34, height: 34,
          decoration: BoxDecoration(color: color.withValues(alpha: 0.12), shape: BoxShape.circle),
          child: Icon(_tlIcon(e.eventType), size: 15, color: color),
        ),
        const SizedBox(width: 10),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(e.title, style: AppTextStyles.body2.copyWith(fontWeight: FontWeight.w500),
              maxLines: 1, overflow: TextOverflow.ellipsis),
          if (e.description != null && e.description!.isNotEmpty)
            Text(e.description!, style: AppTextStyles.caption, maxLines: 1, overflow: TextOverflow.ellipsis),
        ])),
        const SizedBox(width: 8),
        Text(_tlTimeAgo(e.eventDate), style: AppTextStyles.caption.copyWith(color: AppColors.textHint)),
      ]),
    );
  }

  Color _tlColor(String type) {
    switch (type) {
      case 'vital':    return AppColors.primary;
      case 'document': return AppColors.info;
      case 'reminder': return AppColors.warning;
      case 'alert':    return AppColors.error;
      case 'risk':     return const Color(0xFF7C3AED);
      default:         return AppColors.success;
    }
  }

  IconData _tlIcon(String type) {
    switch (type) {
      case 'vital':    return Icons.favorite_rounded;
      case 'document': return Icons.description_rounded;
      case 'reminder': return Icons.alarm_rounded;
      case 'alert':    return Icons.warning_amber_rounded;
      case 'risk':     return Icons.analytics_rounded;
      default:         return Icons.event_note_rounded;
    }
  }

  String _tlTimeAgo(DateTime d) {
    final diff = DateTime.now().difference(d);
    if (diff.inMinutes < 1) return 'now';
    if (diff.inHours < 1)   return '${diff.inMinutes}m';
    if (diff.inHours < 24)  return '${diff.inHours}h';
    if (diff.inDays < 7)    return '${diff.inDays}d';
    return '${d.day}/${d.month}';
  }

}
