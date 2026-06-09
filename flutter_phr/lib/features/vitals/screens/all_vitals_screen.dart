import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../../core/cubits/all_vitals_cubit.dart';
import '../../../core/constants/app_constants.dart';
import '../../../core/theme/app_theme.dart';

// ─── Category / top-vital definitions ─────────────────────────────────────────

class _TopDef {
  final String key;
  final List<String> aliases;
  final String label;
  final IconData icon;
  final Color color;
  const _TopDef(this.key, this.label, this.icon, this.color, {this.aliases = const []});
}

class _CatDef {
  final String name;
  final IconData icon;
  final Color color;
  final List<String> keys;
  const _CatDef(this.name, this.icon, this.color, this.keys);
}

const _kTopVitals = <_TopDef>[
  _TopDef('hemoglobin',             'Hemoglobin',  Icons.bloodtype_outlined,      Color(0xFF9C8FFA),
      aliases: ['hb', 'haemoglobin', 'hemoglobin_level']),
  _TopDef('fasting_glucose',        'Blood Sugar', Icons.water_drop_outlined,     Color(0xFF7B6EF6),
      aliases: ['glucose', 'glucose_fasting', 'blood_glucose', 'glucose_random', 'random_glucose']),
  _TopDef('hba1c',                  'HbA1c',       Icons.science_outlined,        Color(0xFF7B6EF6),
      aliases: ['hemoglobin_a1c', 'glycated_hemoglobin', 'a1c', 'glycohemoglobin']),
  _TopDef('total_cholesterol',      'Cholesterol', Icons.favorite_outline,        Color(0xFF1E88E5),
      aliases: ['cholesterol', 'total_chol', 'chol']),
  _TopDef('blood_pressure_systolic','BP Systolic', Icons.speed_outlined,          Color(0xFF1E88E5),
      aliases: ['systolic_bp', 'sbp', 'blood_pressure']),
  _TopDef('heart_rate',             'Heart Rate',  Icons.monitor_heart_outlined,  Color(0xFF5A4BD1),
      aliases: ['pulse', 'pulse_rate', 'hr']),
  _TopDef('spo2',                   'SpO2',        Icons.air_outlined,            Color(0xFF00BFA5),
      aliases: ['oxygen_saturation', 'spo2_pulse_oximetry', 'o2_saturation', 'pulse_oximetry']),
  _TopDef('tsh',                    'TSH',         Icons.biotech_outlined,        Color(0xFFA29BFE),
      aliases: ['thyroid_stimulating_hormone', 'tsh_ultrasensitive', 'thyrotropin', 'tsh_3rd_generation']),
  _TopDef('vitamin_d',              'Vitamin D',   Icons.wb_sunny_outlined,       Color(0xFFB8AEFB),
      aliases: ['vitamin_d_25_hydroxy', '25_oh_vitamin_d', 'vit_d', 'calcifediol',
                '25_hydroxyvitamin_d', 'vitamin_d3', '25_oh_vit_d']),
  _TopDef('serum_creatinine',       'Creatinine',  Icons.water_outlined,          Color(0xFF1E88E5),
      aliases: ['creatinine', 's_creatinine', 'serum_creat', 'creat']),
];

const _kCategories = <_CatDef>[
  _CatDef('Sugar / Diabetes', Icons.water_drop_outlined, Color(0xFF7B6EF6),
    ['fasting_glucose','glucose','glucose_random','glucose_post_prandial','hba1c','insulin',
     'blood_glucose','random_glucose','pp_glucose','glucose_fasting','glucose_pp',
     'glycated_hemoglobin','hemoglobin_a1c','a1c','glycohemoglobin','glucose_postprandial']),
  _CatDef('Blood (CBC)', Icons.bloodtype_outlined, Color(0xFF5A4BD1),
    ['hemoglobin','hb','haemoglobin','hematocrit','pcv','packed_cell_volume',
     'rbc_count','rbc','red_blood_cells','red_blood_cell_count',
     'wbc_count','wbc','total_wbc','total_wbc_count','leukocytes','leucocyte_count','total_leukocyte_count','tlc',
     'platelet_count','platelets','plt','thrombocyte_count',
     'mcv','mch','mchc','rdw','rdw_cv','rdw_sd',
     'neutrophils','neutrophils_percent','neutrophil_percent','seg_neutrophils',
     'lymphocytes','lymphocytes_percent','lymphocyte_percent',
     'monocytes','monocytes_percent','monocyte_percent',
     'eosinophils','eosinophils_percent','eosinophil_percent',
     'basophils','basophils_percent','basophil_percent']),
  _CatDef('Infection', Icons.coronavirus_outlined, Color(0xFF00BFA5),
    ['wbc_count','wbc','total_wbc','tlc','neutrophils','neutrophils_percent',
     'lymphocytes','lymphocytes_percent','monocytes','eosinophils','basophils',
     'crp','c_reactive_protein','hs_crp','high_sensitivity_crp',
     'esr','erythrocyte_sedimentation_rate','procalcitonin','pct',
     'temperature','body_temperature']),
  _CatDef('Heart', Icons.favorite_outline, Color(0xFF1E88E5),
    ['blood_pressure_systolic','blood_pressure_diastolic','blood_pressure','heart_rate','pulse','hr',
     'total_cholesterol','cholesterol','chol',
     'hdl_cholesterol','hdl','hdl_chol',
     'ldl_cholesterol','ldl','ldl_chol',
     'triglycerides','tg','trigs',
     'vldl_cholesterol','vldl','non_hdl_cholesterol','non_hdl',
     'troponin','troponin_i','troponin_t','hs_troponin','bnp','nt_pro_bnp',
     'spo2','oxygen_saturation','pulse_oximetry']),
  _CatDef('Gallbladder / Pancreas', Icons.medical_services_outlined, Color(0xFF6C5CE7),
    ['alp','alkaline_phosphatase','ggt','gamma_gt',
     'total_bilirubin','direct_bilirubin','indirect_bilirubin','conjugated_bilirubin',
     'lipase','amylase','serum_amylase']),
  _CatDef('Vitamins & Minerals', Icons.spa_outlined, Color(0xFF00BFA5),
    ['vitamin_d','vitamin_d_25_hydroxy','25_oh_vitamin_d','vit_d','calcifediol','25_oh_vit_d','vitamin_d3',
     'vitamin_b12','cobalamin','vit_b12',
     'folate','folic_acid','vitamin_b9',
     'ferritin','serum_ferritin',
     'serum_iron','iron','fe','transferrin_saturation',
     'tibc','total_iron_binding_capacity','uibc',
     'calcium','serum_calcium','sodium','serum_sodium','potassium','serum_potassium',
     'chloride','magnesium','phosphorus','phosphate','zinc','vitamin_c','vitamin_a',
     'weight','body_weight','bmi']),
  _CatDef('Inflammatory Markers', Icons.local_fire_department_outlined, Color(0xFF9C8FFA),
    ['crp','c_reactive_protein','hs_crp','high_sensitivity_crp',
     'esr','erythrocyte_sedimentation_rate',
     'ferritin','serum_ferritin',
     'il6','interleukin_6','procalcitonin','pct','fibrinogen',
     'wbc_count','wbc','total_wbc','tlc']),
  _CatDef('Kidney & Urine', Icons.water_outlined, Color(0xFF1E88E5),
    ['serum_creatinine','creatinine','s_creatinine','serum_creat',
     'bun','urea_nitrogen','blood_urea_nitrogen','blood_urea','urea','serum_urea',
     'uric_acid','serum_uric_acid','gout',
     'egfr','estimated_gfr','creatinine_clearance',
     'sodium','potassium','chloride','calcium',
     'urine_protein','urine_creatinine','microalbumin','urine_albumin']),
  _CatDef('Thyroid', Icons.biotech_outlined, Color(0xFFA29BFE),
    ['tsh','thyroid_stimulating_hormone','tsh_ultrasensitive','tsh_3rd_generation','thyrotropin',
     't3','total_t3','triiodothyronine',
     't4','total_t4','thyroxine',
     'free_t3','ft3','free_triiodothyronine',
     'free_t4','ft4','free_thyroxine']),
  _CatDef('Liver', Icons.science_outlined, Color(0xFF6C5CE7),
    ['sgpt','alt','alanine_aminotransferase','alanine_transaminase',
     'sgot','ast','aspartate_aminotransferase','aspartate_transaminase',
     'alp','alkaline_phosphatase',
     'total_bilirubin','direct_bilirubin','indirect_bilirubin',
     'albumin','serum_albumin','total_protein','ggt','gamma_gt']),
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

Color _statusColor(String? s) {
  switch (s) {
    case 'normal':   return AppColors.success;
    case 'elevated':
    case 'high':     return AppColors.warning;
    case 'low':      return AppColors.info;
    case 'critical': return AppColors.error;
    default:         return AppColors.textHint;
  }
}

IconData _statusIcon(String? s) {
  switch (s) {
    case 'normal':   return Icons.check_circle_outline;
    case 'elevated':
    case 'high':     return Icons.arrow_upward_rounded;
    case 'low':      return Icons.arrow_downward_rounded;
    case 'critical': return Icons.warning_amber_rounded;
    default:         return Icons.help_outline;
  }
}

String _fmt(String key) => key
    .split('_')
    .map((w) => w.isEmpty ? '' : '${w[0].toUpperCase()}${w.substring(1)}')
    .join(' ');

String _fmtVal(dynamic v) {
  if (v is num) {
    final d = v.toDouble();
    return d == d.truncateToDouble() ? d.toInt().toString() : d.toStringAsFixed(2);
  }
  return '$v';
}

Map<String, dynamic> _vals(Map<String, dynamic> vital) {
  final v = vital['values'];
  if (v is Map) return Map<String, dynamic>.from(v);
  return {};
}

String? _worstStatus(List<Map<String, dynamic>> records) {
  const order = ['critical', 'high', 'elevated', 'low', 'unknown', 'normal'];
  String? worst;
  for (final r in records) {
    final s = (r['status'] as String?) ?? (_vals(r)['status'] as String?) ?? 'unknown';
    if (worst == null || order.indexOf(s) < order.indexOf(worst)) worst = s;
  }
  return worst;
}

final _dateFmt = DateFormat('dd MMM yyyy');

Map<String, dynamic>? _findVital(_TopDef def, Map<String, dynamic> vitals) {
  for (final k in [def.key, ...def.aliases]) {
    final v = vitals[k];
    if (v != null) return v as Map<String, dynamic>;
  }
  return null;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

class AllVitalsScreen extends StatefulWidget {
  const AllVitalsScreen({super.key});
  @override
  State<AllVitalsScreen> createState() => _AllVitalsScreenState();
}

class _AllVitalsScreenState extends State<AllVitalsScreen> {
  @override
  void initState() {
    super.initState();
    Future.microtask(() => context.read<AllVitalsCubit>().loadAllVitals());
  }

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<AllVitalsCubit, AllVitalsState>(
      builder: (context, state) {
        return Scaffold(
          backgroundColor: AppColors.background,
          body: RefreshIndicator(
            color: AppColors.primary,
            onRefresh: () => context.read<AllVitalsCubit>().loadAllVitals(),
            child: CustomScrollView(
              slivers: [
                SliverAppBar(
                  pinned: true,
                  backgroundColor: AppColors.background,
                  title: const Text('Health Summary'),
                  centerTitle: false,
                ),
                if (state.isLoading)
                  const SliverFillRemaining(
                    child: Center(child: CircularProgressIndicator()),
                  )
                else if (state.vitals.isEmpty)
                  SliverFillRemaining(
                    hasScrollBody: false,
                    child: _buildEmptyState(context),
                  )
                else ...[
                  // ── Key Vitals header ──
                  SliverToBoxAdapter(
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Key Vitals', style: AppTextStyles.h4),
                          const SizedBox(height: 2),
                          Text(
                            'Top 10 vitals to monitor your overall health',
                            style: AppTextStyles.caption,
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SliverToBoxAdapter(child: SizedBox(height: 10)),
                  // ── Horizontal top-10 cards ──
                  SliverToBoxAdapter(
                    child: SizedBox(
                      height: 158,
                      child: ListView.separated(
                        scrollDirection: Axis.horizontal,
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                        itemCount: _kTopVitals.length,
                        separatorBuilder: (_, __) => const SizedBox(width: 10),
                        itemBuilder: (_, i) {
                          final def = _kTopVitals[i];
                          final vital = _findVital(def, state.vitals);
                          return _KeyVitalCard(def: def, vital: vital);
                        },
                      ),
                    ),
                  ),
                  // ── Health Summary header ──
                  SliverToBoxAdapter(
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(16, 20, 16, 10),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Expanded(
                            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              Text('Health Summary', style: AppTextStyles.h4),
                              const SizedBox(height: 2),
                              Text('Tap a category to see all vitals', style: AppTextStyles.caption),
                            ]),
                          ),
                          if (state.vitals.isNotEmpty) ...[
                            Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                              Text('Latest data',
                                  style: AppTextStyles.caption.copyWith(fontSize: 10, color: AppColors.textHint)),
                              const SizedBox(height: 2),
                              Text(
                                _dateFmt.format(
                                  state.vitals.values
                                      .map((v) {
                                        final r = (v as Map<String, dynamic>)['recorded_at'];
                                        return r != null ? DateTime.tryParse(r.toString()) : null;
                                      })
                                      .whereType<DateTime>()
                                      .fold<DateTime?>(null, (a, b) => a == null || b.isAfter(a) ? b : a)!
                                      .toLocal(),
                                ),
                                style: AppTextStyles.caption.copyWith(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w600,
                                  color: AppColors.primary,
                                ),
                              ),
                            ]),
                          ],
                        ],
                      ),
                    ),
                  ),
                  // ── Super vitals 2-column grid ──
                  SliverPadding(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                    sliver: SliverGrid(
                      delegate: SliverChildBuilderDelegate(
                        (_, i) {
                          final cat = _kCategories[i];
                          final records = cat.keys
                              .where((k) => state.vitals.containsKey(k))
                              .map((k) => state.vitals[k] as Map<String, dynamic>)
                              .toList();
                          return _SuperVitalCard(
                            cat: cat,
                            records: records,
                            onTap: () => _showDetail(context, cat, records),
                          );
                        },
                        childCount: _kCategories.length,
                      ),
                      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                        crossAxisCount: 2,
                        crossAxisSpacing: 12,
                        mainAxisSpacing: 12,
                        childAspectRatio: 0.78,
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildEmptyState(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(24, 32, 24, 48),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        // ── Hero ──
        Center(child: Container(
          width: 96, height: 96,
          decoration: BoxDecoration(
            gradient: const LinearGradient(colors: AppColors.aiGradient, begin: Alignment.topLeft, end: Alignment.bottomRight),
            shape: BoxShape.circle,
            boxShadow: [BoxShadow(color: AppColors.primary.withValues(alpha: 0.2), blurRadius: 20, offset: const Offset(0, 8))],
          ),
          child: const Icon(Icons.health_and_safety_rounded, color: Colors.white, size: 46),
        )),
        const SizedBox(height: 22),
        const Center(child: Text('Your Health Summary', style: AppTextStyles.h3, textAlign: TextAlign.center)),
        const SizedBox(height: 10),
        Center(child: Text(
          'This screen aggregates all your lab results and vitals into a single health overview — organised by body system so you can spot issues at a glance.',
          style: AppTextStyles.body2.copyWith(color: AppColors.textSecondary, height: 1.65),
          textAlign: TextAlign.center,
        )),

        const SizedBox(height: 28),

        // ── What you'll see ──
        const Text('WHAT YOU\'LL SEE', style: AppTextStyles.label),
        const SizedBox(height: 14),
        _featurePill(Icons.water_drop_outlined,         'Sugar / Diabetes',     const Color(0xFFFF6B6B)),
        _featurePill(Icons.bloodtype_outlined,           'Blood (CBC)',          const Color(0xFFE74C3C)),
        _featurePill(Icons.favorite_outline,             'Heart & Cholesterol',  const Color(0xFFFF7675)),
        _featurePill(Icons.biotech_outlined,             'Thyroid',              const Color(0xFFA29BFE)),
        _featurePill(Icons.science_outlined,             'Liver',                const Color(0xFFE17055)),
        _featurePill(Icons.water_outlined,               'Kidney & Urine',       const Color(0xFF0984E3)),
        _featurePill(Icons.spa_outlined,                 'Vitamins & Minerals',  const Color(0xFF00B894)),
        _featurePill(Icons.local_fire_department_outlined,'Inflammatory Markers', const Color(0xFFFF9F43)),

        const SizedBox(height: 28),

        // ── How it works ──
        const Text('HOW IT WORKS', style: AppTextStyles.label),
        const SizedBox(height: 14),
        _howStep(1, Icons.upload_file_rounded,    AppColors.primary,    'Upload a lab report',    'Take a photo or upload a PDF from any hospital or diagnostic lab.'),
        _howStep(2, Icons.auto_awesome_rounded,   const Color(0xFF7C3AED), 'AI extracts everything', 'Gemini reads every result — glucose, CBC, lipids, thyroid and more — automatically.'),
        _howStep(3, Icons.health_and_safety_rounded, AppColors.success, 'See your health summary', 'Results appear here, grouped by category with status badges and reference ranges.'),

        const SizedBox(height: 32),

        // ── Actions ──
        SizedBox(
          width: double.infinity,
          child: ElevatedButton.icon(
            onPressed: () => context.push(AppRoutes.uploadDocument),
            icon: const Icon(Icons.upload_file_rounded, size: 18),
            label: const Text('Upload Lab Report'),
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.primary,
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
            onPressed: () => context.push(AppRoutes.addVital),
            icon: const Icon(Icons.add_rounded, size: 18),
            label: const Text('Add a Vital Manually'),
            style: OutlinedButton.styleFrom(
              foregroundColor: AppColors.primary,
              side: const BorderSide(color: AppColors.primary),
              padding: const EdgeInsets.symmetric(vertical: 14),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
              textStyle: const TextStyle(fontFamily: 'Poppins', fontSize: 14, fontWeight: FontWeight.w600),
            ),
          ),
        ),
      ]),
    );
  }

  Widget _featurePill(IconData icon, String label, Color color) => Padding(
    padding: const EdgeInsets.only(bottom: 8),
    child: Row(children: [
      Container(
        width: 34, height: 34,
        decoration: BoxDecoration(color: color.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(9)),
        child: Icon(icon, color: color, size: 17),
      ),
      const SizedBox(width: 12),
      Text(label, style: AppTextStyles.body2.copyWith(fontWeight: FontWeight.w500)),
    ]),
  );

  Widget _howStep(int step, IconData icon, Color color, String title, String desc) => Padding(
    padding: const EdgeInsets.only(bottom: 16),
    child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Container(
        width: 36, height: 36,
        decoration: BoxDecoration(color: color.withValues(alpha: 0.12), shape: BoxShape.circle),
        child: Center(child: Text('$step',
            style: TextStyle(fontFamily: 'Poppins', fontSize: 14, fontWeight: FontWeight.w700, color: color))),
      ),
      const SizedBox(width: 12),
      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Icon(icon, size: 14, color: color),
          const SizedBox(width: 5),
          Text(title, style: AppTextStyles.body2.copyWith(fontWeight: FontWeight.w600)),
        ]),
        const SizedBox(height: 3),
        Text(desc, style: AppTextStyles.caption.copyWith(height: 1.5, color: AppColors.textSecondary)),
      ])),
    ]),
  );

  void _showDetail(BuildContext context, _CatDef cat, List<Map<String, dynamic>> records) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _SuperVitalSheet(cat: cat, records: records),
    );
  }
}

// ─── Key Vital Card ───────────────────────────────────────────────────────────

class _KeyVitalCard extends StatelessWidget {
  final _TopDef def;
  final Map<String, dynamic>? vital;
  const _KeyVitalCard({required this.def, required this.vital});

  @override
  Widget build(BuildContext context) {
    final hasData = vital != null;
    final values = hasData ? _vals(vital!) : <String, dynamic>{};
    final value = values['value'];
    final unit = (values['unit'] as String?) ?? '';
    final status = hasData
        ? ((vital!['status'] as String?) ?? (values['status'] as String?) ?? 'unknown')
        : null;
    final sColor = hasData ? _statusColor(status) : AppColors.textHint;
    final recordedAt = hasData ? vital!['recorded_at'] : null;

    return Container(
      width: 128,
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Icon header
          Container(
            width: double.infinity,
            height: 52,
            decoration: BoxDecoration(
              color: def.color.withValues(alpha: hasData ? 0.12 : 0.06),
              borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
            ),
            child: Center(
              child: Icon(def.icon, color: hasData ? def.color : AppColors.textHint, size: 24),
            ),
          ),
          // Content
          Expanded(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(10, 8, 10, 8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(def.label, style: AppTextStyles.caption.copyWith(fontWeight: FontWeight.w600), maxLines: 1, overflow: TextOverflow.ellipsis),
                  const SizedBox(height: 4),
                  if (hasData && value != null)
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.baseline,
                      textBaseline: TextBaseline.alphabetic,
                      children: [
                        Text(_fmtVal(value),
                            style: const TextStyle(fontFamily: 'Poppins', fontSize: 18, fontWeight: FontWeight.w700, color: AppColors.textPrimary)),
                        if (unit.isNotEmpty) ...[
                          const SizedBox(width: 2),
                          Flexible(child: Text(unit, style: AppTextStyles.caption.copyWith(fontSize: 9), overflow: TextOverflow.ellipsis)),
                        ],
                      ],
                    )
                  else
                    const Text('—', style: TextStyle(fontFamily: 'Poppins', fontSize: 18, fontWeight: FontWeight.w700, color: AppColors.textHint)),
                  const Spacer(),
                  if (hasData)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: sColor.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Row(mainAxisSize: MainAxisSize.min, children: [
                        Icon(_statusIcon(status), size: 9, color: sColor),
                        const SizedBox(width: 3),
                        Text(status?.toUpperCase() ?? '', style: TextStyle(fontFamily: 'Poppins', fontSize: 8, fontWeight: FontWeight.w700, color: sColor)),
                      ]),
                    )
                  else
                    Text('No data', style: AppTextStyles.caption.copyWith(fontSize: 9, color: AppColors.textHint)),
                  if (recordedAt != null) ...[
                    const SizedBox(height: 2),
                    Text(
                      _dateFmt.format(DateTime.parse(recordedAt.toString()).toLocal()),
                      style: AppTextStyles.caption.copyWith(fontSize: 8, color: AppColors.textHint),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Super Vital Card ─────────────────────────────────────────────────────────

class _SuperVitalCard extends StatelessWidget {
  final _CatDef cat;
  final List<Map<String, dynamic>> records;
  final VoidCallback onTap;
  const _SuperVitalCard({required this.cat, required this.records, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final found = records.length;
    final outOfRange = records.where((r) {
      final s = (r['status'] as String?) ?? (_vals(r)['status'] as String?) ?? 'unknown';
      return const {'high', 'elevated', 'low', 'critical'}.contains(s);
    }).length;
    final worst = _worstStatus(records);
    final sColor = found > 0 ? _statusColor(worst) : AppColors.textHint;
    final hasData = found > 0;

    return Material(
      color: AppColors.surface,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: AppColors.border),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Icon header
              Container(
                height: 72,
                decoration: BoxDecoration(
                  color: cat.color.withValues(alpha: hasData ? 0.12 : 0.06),
                  borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
                ),
                child: Center(
                  child: Icon(cat.icon, color: hasData ? cat.color : AppColors.textHint, size: 30),
                ),
              ),
              // Content
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(10, 8, 10, 10),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.center,
                    children: [
                      Text(cat.name, style: AppTextStyles.body2.copyWith(fontWeight: FontWeight.w700, fontSize: 14), maxLines: 2, overflow: TextOverflow.ellipsis, textAlign: TextAlign.center),
                      if (hasData && outOfRange > 0) ...[
                        const SizedBox(height: 4),
                        Row(mainAxisSize: MainAxisSize.min, children: [
                          const Icon(Icons.warning_amber_rounded, size: 10, color: AppColors.warning),
                          const SizedBox(width: 3),
                          Text(
                            '$outOfRange out of range',
                            style: AppTextStyles.caption.copyWith(fontSize: 10, color: AppColors.warning, fontWeight: FontWeight.w600),
                          ),
                        ]),
                      ] else if (hasData) ...[
                        const SizedBox(height: 4),
                        Text('All in range', textAlign: TextAlign.center, style: AppTextStyles.caption.copyWith(fontSize: 10, color: AppColors.success, fontWeight: FontWeight.w600)),
                      ],
                      const Spacer(),
                      if (hasData) ...[
                        // Status badge
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                          decoration: BoxDecoration(
                            color: sColor.withValues(alpha: 0.12),
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(color: sColor.withValues(alpha: 0.3)),
                          ),
                          child: Row(mainAxisSize: MainAxisSize.min, children: [
                            Icon(_statusIcon(worst), size: 10, color: sColor),
                            const SizedBox(width: 3),
                            Text(
                              (worst ?? 'unknown').toUpperCase(),
                              style: TextStyle(fontFamily: 'Poppins', fontSize: 9, fontWeight: FontWeight.w700, color: sColor),
                            ),
                          ]),
                        ),
                        const SizedBox(height: 5),
                        Text('$found vitals recorded', textAlign: TextAlign.center, style: AppTextStyles.caption.copyWith(fontSize: 10)),
                      ] else
                        Text('No records found', textAlign: TextAlign.center, style: AppTextStyles.caption.copyWith(fontSize: 10, color: AppColors.textHint)),
                    ],
                  ),
                ),
              ),
              // Bottom color bar
              ClipRRect(
                borderRadius: const BorderRadius.vertical(bottom: Radius.circular(16)),
                child: LinearProgressIndicator(
                  value: 1,
                  minHeight: 3,
                  backgroundColor: hasData ? sColor.withValues(alpha: 0.15) : AppColors.border,
                  valueColor: AlwaysStoppedAnimation<Color>(hasData ? sColor.withValues(alpha: 0.5) : AppColors.border),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ─── Super Vital Detail Bottom Sheet ─────────────────────────────────────────

class _SuperVitalSheet extends StatelessWidget {
  final _CatDef cat;
  final List<Map<String, dynamic>> records;
  const _SuperVitalSheet({required this.cat, required this.records});

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      initialChildSize: 0.65,
      minChildSize: 0.4,
      maxChildSize: 0.95,
      builder: (_, scrollCtrl) => Container(
        decoration: const BoxDecoration(
          color: AppColors.background,
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
        child: Column(
          children: [
            // Handle
            const SizedBox(height: 10),
            Container(width: 36, height: 4, decoration: BoxDecoration(color: AppColors.border, borderRadius: BorderRadius.circular(2))),
            const SizedBox(height: 14),
            // Header
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: Row(children: [
                Container(
                  width: 44, height: 44,
                  decoration: BoxDecoration(color: cat.color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(12)),
                  child: Icon(cat.icon, color: cat.color, size: 22),
                ),
                const SizedBox(width: 12),
                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(cat.name, style: AppTextStyles.h4),
                  Text(
                    records.isEmpty ? 'No vitals recorded yet' : '${records.length} vital${records.length == 1 ? '' : 's'} recorded',
                    style: AppTextStyles.caption,
                  ),
                ])),
              ]),
            ),
            const SizedBox(height: 14),
            const Divider(height: 1),
            // Vital list
            Expanded(
              child: records.isEmpty
                  ? Center(
                      child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                        Icon(cat.icon, size: 48, color: AppColors.textHint),
                        const SizedBox(height: 12),
                        const Text('Upload a lab report to see these vitals', style: AppTextStyles.body2, textAlign: TextAlign.center),
                      ]),
                    )
                  : ListView.builder(
                      controller: scrollCtrl,
                      padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
                      itemCount: records.length,
                      itemBuilder: (_, i) => _VitalDetailRow(
                        vitalKey: records[i]['type'] as String,
                        vital: records[i],
                      ),
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Vital detail row ─────────────────────────────────────────────────────────

class _VitalDetailRow extends StatelessWidget {
  final String vitalKey;
  final Map<String, dynamic> vital;
  const _VitalDetailRow({required this.vitalKey, required this.vital});

  @override
  Widget build(BuildContext context) {
    final values = _vals(vital);
    final value = values['value'];
    final unit = (values['unit'] as String?) ?? '';
    final status = (vital['status'] as String?) ?? (values['status'] as String?) ?? 'unknown';
    final refMin = (values['reference_min'] as num?)?.toDouble();
    final refMax = (values['reference_max'] as num?)?.toDouble();
    final hasRange = refMin != null && refMax != null && refMax > refMin;
    final numVal = (value as num?)?.toDouble();
    final color = _statusColor(status);
    final recordedAt = vital['recorded_at'];

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(14, 12, 14, 10),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Container(
                width: 36, height: 36,
                decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(9)),
                child: Icon(_statusIcon(status), color: color, size: 18),
              ),
              const SizedBox(width: 10),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(_fmt(vitalKey), style: AppTextStyles.body2.copyWith(fontWeight: FontWeight.w600)),
                if (recordedAt != null)
                  Text(
                    _dateFmt.format(DateTime.parse(recordedAt.toString()).toLocal()),
                    style: AppTextStyles.caption.copyWith(fontSize: 10),
                  ),
              ])),
              Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.baseline,
                  textBaseline: TextBaseline.alphabetic,
                  children: [
                    Text(
                      value != null ? _fmtVal(value) : '—',
                      style: const TextStyle(fontFamily: 'Poppins', fontSize: 20, fontWeight: FontWeight.w700, color: AppColors.textPrimary),
                    ),
                    if (unit.isNotEmpty) ...[
                      const SizedBox(width: 3),
                      Text(unit, style: AppTextStyles.caption),
                    ],
                  ],
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                  decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(8)),
                  child: Text(
                    status.toUpperCase(),
                    style: TextStyle(fontFamily: 'Poppins', fontSize: 9, fontWeight: FontWeight.w700, color: color),
                  ),
                ),
              ]),
            ]),
            if (hasRange && numVal != null) ...[
              const SizedBox(height: 10),
              _MiniRangeBar(value: numVal, refMin: refMin, refMax: refMax, unit: unit, color: color),
            ],
          ]),
        ),
        ClipRRect(
          borderRadius: const BorderRadius.vertical(bottom: Radius.circular(14)),
          child: LinearProgressIndicator(
            value: 1, minHeight: 3,
            backgroundColor: color.withValues(alpha: 0.1),
            valueColor: AlwaysStoppedAnimation<Color>(color.withValues(alpha: 0.4)),
          ),
        ),
      ]),
    );
  }
}

// ─── Range Bar ────────────────────────────────────────────────────────────────

class _MiniRangeBar extends StatelessWidget {
  final double value;
  final double refMin;
  final double refMax;
  final String unit;
  final Color color;

  const _MiniRangeBar({
    required this.value, required this.refMin,
    required this.refMax, required this.unit, required this.color,
  });

  static String _n(double v) =>
      v == v.truncateToDouble() ? v.toInt().toString() : v.toStringAsFixed(1);

  @override
  Widget build(BuildContext context) {
    final span = refMax - refMin;
    final displayMin = (refMin - span * 0.2).clamp(0, double.infinity).toDouble();
    final displayMax = refMax + span * 0.2;
    final dRange = displayMax - displayMin;
    final normStart = (refMin - displayMin) / dRange;
    final normEnd = (refMax - displayMin) / dRange;
    final pos = ((value - displayMin) / dRange).clamp(0.0, 1.0);

    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
        Text('Min: ${_n(refMin)}', style: AppTextStyles.caption.copyWith(fontSize: 10)),
        Text('Ref: ${_n(refMin)} – ${_n(refMax)} $unit'.trim(),
          style: AppTextStyles.caption.copyWith(fontSize: 10, color: AppColors.success, fontWeight: FontWeight.w600)),
        Text('Max: ${_n(refMax)}', style: AppTextStyles.caption.copyWith(fontSize: 10)),
      ]),
      const SizedBox(height: 5),
      LayoutBuilder(builder: (_, c) {
        final w = c.maxWidth;
        return SizedBox(height: 20, child: Stack(clipBehavior: Clip.none, children: [
          Positioned(left: 0, right: 0, top: 7, bottom: 7,
            child: Container(decoration: BoxDecoration(color: AppColors.surfaceVariant, borderRadius: BorderRadius.circular(4)))),
          Positioned(left: normStart * w, width: (normEnd - normStart) * w, top: 7, bottom: 7,
            child: Container(decoration: BoxDecoration(color: AppColors.success.withValues(alpha: 0.25), borderRadius: BorderRadius.circular(4)))),
          Positioned(left: (pos * w - 5).clamp(0, w - 10), top: 2,
            child: Container(
              width: 10, height: 16,
              decoration: BoxDecoration(
                color: color, borderRadius: BorderRadius.circular(3),
                boxShadow: [BoxShadow(color: color.withValues(alpha: 0.45), blurRadius: 4, offset: const Offset(0, 1))],
              ),
            )),
        ]));
      }),
    ]);
  }
}
