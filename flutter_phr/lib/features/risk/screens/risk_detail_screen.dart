import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import '../../../core/cubits/risk_cubit.dart';
import '../../../core/models/risk_model.dart';
import '../../../core/theme/app_theme.dart';

class RiskDetailScreen extends StatefulWidget {
  const RiskDetailScreen({super.key});

  @override
  State<RiskDetailScreen> createState() => _RiskDetailScreenState();
}

class _RiskDetailScreenState extends State<RiskDetailScreen> {
  @override
  void initState() {
    super.initState();
    Future.microtask(() => context.read<RiskCubit>().loadRisk());
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.background,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_rounded, size: 20, color: AppColors.textPrimary),
          onPressed: () => context.pop(),
        ),
        title: const Text('Risk Assessment', style: AppTextStyles.h5),
        actions: [
          BlocBuilder<RiskCubit, RiskState>(
            builder: (context, state) => IconButton(
              icon: state.isLoading
                  ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.primary))
                  : const Icon(Icons.refresh_rounded, color: AppColors.primary),
              onPressed: state.isLoading ? null : () => context.read<RiskCubit>().refresh(),
            ),
          ),
        ],
      ),
      body: BlocBuilder<RiskCubit, RiskState>(
        builder: (context, state) {
          if (state.isLoading && state.result == null) return _buildLoading();
          if (state.result == null) return _buildEmpty(context, state.error);
          return _buildContent(context, state.result!);
        },
      ),
    );
  }

  Widget _buildLoading() => const Center(
    child: Column(mainAxisSize: MainAxisSize.min, children: [
      CircularProgressIndicator(color: AppColors.primary),
      SizedBox(height: 16),
      Text('Analyzing your health data...', style: AppTextStyles.body2),
    ]),
  );

  Widget _buildEmpty(BuildContext context, String? error) => Center(
    child: Padding(
      padding: const EdgeInsets.all(32),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Icon(Icons.analytics_outlined, size: 64, color: AppColors.textHint.withValues(alpha: 0.5)),
        const SizedBox(height: 16),
        Text(error != null ? 'Could not load risk data' : 'No health data yet',
            style: AppTextStyles.h5),
        const SizedBox(height: 8),
        Text(error != null ? 'Add some vitals to get a risk assessment' : 'Add vitals to begin',
            style: AppTextStyles.body2, textAlign: TextAlign.center),
        const SizedBox(height: 24),
        ElevatedButton.icon(
          onPressed: () => context.read<RiskCubit>().loadRisk(refresh: true),
          icon: const Icon(Icons.refresh_rounded, size: 18),
          label: const Text('Try Again'),
          style: ElevatedButton.styleFrom(
            backgroundColor: AppColors.primary,
            foregroundColor: Colors.white,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
          ),
        ),
      ]),
    ),
  );

  Widget _buildContent(BuildContext context, RiskResult result) {
    return RefreshIndicator(
      color: AppColors.primary,
      onRefresh: () => context.read<RiskCubit>().refresh(),
      child: SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        _buildScoreCard(result),
        const SizedBox(height: 16),
        if (result.recommendation.summary.isNotEmpty) _buildSummaryCard(result),
        const SizedBox(height: 16),
        if (result.recommendation.recommendations.isNotEmpty) _buildRecommendationsCard(result),
        const SizedBox(height: 16),
        if (result.factors.isNotEmpty) _buildFactorsCard(result),
        const SizedBox(height: 16),
        _buildComputedAt(result),
      ]),
      ),
    );
  }

  Widget _buildScoreCard(RiskResult result) => Container(
    padding: const EdgeInsets.all(22),
    decoration: BoxDecoration(
      color: result.levelBgColor,
      borderRadius: BorderRadius.circular(24),
      border: Border.all(color: result.levelColor.withValues(alpha: 0.3), width: 1.5),
    ),
    child: Column(children: [
      Row(children: [
        Container(
          width: 52, height: 52,
          decoration: BoxDecoration(
            color: result.levelColor.withValues(alpha: 0.15),
            shape: BoxShape.circle,
          ),
          child: Icon(result.levelIcon, color: result.levelColor, size: 28),
        ),
        const SizedBox(width: 16),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(result.levelLabel,
              style: TextStyle(fontFamily: 'Poppins', fontSize: 20, fontWeight: FontWeight.w700, color: result.levelColor)),
          Text('${result.factors.length} risk factor${result.factors.length == 1 ? '' : 's'} detected',
              style: AppTextStyles.body2),
        ])),
        _buildScoreCircle(result),
      ]),
      const SizedBox(height: 18),
      _buildScoreBar(result),
    ]),
  );

  Widget _buildScoreCircle(RiskResult result) => Stack(alignment: Alignment.center, children: [
    SizedBox(
      width: 64, height: 64,
      child: CircularProgressIndicator(
        value: result.score / 100,
        strokeWidth: 6,
        backgroundColor: result.levelColor.withValues(alpha: 0.15),
        valueColor: AlwaysStoppedAnimation(result.levelColor),
      ),
    ),
    Column(mainAxisSize: MainAxisSize.min, children: [
      Text('${result.score}',
          style: TextStyle(fontFamily: 'Poppins', fontSize: 20, fontWeight: FontWeight.w700, color: result.levelColor)),
      Text('/100', style: AppTextStyles.caption.copyWith(fontSize: 9)),
    ]),
  ]);

  Widget _buildScoreBar(RiskResult result) {
    final zones = [
      ('Low', AppColors.success, 0.30),
      ('Moderate', AppColors.warning, 0.25),
      ('High', const Color(0xFFFF6B35), 0.20),
      ('Critical', AppColors.error, 0.25),
    ];
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      ClipRRect(
        borderRadius: BorderRadius.circular(4),
        child: Row(
          children: zones.map((z) => Flexible(
            flex: (z.$3 * 100).toInt(),
            child: Container(height: 8, color: z.$2.withValues(alpha: 0.6)),
          )).toList(),
        ),
      ),
      const SizedBox(height: 6),
      Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: zones.map((z) => Text(
        z.$1,
        style: TextStyle(fontFamily: 'Poppins', fontSize: 9, fontWeight: FontWeight.w500, color: z.$2),
      )).toList()),
    ]);
  }

  Widget _buildSummaryCard(RiskResult result) => Container(
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
          child: const Icon(Icons.auto_awesome_rounded, color: AppColors.primary, size: 17),
        ),
        const SizedBox(width: 10),
        const Text('AI Summary', style: AppTextStyles.h5),
        if (result.recommendation.urgent) ...[
          const Spacer(),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(color: AppColors.error.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(20)),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              Container(width: 6, height: 6, decoration: const BoxDecoration(color: AppColors.error, shape: BoxShape.circle)),
              const SizedBox(width: 5),
              Text('Urgent', style: TextStyle(fontFamily: 'Poppins', fontSize: 11, fontWeight: FontWeight.w600, color: AppColors.error)),
            ]),
          ),
        ],
      ]),
      const SizedBox(height: 12),
      Text(result.recommendation.summary,
          style: AppTextStyles.body2.copyWith(height: 1.6, color: AppColors.textSecondary)),
    ]),
  );

  Widget _buildRecommendationsCard(RiskResult result) => Container(
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
          decoration: BoxDecoration(color: AppColors.successLight, borderRadius: BorderRadius.circular(8)),
          child: const Icon(Icons.checklist_rounded, color: AppColors.success, size: 17),
        ),
        const SizedBox(width: 10),
        const Text('Recommendations', style: AppTextStyles.h5),
      ]),
      const SizedBox(height: 14),
      ...result.recommendation.recommendations.asMap().entries.map((e) => Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Container(
            width: 24, height: 24,
            margin: const EdgeInsets.only(top: 1),
            decoration: BoxDecoration(color: AppColors.primary.withValues(alpha: 0.1), shape: BoxShape.circle),
            child: Center(child: Text('${e.key + 1}',
                style: TextStyle(fontFamily: 'Poppins', fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.primary))),
          ),
          const SizedBox(width: 10),
          Expanded(child: Text(e.value, style: AppTextStyles.body2.copyWith(height: 1.5))),
        ]),
      )),
    ]),
  );

  Widget _buildFactorsCard(RiskResult result) {
    final byCategory = <String, List<RiskFactor>>{};
    for (final f in result.factors) {
      byCategory.putIfAbsent(f.category, () => []).add(f);
    }
    return Container(
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
            decoration: BoxDecoration(color: const Color(0xFFFFF0E8), borderRadius: BorderRadius.circular(8)),
            child: const Icon(Icons.warning_amber_rounded, color: Color(0xFFFF6B35), size: 17),
          ),
          const SizedBox(width: 10),
          const Text('Risk Factors', style: AppTextStyles.h5),
        ]),
        const SizedBox(height: 14),
        ...byCategory.entries.map((cat) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Text(cat.key[0].toUpperCase() + cat.key.substring(1),
                style: AppTextStyles.label.copyWith(color: AppColors.textSecondary)),
          ),
          ...cat.value.map((f) => _buildFactorTile(f, result)),
          const SizedBox(height: 6),
        ])),
      ]),
    );
  }

  Widget _buildFactorTile(RiskFactor f, RiskResult result) => Container(
    margin: const EdgeInsets.only(bottom: 8),
    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
    decoration: BoxDecoration(
      color: result.levelBgColor,
      borderRadius: BorderRadius.circular(12),
    ),
    child: Row(children: [
      Expanded(child: Text(f.label, style: AppTextStyles.body2.copyWith(fontWeight: FontWeight.w500))),
      Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(
          color: result.levelColor.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(20),
        ),
        child: Text(_impactLabel(f.weight),
            style: TextStyle(fontFamily: 'Poppins', fontSize: 11, fontWeight: FontWeight.w600, color: result.levelColor)),
      ),
    ]),
  );

  String _impactLabel(int weight) {
    if (weight >= 30) return 'High impact';
    if (weight >= 15) return 'Moderate impact';
    if (weight >= 8)  return 'Low impact';
    return 'Minor';
  }

  Widget _buildComputedAt(RiskResult result) {
    final diff = DateTime.now().difference(result.computedAt);
    String timeAgo;
    if (diff.inMinutes < 1) timeAgo = 'just now';
    else if (diff.inHours < 1) timeAgo = '${diff.inMinutes}m ago';
    else if (diff.inHours < 24) timeAgo = '${diff.inHours}h ago';
    else timeAgo = '${diff.inDays}d ago';

    return Row(mainAxisAlignment: MainAxisAlignment.center, children: [
      const Icon(Icons.access_time_rounded, size: 13, color: AppColors.textHint),
      const SizedBox(width: 5),
      Text('Last assessed $timeAgo', style: AppTextStyles.caption.copyWith(fontSize: 11)),
    ]);
  }
}
