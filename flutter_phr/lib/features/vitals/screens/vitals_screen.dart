import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import '../../../core/cubits/vitals_cubit.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/constants/app_constants.dart';
import '../../../core/models/vital_model.dart';
import '../../../widgets/charts/bp_chart.dart';
import '../../../core/widgets/shimmer_widgets.dart';
import 'health_sync_sheet.dart';

class VitalsScreen extends StatefulWidget {
  const VitalsScreen({super.key});
  @override
  State<VitalsScreen> createState() => _VitalsScreenState();
}

class _VitalsScreenState extends State<VitalsScreen> with SingleTickerProviderStateMixin {
  late TabController _tabCtrl;
  String _selectedType = 'blood_pressure';

  static const _vitalTypes = [
    _VitalType('blood_pressure', 'BP', Icons.favorite, AppColors.primary),
    _VitalType('glucose', 'Glucose', Icons.water_drop, AppColors.info),
    _VitalType('weight', 'Weight', Icons.monitor_weight, AppColors.warning),
    _VitalType('spo2', 'SpO2', Icons.air, AppColors.success),
    _VitalType('heart_rate', 'Heart', Icons.favorite_border, AppColors.heartRate),
    _VitalType('temperature', 'Temp', Icons.thermostat, AppColors.error),
  ];

  @override
  void initState() {
    super.initState();
    _tabCtrl = TabController(length: _vitalTypes.length, vsync: this);
    _tabCtrl.addListener(() { if (!_tabCtrl.indexIsChanging) setState(() => _selectedType = _vitalTypes[_tabCtrl.index].key); });
    Future.microtask(() => context.read<VitalsCubit>().loadLatestVitals());
  }

  @override
  void dispose() { _tabCtrl.dispose(); super.dispose(); }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text('Health Vitals'),
        actions: [
          IconButton(
            icon: const Icon(Icons.health_and_safety_outlined),
            tooltip: 'Sync Health Connect',
            onPressed: () => HealthSyncSheet.show(context),
          ),
          IconButton(icon: const Icon(Icons.camera_alt_outlined), onPressed: () => context.go(AppRoutes.heartRate), tooltip: 'Camera HR'),
          IconButton(icon: const Icon(Icons.add), onPressed: () => context.push('${AppRoutes.vitals}/add?type=$_selectedType')),
        ],
        bottom: PreferredSize(preferredSize: const Size.fromHeight(48), child: TabBar(
          controller: _tabCtrl, isScrollable: true, dividerColor: Colors.transparent,
          labelColor: AppColors.primary, unselectedLabelColor: AppColors.textHint,
          labelStyle: const TextStyle(fontFamily: 'Poppins', fontSize: 12, fontWeight: FontWeight.w600),
          indicator: BoxDecoration(color: AppColors.primaryLight, borderRadius: BorderRadius.circular(20)),
          tabs: _vitalTypes.map((t) => Tab(child: Row(mainAxisSize: MainAxisSize.min, children: [
            Icon(t.icon, size: 14), const SizedBox(width: 4), Text(t.label),
          ]))).toList(),
        )),
      ),
      body: TabBarView(controller: _tabCtrl, children: _vitalTypes.map((t) => _VitalTypeView(vitalType: t)).toList()),
    );
  }
}

class _VitalTypeView extends StatefulWidget {
  final _VitalType vitalType;
  const _VitalTypeView({required this.vitalType});
  @override
  State<_VitalTypeView> createState() => _VitalTypeViewState();
}

class _VitalTypeViewState extends State<_VitalTypeView> {
  List<VitalModel> _history = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    Future.microtask(() => _loadHistory());
  }

  Future<void> _loadHistory() async {
    final history = await context.read<VitalsCubit>().getVitalHistory(widget.vitalType.key);
    if (mounted) setState(() { _history = history; _loading = false; });
  }

  @override
  Widget build(BuildContext context) {
    final vitals = context.watch<VitalsCubit>().state;
    VitalModel? latest;
    switch (widget.vitalType.key) {
      case 'blood_pressure': latest = vitals.latestBP; break;
      case 'glucose': latest = vitals.latestGlucose; break;
      case 'weight': latest = vitals.latestWeight; break;
      case 'spo2': latest = vitals.latestSpo2; break;
      case 'heart_rate': latest = vitals.latestHeartRate; break;
      case 'temperature': latest = vitals.latestTemperature; break;
    }
    if (_loading) {
      return SingleChildScrollView(padding: const EdgeInsets.all(16), child: const Column(children: [
        ShimmerVitalCard(),
        SizedBox(height: 16),
        ShimmerTrendChart(),
        SizedBox(height: 16),
        ShimmerHistoryTile(),
        ShimmerHistoryTile(),
        ShimmerHistoryTile(),
        ShimmerHistoryTile(),
        ShimmerHistoryTile(),
      ]));
    }
    if (_history.isEmpty && latest == null) return _buildEmptyState(context);
    return SingleChildScrollView(padding: const EdgeInsets.all(16), child: Column(children: [
      _buildLatestCard(latest),
      const SizedBox(height: 16),
      _buildTrendChart(),
      const SizedBox(height: 16),
      _buildHistory(),
    ]));
  }

  static const _vitalInfo = {
    'blood_pressure': (
      title: 'Blood Pressure',
      desc: 'Track your systolic and diastolic pressure over time. Consistent monitoring helps detect hypertension early and understand how lifestyle changes affect your cardiovascular health.',
      tip: 'Tip: Measure at the same time each day for the most accurate trend.',
    ),
    'glucose': (
      title: 'Blood Glucose',
      desc: 'Monitor fasting and post-meal glucose to manage diabetes risk, energy levels, and dietary impact. Patterns over time reveal how your body responds to food and activity.',
      tip: 'Tip: Log fasting glucose every morning for the clearest picture.',
    ),
    'weight': (
      title: 'Body Weight',
      desc: 'Regular weight tracking supports fitness goals and early detection of unexplained changes that could signal a health issue.',
      tip: 'Tip: Weigh yourself at the same time each morning for consistency.',
    ),
    'spo2': (
      title: 'Oxygen Saturation',
      desc: 'SpO2 measures the percentage of oxygen in your blood. Tracking it helps detect respiratory issues, sleep apnoea, or the effects of altitude and illness.',
      tip: 'Tip: Normal SpO2 is 95–100%. Values below 94% warrant medical attention.',
    ),
    'heart_rate': (
      title: 'Heart Rate',
      desc: 'Your resting heart rate is one of the most reliable indicators of cardiovascular fitness and stress. Trends over time can reveal overtraining, illness, or improving fitness.',
      tip: 'Tip: Use the Camera HR feature for a quick contactless measurement.',
    ),
    'temperature': (
      title: 'Body Temperature',
      desc: 'Monitoring temperature helps you track fever progression, recovery from illness, and baseline deviations that may indicate infection.',
      tip: 'Tip: Normal adult temperature is 36.1–37.2 °C (97–99 °F).',
    ),
  };

  Widget _buildEmptyState(BuildContext context) {
    final info = _vitalInfo[widget.vitalType.key];
    final title = info?.title ?? widget.vitalType.label;
    final desc = info?.desc ?? 'Start logging ${widget.vitalType.label} readings to see trends and insights here.';
    final tip = info?.tip;

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(20, 24, 20, 40),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        // ── Hero icon ──
        Center(child: Container(
          width: 88, height: 88,
          decoration: BoxDecoration(
            color: widget.vitalType.color.withValues(alpha: 0.1),
            shape: BoxShape.circle,
          ),
          child: Icon(widget.vitalType.icon, color: widget.vitalType.color, size: 42),
        )),
        const SizedBox(height: 20),
        Center(child: Text('No $title data yet',
            style: AppTextStyles.h4, textAlign: TextAlign.center)),
        const SizedBox(height: 10),
        Center(child: Text(desc,
            style: AppTextStyles.body2.copyWith(color: AppColors.textSecondary, height: 1.6),
            textAlign: TextAlign.center)),

        if (tip != null) ...[
          const SizedBox(height: 20),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            decoration: BoxDecoration(
              color: widget.vitalType.color.withValues(alpha: 0.07),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: widget.vitalType.color.withValues(alpha: 0.2)),
            ),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Icon(Icons.lightbulb_outline_rounded, size: 16, color: widget.vitalType.color),
              const SizedBox(width: 8),
              Expanded(child: Text(tip,
                  style: AppTextStyles.caption.copyWith(
                      color: widget.vitalType.color, fontWeight: FontWeight.w500, height: 1.5))),
            ]),
          ),
        ],

        const SizedBox(height: 32),

        // ── How it works ──
        const Text('HOW IT WORKS', style: AppTextStyles.label),
        const SizedBox(height: 14),
        _howItWorksStep(1, 'Log a reading', 'Tap "Add Manually" or sync from a wearable via Health Connect.', Icons.edit_note_rounded),
        _howItWorksStep(2, 'Upload a report', 'Upload a lab report — vitals are extracted automatically using AI.', Icons.upload_file_rounded),
        _howItWorksStep(3, 'Track trends', 'View 30-day charts, status badges, and history in this tab.', Icons.show_chart_rounded),

        const SizedBox(height: 32),

        // ── Action buttons ──
        SizedBox(
          width: double.infinity,
          child: ElevatedButton.icon(
            onPressed: () => context.push('${AppRoutes.vitals}/add?type=${widget.vitalType.key}'),
            icon: const Icon(Icons.add_rounded, size: 18),
            label: const Text('Add Manually'),
            style: ElevatedButton.styleFrom(
              backgroundColor: widget.vitalType.color,
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(vertical: 14),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
              textStyle: const TextStyle(fontFamily: 'Poppins', fontSize: 14, fontWeight: FontWeight.w600),
            ),
          ),
        ),
        const SizedBox(height: 12),
        SizedBox(
          width: double.infinity,
          child: OutlinedButton.icon(
            onPressed: () => context.push(AppRoutes.uploadDocument),
            icon: Icon(Icons.upload_file_rounded, size: 18, color: widget.vitalType.color),
            label: Text('Upload Lab Report', style: TextStyle(color: widget.vitalType.color)),
            style: OutlinedButton.styleFrom(
              padding: const EdgeInsets.symmetric(vertical: 14),
              side: BorderSide(color: widget.vitalType.color),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
              textStyle: const TextStyle(fontFamily: 'Poppins', fontSize: 14, fontWeight: FontWeight.w600),
            ),
          ),
        ),
      ]),
    );
  }

  Widget _howItWorksStep(int step, String title, String desc, IconData icon) => Padding(
    padding: const EdgeInsets.only(bottom: 14),
    child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Container(
        width: 32, height: 32,
        decoration: BoxDecoration(
          color: widget.vitalType.color.withValues(alpha: 0.1),
          shape: BoxShape.circle,
        ),
        child: Center(child: Text('$step',
            style: TextStyle(fontFamily: 'Poppins', fontSize: 13, fontWeight: FontWeight.w700,
                color: widget.vitalType.color))),
      ),
      const SizedBox(width: 12),
      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Icon(icon, size: 14, color: AppColors.textSecondary),
          const SizedBox(width: 5),
          Text(title, style: AppTextStyles.body2.copyWith(fontWeight: FontWeight.w600)),
        ]),
        const SizedBox(height: 2),
        Text(desc, style: AppTextStyles.caption.copyWith(height: 1.5)),
      ])),
    ]),
  );

  Widget _buildLatestCard(VitalModel? vital) {
    final color = _statusColor(vital?.status);
    return Container(padding: const EdgeInsets.all(20), decoration: BoxDecoration(
      color: AppColors.surface, borderRadius: BorderRadius.circular(20),
      boxShadow: [BoxShadow(color: widget.vitalType.color.withOpacity(0.12), blurRadius: 16, offset: const Offset(0, 4))],
    ), child: Row(children: [
      Container(width: 60, height: 60, decoration: BoxDecoration(
        color: widget.vitalType.color.withOpacity(0.1), borderRadius: BorderRadius.circular(16),
      ), child: Icon(widget.vitalType.icon, color: widget.vitalType.color, size: 30)),
      const SizedBox(width: 16),
      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('Latest ${widget.vitalType.label}', style: AppTextStyles.body2),
        const SizedBox(height: 4),
        vital == null
          ? const Text('No data', style: AppTextStyles.h3)
          : Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
              Text(vital.displayValue, style: AppTextStyles.h2.copyWith(color: widget.vitalType.color)),
              const SizedBox(width: 4),
              Padding(padding: const EdgeInsets.only(bottom: 4), child: Text(vital.displayUnit, style: AppTextStyles.body2)),
            ]),
        if (vital != null) Container(padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2), margin: const EdgeInsets.only(top: 4),
          decoration: BoxDecoration(color: color.withOpacity(0.15), borderRadius: BorderRadius.circular(8)),
          child: Text(vital.status.toUpperCase(), style: TextStyle(fontFamily: 'Poppins', fontSize: 10, color: color, fontWeight: FontWeight.w600))),
      ])),
      if (vital != null) Column(children: [
        Text('${vital.recordedAt.day}/${vital.recordedAt.month}', style: AppTextStyles.caption),
        Text('${vital.recordedAt.hour}:${vital.recordedAt.minute.toString().padLeft(2, '0')}', style: AppTextStyles.caption),
      ]),
    ]));
  }

  Color _statusColor(String? status) {
    switch (status) {
      case 'normal': return AppColors.success;
      case 'elevated': case 'high': return AppColors.warning;
      case 'critical': return AppColors.error;
      case 'low': return AppColors.info;
      default: return AppColors.textSecondary;
    }
  }

  Widget _buildTrendChart() => Container(padding: const EdgeInsets.all(16), decoration: BoxDecoration(
    color: AppColors.surface, borderRadius: BorderRadius.circular(16),
  ), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
    Text('30-Day Trend', style: AppTextStyles.h5),
    const SizedBox(height: 12),
    SizedBox(height: 140, child: BpTrendChart(vitals: _history, color: widget.vitalType.color)),
  ]));

  Widget _buildHistory() => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
    const Text('History', style: AppTextStyles.h5),
    const SizedBox(height: 12),
    ..._history.take(20).map((v) => _historyTile(v)),
  ]);

  Widget _historyTile(VitalModel v) {
    final isOcr = v.source == 'ocr' || v.source == 'document';
    return Container(margin: const EdgeInsets.only(bottom: 8), padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(12)), child: Row(children: [
        Container(width: 8, height: 40, decoration: BoxDecoration(
          color: _statusColor(v.status), borderRadius: BorderRadius.circular(4),
        )),
        const SizedBox(width: 12),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Text('${v.displayValue} ${v.displayUnit}', style: AppTextStyles.h5),
            if (isOcr) ...[
              const SizedBox(width: 6),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                decoration: BoxDecoration(color: AppColors.primaryLight, borderRadius: BorderRadius.circular(4)),
                child: const Text('Lab', style: TextStyle(fontFamily: 'Poppins', fontSize: 9, fontWeight: FontWeight.w600, color: AppColors.primary)),
              ),
            ],
          ]),
          Text('${v.recordedAt.day}/${v.recordedAt.month}/${v.recordedAt.year} · ${v.recordedAt.hour}:${v.recordedAt.minute.toString().padLeft(2, '0')}', style: AppTextStyles.caption),
        ])),
        Container(padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3), decoration: BoxDecoration(
          color: _statusColor(v.status).withValues(alpha: 0.1), borderRadius: BorderRadius.circular(8),
        ), child: Text(v.status, style: TextStyle(fontFamily: 'Poppins', fontSize: 11, color: _statusColor(v.status)))),
      ]));
  }
}

class _VitalType {
  final String key;
  final String label;
  final IconData icon;
  final Color color;
  const _VitalType(this.key, this.label, this.icon, this.color);
}
