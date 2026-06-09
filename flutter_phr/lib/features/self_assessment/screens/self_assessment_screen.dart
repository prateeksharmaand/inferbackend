import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import '../../../core/cubits/self_assessment_cubit.dart';
import '../../../core/models/assessment_model.dart';
import '../../../core/theme/app_theme.dart';

// ── Category / subcategory data ───────────────────────────────────────────────

class _Category {
  final String id;
  final String title;
  final String subtitle;
  final IconData icon;
  final Color color;
  final List<String> subcategories;
  const _Category({
    required this.id,
    required this.title,
    required this.subtitle,
    required this.icon,
    required this.color,
    required this.subcategories,
  });
}

const _kCategories = [
  _Category(
    id: 'lifestyle',
    title: 'Lifestyle & Chronic Diseases',
    subtitle: 'Exercise, diet, sleep & habits',
    icon: Icons.self_improvement_rounded,
    color: Color(0xFF7B6EF6),
    subcategories: [
      'Exercise & Physical Activity',
      'Diet & Nutrition',
      'Sleep Quality',
      'Stress Management',
      'Smoking & Tobacco Use',
      'Alcohol & Substance Use',
      'Obesity & Weight Management',
    ],
  ),
  _Category(
    id: 'general',
    title: 'General Health Problems',
    subtitle: 'Common symptoms & conditions',
    icon: Icons.health_and_safety_rounded,
    color: Color(0xFF00BFA5),
    subcategories: [
      'Fatigue & Low Energy',
      'Headaches',
      'Fever & Infections',
      'Allergies & Sensitivities',
      'Chronic Pain',
      'Dizziness & Fainting',
    ],
  ),
  _Category(
    id: 'male_reproductive',
    title: 'Male Sex & Reproductive Health',
    subtitle: 'Prostate, hormones & fertility',
    icon: Icons.male_rounded,
    color: Color(0xFF1E88E5),
    subcategories: [
      'Erectile Dysfunction',
      'Prostate Health',
      'Testosterone & Hormones',
      'Male Infertility',
      'Testicular Health',
      'STI Screening (Male)',
    ],
  ),
  _Category(
    id: 'skin_hair',
    title: 'Skin & Hair',
    subtitle: 'Acne, hair loss & skin conditions',
    icon: Icons.face_retouching_natural_rounded,
    color: Color(0xFFA29BFE),
    subcategories: [
      'Acne & Pimples',
      'Hair Loss & Alopecia',
      'Eczema & Dermatitis',
      'Psoriasis',
      'Rashes & Allergic Reactions',
      'Nail Problems',
      'Skin Pigmentation Issues',
    ],
  ),
  _Category(
    id: 'digestive',
    title: 'Digestive & Bowel Health',
    subtitle: 'Gut, stomach & digestion',
    icon: Icons.lunch_dining_rounded,
    color: Color(0xFF6C5CE7),
    subcategories: [
      'Acid Reflux & GERD',
      'Irritable Bowel Syndrome (IBS)',
      'Constipation',
      'Diarrhea & Loose Stools',
      'Bloating & Gas',
      'Peptic Ulcers',
      'Inflammatory Bowel Disease',
    ],
  ),
  _Category(
    id: 'eye',
    title: 'Eye Problems',
    subtitle: 'Vision, dryness & infections',
    icon: Icons.visibility_rounded,
    color: Color(0xFF00ACC1),
    subcategories: [
      'Vision Problems',
      'Dry & Irritated Eyes',
      'Eye Infections',
      'Glaucoma Risk',
      'Cataract Symptoms',
      'Diabetic Eye Disease',
    ],
  ),
  _Category(
    id: 'kidney_liver',
    title: 'Kidney & Liver Health',
    subtitle: 'Kidney stones, liver & gallbladder',
    icon: Icons.water_drop_rounded,
    color: Color(0xFF5A4BD1),
    subcategories: [
      'Kidney Stones',
      'Chronic Kidney Disease Risk',
      'Liver Function & Health',
      'Hepatitis',
      'Gallstones & Gallbladder',
      'Fatty Liver Disease',
    ],
  ),
  _Category(
    id: 'infectious',
    title: 'Infectious Diseases',
    subtitle: 'Viral, bacterial & fungal infections',
    icon: Icons.coronavirus_rounded,
    color: Color(0xFF26A69A),
    subcategories: [
      'Common Cold & Influenza',
      'Urinary Tract Infection',
      'Respiratory Infections',
      'Skin Infections',
      'Vector-borne Diseases',
      'Foodborne Illness',
    ],
  ),
  _Category(
    id: 'diabetes_comp',
    title: 'Diabetes Complications',
    subtitle: 'Foot, eyes, kidneys & nerves',
    icon: Icons.medication_liquid_rounded,
    color: Color(0xFF9C8FFA),
    subcategories: [
      'Diabetic Foot Complications',
      'Diabetic Neuropathy',
      'Diabetic Retinopathy',
      'Diabetic Nephropathy',
      'Cardiovascular Risk in Diabetes',
      'Hypoglycemia Episodes',
    ],
  ),
  _Category(
    id: 'bone',
    title: 'Bone Health',
    subtitle: 'Joints, spine & bone density',
    icon: Icons.accessibility_new_rounded,
    color: Color(0xFF7B6EF6),
    subcategories: [
      'Osteoporosis Risk',
      'Joint Pain & Arthritis',
      'Back & Spine Pain',
      'Fracture Risk Assessment',
      'Vitamin D Deficiency',
      'Gout',
    ],
  ),
  _Category(
    id: 'female_reproductive',
    title: 'Female Sexual & Reproductive Health',
    subtitle: 'Menstrual, PCOS & fertility',
    icon: Icons.female_rounded,
    color: Color(0xFFEC407A),
    subcategories: [
      'Menstrual Irregularities',
      'PCOS (Polycystic Ovary Syndrome)',
      'Menopause Symptoms',
      'Fertility & Conception',
      'Cervical & Ovarian Health',
      'STI Screening (Female)',
      'Pregnancy Concerns',
    ],
  ),
  _Category(
    id: 'mental',
    title: 'Mental & Neurological Health',
    subtitle: 'Depression, anxiety & cognition',
    icon: Icons.psychology_rounded,
    color: Color(0xFF8B5CF6),
    subcategories: [
      'Depression Screening',
      'Anxiety Disorders',
      'ADHD Assessment',
      'Memory & Cognitive Issues',
      'Sleep Disorders',
      'Epilepsy & Seizures',
      'Stress & Burnout',
    ],
  ),
  _Category(
    id: 'ent',
    title: 'Ear, Nose & Throat',
    subtitle: 'Hearing, sinuses & throat',
    icon: Icons.hearing_rounded,
    color: Color(0xFF1E88E5),
    subcategories: [
      'Hearing Loss',
      'Chronic Sinusitis',
      'Tonsillitis',
      'Snoring & Sleep Apnea',
      'Vertigo & Balance Issues',
      'Nosebleeds',
      'Voice & Throat Problems',
    ],
  ),
  _Category(
    id: 'oral',
    title: 'Oral Health',
    subtitle: 'Teeth, gums & mouth',
    icon: Icons.sentiment_satisfied_alt_rounded,
    color: Color(0xFF00BFA5),
    subcategories: [
      'Tooth Decay & Cavities',
      'Gum Disease & Periodontitis',
      'Bad Breath (Halitosis)',
      'Teeth Sensitivity',
      'TMJ Disorders',
      'Mouth Ulcers & Sores',
    ],
  ),
  _Category(
    id: 'hormonal',
    title: 'Hormonal Problems',
    subtitle: 'Thyroid, adrenal & hormones',
    icon: Icons.biotech_rounded,
    color: Color(0xFF6C5CE7),
    subcategories: [
      'Thyroid Disorders',
      'Adrenal Health',
      'Insulin Resistance',
      'Cortisol Imbalance',
      'Growth Hormone Issues',
      'Parathyroid Problems',
    ],
  ),
];

// ── Screen ────────────────────────────────────────────────────────────────────

class SelfAssessmentScreen extends StatelessWidget {
  const SelfAssessmentScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<SelfAssessmentCubit, SAState>(
      builder: (context, state) {
        return PopScope(
          canPop: state is SACategories,
          onPopInvokedWithResult: (didPop, _) {
            if (didPop) return;
            final cubit = context.read<SelfAssessmentCubit>();
            if (state is SAQuestionnaire) {
              cubit.prevQuestion();
            } else if (state is SAResult || state is SAError) {
              cubit.reset();
            }
          },
          child: Scaffold(
            backgroundColor: AppColors.background,
            appBar: _appBar(context, state),
            body: AnimatedSwitcher(
              duration: const Duration(milliseconds: 280),
              transitionBuilder: (child, anim) => FadeTransition(
                opacity: anim,
                child: SlideTransition(
                  position: Tween<Offset>(
                    begin: const Offset(0.04, 0),
                    end: Offset.zero,
                  ).animate(CurvedAnimation(parent: anim, curve: Curves.easeOut)),
                  child: child,
                ),
              ),
              child: KeyedSubtree(
                key: ValueKey(state.runtimeType),
                child: switch (state) {
                  SACategories()       => _CategoriesView(),
                  SALoadingQuestions() => _LoadingView(
                      label: 'Generating personalized questions…',
                      category: state.category,
                      subcategory: state.subcategory,
                    ),
                  SAQuestionnaire()    => _QuestionnaireView(state: state),
                  SALoadingResult()    => _LoadingView(
                      label: 'Analyzing your responses…',
                      category: state.category,
                      subcategory: state.subcategory,
                    ),
                  SAResult()           => _ResultView(state: state),
                  SAError()            => _ErrorView(message: state.message),
                },
              ),
            ),
          ),
        );
      },
    );
  }

  PreferredSizeWidget _appBar(BuildContext context, SAState state) {
    String title = 'Self Assessment';
    if (state is SAQuestionnaire) {
      title = 'Question ${state.currentIndex + 1} of ${state.questions.length}';
    } else if (state is SAResult) {
      title = 'Your Results';
    }

    return AppBar(
      backgroundColor: AppColors.background,
      elevation: 0,
      leading: IconButton(
        icon: const Icon(Icons.arrow_back_ios_rounded, size: 20, color: AppColors.textPrimary),
        onPressed: () {
          final cubit = context.read<SelfAssessmentCubit>();
          final s = context.read<SelfAssessmentCubit>().state;
          if (s is SACategories) {
            context.pop();
          } else if (s is SAQuestionnaire) {
            cubit.prevQuestion();
          } else if (s is SAResult || s is SAError) {
            cubit.reset();
          } else if (s is SALoadingQuestions || s is SALoadingResult) {
            // block navigation during loading
          }
        },
      ),
      title: Text(title, style: AppTextStyles.h5),
      centerTitle: false,
    );
  }
}

// ── Categories view ───────────────────────────────────────────────────────────

class _CategoriesView extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return CustomScrollView(
      slivers: [
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 16),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text(
                'Choose a health category',
                style: AppTextStyles.h4,
              ),
              const SizedBox(height: 4),
              Text(
                'Select a topic and answer a few AI-generated questions to get your personalised health risk assessment.',
                style: AppTextStyles.body2.copyWith(color: AppColors.textSecondary, height: 1.5),
              ),
            ]),
          ),
        ),
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
          sliver: SliverGrid(
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2,
              mainAxisSpacing: 12,
              crossAxisSpacing: 12,
              childAspectRatio: 1.05,
            ),
            delegate: SliverChildBuilderDelegate(
              (context, i) => _CategoryCard(cat: _kCategories[i]),
              childCount: _kCategories.length,
            ),
          ),
        ),
      ],
    );
  }
}

class _CategoryCard extends StatelessWidget {
  final _Category cat;
  const _CategoryCard({required this.cat});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => _showSubcategories(context, cat),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(18),
          boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 10, offset: const Offset(0, 3))],
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Container(
            width: 44, height: 44,
            decoration: BoxDecoration(
              color: cat.color.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(cat.icon, color: cat.color, size: 22),
          ),
          const SizedBox(height: 10),
          Expanded(
            child: Text(
              cat.title,
              style: AppTextStyles.body2.copyWith(fontWeight: FontWeight.w600, height: 1.35),
              maxLines: 3,
              overflow: TextOverflow.ellipsis,
            ),
          ),
          const SizedBox(height: 4),
          Row(children: [
            Text(
              '${cat.subcategories.length} topics',
              style: AppTextStyles.caption.copyWith(color: cat.color, fontWeight: FontWeight.w500),
            ),
            const Spacer(),
            Icon(Icons.chevron_right_rounded, size: 16, color: cat.color),
          ]),
        ]),
      ),
    );
  }

  void _showSubcategories(BuildContext context, _Category cat) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _SubcategorySheet(cat: cat, parentContext: context),
    );
  }
}

// ── Subcategory bottom sheet ───────────────────────────────────────────────────

class _SubcategorySheet extends StatefulWidget {
  final _Category cat;
  final BuildContext parentContext;
  const _SubcategorySheet({required this.cat, required this.parentContext});

  @override
  State<_SubcategorySheet> createState() => _SubcategorySheetState();
}

class _SubcategorySheetState extends State<_SubcategorySheet> {
  final _searchCtrl = TextEditingController();
  String _query = '';

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  List<String> get _filtered {
    if (_query.isEmpty) return widget.cat.subcategories;
    final q = _query.toLowerCase();
    return widget.cat.subcategories.where((s) => s.toLowerCase().contains(q)).toList();
  }

  @override
  Widget build(BuildContext context) {
    final filtered = _filtered;
    return Container(
      decoration: const BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        const SizedBox(height: 12),
        Container(width: 40, height: 4, decoration: BoxDecoration(color: AppColors.border, borderRadius: BorderRadius.circular(2))),
        const SizedBox(height: 16),
        // Header
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20),
          child: Row(children: [
            Container(
              width: 44, height: 44,
              decoration: BoxDecoration(color: widget.cat.color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(12)),
              child: Icon(widget.cat.icon, color: widget.cat.color, size: 22),
            ),
            const SizedBox(width: 12),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(widget.cat.title, style: AppTextStyles.h5, maxLines: 2, overflow: TextOverflow.ellipsis),
              Text('${widget.cat.subcategories.length} topics', style: AppTextStyles.caption.copyWith(color: AppColors.textSecondary)),
            ])),
          ]),
        ),
        const SizedBox(height: 14),
        // Search field
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: TextField(
            controller: _searchCtrl,
            autofocus: false,
            textInputAction: TextInputAction.search,
            style: AppTextStyles.body2.copyWith(color: AppColors.textPrimary),
            onChanged: (v) => setState(() => _query = v),
            decoration: InputDecoration(
              hintText: 'Search topics…',
              prefixIcon: Icon(Icons.search_rounded, size: 20, color: widget.cat.color),
              suffixIcon: _query.isNotEmpty
                  ? GestureDetector(
                      onTap: () {
                        _searchCtrl.clear();
                        setState(() => _query = '');
                      },
                      child: const Icon(Icons.close_rounded, size: 18, color: AppColors.textHint),
                    )
                  : null,
              filled: true,
              fillColor: AppColors.surfaceVariant,
              contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 11),
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
              enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: BorderSide(color: widget.cat.color, width: 1.5),
              ),
            ),
          ),
        ),
        const SizedBox(height: 10),
        const Divider(height: 1),
        ConstrainedBox(
          constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.48),
          child: filtered.isEmpty
              ? Padding(
                  padding: const EdgeInsets.symmetric(vertical: 36),
                  child: Column(mainAxisSize: MainAxisSize.min, children: [
                    Icon(Icons.search_off_rounded, size: 40, color: AppColors.textHint.withValues(alpha: 0.5)),
                    const SizedBox(height: 10),
                    Text('No topics match "$_query"',
                        style: AppTextStyles.body2.copyWith(color: AppColors.textHint)),
                  ]),
                )
              : ListView.separated(
                  shrinkWrap: true,
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  itemCount: filtered.length,
                  separatorBuilder: (_, __) => const Divider(height: 1, indent: 56),
                  itemBuilder: (ctx, i) {
                    final sub = filtered[i];
                    return ListTile(
                      leading: Container(
                        width: 36, height: 36,
                        decoration: BoxDecoration(
                          color: widget.cat.color.withValues(alpha: 0.08),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Icon(widget.cat.icon, color: widget.cat.color, size: 18),
                      ),
                      title: _HighlightedText(text: sub, query: _query, color: widget.cat.color),
                      trailing: Icon(Icons.arrow_forward_ios_rounded, size: 14, color: widget.cat.color),
                      onTap: () {
                        Navigator.of(context).pop();
                        widget.parentContext.read<SelfAssessmentCubit>().startAssessment(widget.cat.title, sub);
                      },
              );
            },
          ),
        ),
        SizedBox(height: MediaQuery.of(context).viewInsets.bottom + 16),
      ]),
    );
  }
}

// ── Highlighted search text ───────────────────────────────────────────────────

class _HighlightedText extends StatelessWidget {
  final String text;
  final String query;
  final Color color;
  const _HighlightedText({required this.text, required this.query, required this.color});

  @override
  Widget build(BuildContext context) {
    if (query.isEmpty) {
      return Text(text, style: AppTextStyles.body2.copyWith(fontWeight: FontWeight.w500));
    }
    final lower = text.toLowerCase();
    final q = query.toLowerCase();
    final start = lower.indexOf(q);
    if (start == -1) {
      return Text(text, style: AppTextStyles.body2.copyWith(fontWeight: FontWeight.w500));
    }
    final end = start + q.length;
    return RichText(
      text: TextSpan(
        style: AppTextStyles.body2.copyWith(fontWeight: FontWeight.w500, color: AppColors.textPrimary),
        children: [
          if (start > 0) TextSpan(text: text.substring(0, start)),
          TextSpan(
            text: text.substring(start, end),
            style: TextStyle(
              fontFamily: 'Poppins',
              fontSize: 13,
              fontWeight: FontWeight.w700,
              color: color,
              backgroundColor: color.withValues(alpha: 0.1),
            ),
          ),
          if (end < text.length) TextSpan(text: text.substring(end)),
        ],
      ),
    );
  }
}

// ── Loading view ──────────────────────────────────────────────────────────────

class _LoadingView extends StatefulWidget {
  final String label;
  final String category;
  final String subcategory;
  const _LoadingView({required this.label, required this.category, required this.subcategory});

  @override
  State<_LoadingView> createState() => _LoadingViewState();
}

class _LoadingViewState extends State<_LoadingView> with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;
  late final Animation<double> _pulse;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 1200))..repeat(reverse: true);
    _pulse = Tween<double>(begin: 0.8, end: 1.1).animate(CurvedAnimation(parent: _ctrl, curve: Curves.easeInOut));
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(40),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          ScaleTransition(
            scale: _pulse,
            child: Container(
              width: 80, height: 80,
              decoration: BoxDecoration(
                gradient: const LinearGradient(colors: AppColors.aiGradient, begin: Alignment.topLeft, end: Alignment.bottomRight),
                shape: BoxShape.circle,
                boxShadow: [BoxShadow(color: AppColors.primary.withValues(alpha: 0.3), blurRadius: 20, spreadRadius: 4)],
              ),
              child: const Icon(Icons.auto_awesome, color: Colors.white, size: 36),
            ),
          ),
          const SizedBox(height: 28),
          Text(widget.label, style: AppTextStyles.h4, textAlign: TextAlign.center),
          const SizedBox(height: 10),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
            decoration: BoxDecoration(
              color: AppColors.primaryLight,
              borderRadius: BorderRadius.circular(20),
            ),
            child: Text(widget.subcategory, style: TextStyle(fontFamily: 'Poppins', fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.primary)),
          ),
          const SizedBox(height: 6),
          Text(widget.category, style: AppTextStyles.caption.copyWith(color: AppColors.textSecondary)),
          const SizedBox(height: 32),
          const SizedBox(
            width: 36, height: 36,
            child: CircularProgressIndicator(strokeWidth: 3, color: AppColors.primary),
          ),
        ]),
      ),
    );
  }
}

// ── Questionnaire view ────────────────────────────────────────────────────────

class _QuestionnaireView extends StatelessWidget {
  final SAQuestionnaire state;
  const _QuestionnaireView({required this.state});

  @override
  Widget build(BuildContext context) {
    final q = state.current;
    final progress = (state.currentIndex + 1) / state.questions.length;

    return Column(children: [
      // Progress header
      Container(
        color: AppColors.surface,
        padding: const EdgeInsets.fromLTRB(20, 6, 20, 14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Expanded(child: Text(state.subcategory, style: AppTextStyles.label.copyWith(color: AppColors.textSecondary), overflow: TextOverflow.ellipsis)),
            Text('${state.currentIndex + 1} / ${state.questions.length}', style: AppTextStyles.caption.copyWith(color: AppColors.primary, fontWeight: FontWeight.w600)),
          ]),
          const SizedBox(height: 8),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: progress,
              minHeight: 5,
              backgroundColor: AppColors.border,
              valueColor: const AlwaysStoppedAnimation(AppColors.primary),
            ),
          ),
        ]),
      ),
      // Question + options
      Expanded(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            // Question type badge
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: q.isMultiple ? AppColors.primaryLight : const Color(0xFFE8F5E9),
                borderRadius: BorderRadius.circular(20),
              ),
              child: Text(
                q.isMultiple ? 'Select all that apply' : 'Select one option',
                style: TextStyle(fontFamily: 'Poppins', fontSize: 11, fontWeight: FontWeight.w600,
                    color: q.isMultiple ? AppColors.primary : AppColors.success),
              ),
            ),
            const SizedBox(height: 14),
            Text(q.text, style: AppTextStyles.h4.copyWith(height: 1.45)),
            const SizedBox(height: 20),
            ...q.options.map((opt) => _OptionTile(
              option: opt,
              question: q,
              state: state,
            )),
            const SizedBox(height: 12),
          ]),
        ),
      ),
      // Bottom nav
      Container(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
        decoration: BoxDecoration(
          color: AppColors.surface,
          boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.06), blurRadius: 12, offset: const Offset(0, -3))],
        ),
        child: Row(children: [
          if (state.currentIndex > 0)
            OutlinedButton.icon(
              onPressed: () => context.read<SelfAssessmentCubit>().prevQuestion(),
              icon: const Icon(Icons.arrow_back_ios_rounded, size: 14),
              label: const Text('Back'),
              style: OutlinedButton.styleFrom(
                foregroundColor: AppColors.textSecondary,
                side: const BorderSide(color: AppColors.border),
                padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 13),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                textStyle: const TextStyle(fontFamily: 'Poppins', fontSize: 14, fontWeight: FontWeight.w600),
              ),
            ),
          if (state.currentIndex > 0) const SizedBox(width: 12),
          Expanded(
            child: BlocBuilder<SelfAssessmentCubit, SAState>(
              builder: (context, s) {
                final qs = s is SAQuestionnaire ? s : state;
                final canContinue = qs.hasAnswer;
                return ElevatedButton(
                  onPressed: canContinue ? () {
                    final cubit = context.read<SelfAssessmentCubit>();
                    if (qs.isLast) {
                      cubit.submitAnswers();
                    } else {
                      cubit.nextQuestion();
                    }
                  } : null,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    foregroundColor: Colors.white,
                    disabledBackgroundColor: AppColors.border,
                    disabledForegroundColor: AppColors.textHint,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                    textStyle: const TextStyle(fontFamily: 'Poppins', fontSize: 14, fontWeight: FontWeight.w600),
                  ),
                  child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                    Text(qs.isLast ? 'Submit & Get Results' : 'Continue'),
                    const SizedBox(width: 6),
                    Icon(qs.isLast ? Icons.check_rounded : Icons.arrow_forward_ios_rounded, size: 15),
                  ]),
                );
              },
            ),
          ),
        ]),
      ),
    ]);
  }
}

class _OptionTile extends StatelessWidget {
  final String option;
  final AssessmentQuestion question;
  final SAQuestionnaire state;
  const _OptionTile({required this.option, required this.question, required this.state});

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<SelfAssessmentCubit, SAState>(
      builder: (context, s) {
        final qs = s is SAQuestionnaire ? s : state;
        final bool selected;
        if (question.isMultiple) {
          final list = qs.answers[question.id];
          selected = list is List && list.contains(option);
        } else {
          selected = qs.answers[question.id] == option;
        }

        return GestureDetector(
          onTap: () {
            final cubit = context.read<SelfAssessmentCubit>();
            if (question.isMultiple) {
              cubit.answerMultiple(question.id, option, !selected);
            } else {
              cubit.answerSingle(question.id, option);
            }
          },
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 160),
            margin: const EdgeInsets.only(bottom: 10),
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            decoration: BoxDecoration(
              color: selected ? AppColors.primaryLight : AppColors.surface,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(
                color: selected ? AppColors.primary : AppColors.border,
                width: selected ? 1.8 : 1.2,
              ),
              boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.03), blurRadius: 6, offset: const Offset(0, 2))],
            ),
            child: Row(children: [
              AnimatedContainer(
                duration: const Duration(milliseconds: 160),
                width: 22, height: 22,
                decoration: BoxDecoration(
                  shape: question.isMultiple ? BoxShape.rectangle : BoxShape.circle,
                  borderRadius: question.isMultiple ? BorderRadius.circular(5) : null,
                  color: selected ? AppColors.primary : Colors.transparent,
                  border: Border.all(
                    color: selected ? AppColors.primary : AppColors.textHint,
                    width: 1.8,
                  ),
                ),
                child: selected ? Icon(
                  question.isMultiple ? Icons.check_rounded : Icons.circle,
                  color: Colors.white,
                  size: question.isMultiple ? 15 : 10,
                ) : null,
              ),
              const SizedBox(width: 12),
              Expanded(child: Text(
                option,
                style: AppTextStyles.body2.copyWith(
                  fontWeight: selected ? FontWeight.w600 : FontWeight.w400,
                  color: selected ? AppColors.primary : AppColors.textPrimary,
                ),
              )),
            ]),
          ),
        );
      },
    );
  }
}

// ── Result view ───────────────────────────────────────────────────────────────

class _ResultView extends StatelessWidget {
  final SAResult state;
  const _ResultView({required this.state});

  @override
  Widget build(BuildContext context) {
    final r = state.result;
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        // Risk level banner
        Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            color: r.levelBgColor,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: r.levelColor.withValues(alpha: 0.3), width: 1.5),
          ),
          child: Row(children: [
            Container(
              width: 56, height: 56,
              decoration: BoxDecoration(
                color: r.levelColor.withValues(alpha: 0.15),
                shape: BoxShape.circle,
              ),
              child: Icon(r.levelIcon, color: r.levelColor, size: 28),
            ),
            const SizedBox(width: 14),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(r.levelLabel, style: TextStyle(fontFamily: 'Poppins', fontSize: 18, fontWeight: FontWeight.w700, color: r.levelColor)),
              Text(state.subcategory, style: AppTextStyles.body2.copyWith(color: AppColors.textSecondary)),
            ])),
            // Score circle
            Stack(alignment: Alignment.center, children: [
              SizedBox(
                width: 60, height: 60,
                child: CircularProgressIndicator(
                  value: r.riskScore / 100,
                  strokeWidth: 5.5,
                  backgroundColor: r.levelColor.withValues(alpha: 0.15),
                  valueColor: AlwaysStoppedAnimation(r.levelColor),
                ),
              ),
              Text('${r.riskScore}', style: TextStyle(fontFamily: 'Poppins', fontSize: 17, fontWeight: FontWeight.w700, color: r.levelColor)),
            ]),
          ]),
        ),
        const SizedBox(height: 16),
        // Summary
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(16),
            boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 8, offset: const Offset(0, 2))],
          ),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Container(
                width: 30, height: 30,
                decoration: BoxDecoration(color: AppColors.primaryLight, borderRadius: BorderRadius.circular(8)),
                child: const Icon(Icons.summarize_rounded, color: AppColors.primary, size: 16),
              ),
              const SizedBox(width: 10),
              const Text('Summary', style: AppTextStyles.h5),
            ]),
            const SizedBox(height: 10),
            Text(r.summary, style: AppTextStyles.body2.copyWith(height: 1.65, color: AppColors.textSecondary)),
          ]),
        ),
        const SizedBox(height: 12),
        // Findings
        if (r.findings.isNotEmpty) _Section(
          icon: Icons.search_rounded,
          title: 'Key Findings',
          color: AppColors.info,
          items: r.findings,
          bulletIcon: Icons.arrow_right_rounded,
        ),
        // Recommendations
        if (r.recommendations.isNotEmpty) _Section(
          icon: Icons.tips_and_updates_rounded,
          title: 'Recommendations',
          color: AppColors.success,
          items: r.recommendations,
          bulletIcon: Icons.check_circle_outline_rounded,
        ),
        // Warning signs
        if (r.warningSigns.isNotEmpty) _Section(
          icon: Icons.warning_amber_rounded,
          title: 'Warning Signs to Watch For',
          color: const Color(0xFFD97706),
          items: r.warningSigns,
          bulletIcon: Icons.error_outline_rounded,
        ),
        // When to see doctor
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: AppColors.primary.withValues(alpha: 0.2)),
            boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 8, offset: const Offset(0, 2))],
          ),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Container(
              width: 36, height: 36,
              decoration: BoxDecoration(color: AppColors.primaryLight, borderRadius: BorderRadius.circular(10)),
              child: const Icon(Icons.local_hospital_rounded, color: AppColors.primary, size: 18),
            ),
            const SizedBox(width: 12),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('When to See a Doctor', style: AppTextStyles.h5),
              const SizedBox(height: 6),
              Text(r.whenToSeeDoctor, style: AppTextStyles.body2.copyWith(color: AppColors.textSecondary, height: 1.55)),
            ])),
          ]),
        ),
        const SizedBox(height: 20),
        // Disclaimer
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: AppColors.surfaceVariant,
            borderRadius: BorderRadius.circular(12),
          ),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Icon(Icons.info_outline_rounded, size: 15, color: AppColors.textHint),
            const SizedBox(width: 8),
            Expanded(child: Text(
              'This is not a medical diagnosis. Results are based on self-reported symptoms and are for informational purposes only. Always consult a qualified healthcare professional.',
              style: AppTextStyles.caption.copyWith(color: AppColors.textHint, height: 1.5),
            )),
          ]),
        ),
        const SizedBox(height: 24),
        // Actions
        SizedBox(
          width: double.infinity,
          child: ElevatedButton.icon(
            onPressed: () => context.read<SelfAssessmentCubit>().reset(),
            icon: const Icon(Icons.refresh_rounded, size: 18),
            label: const Text('Start New Assessment'),
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.primary,
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(vertical: 14),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
              textStyle: const TextStyle(fontFamily: 'Poppins', fontSize: 14, fontWeight: FontWeight.w600),
            ),
          ),
        ),
        const SizedBox(height: 10),
        SizedBox(
          width: double.infinity,
          child: OutlinedButton(
            onPressed: () => context.pop(),
            style: OutlinedButton.styleFrom(
              foregroundColor: AppColors.textSecondary,
              side: const BorderSide(color: AppColors.border),
              padding: const EdgeInsets.symmetric(vertical: 14),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
              textStyle: const TextStyle(fontFamily: 'Poppins', fontSize: 14, fontWeight: FontWeight.w600),
            ),
            child: const Text('Close'),
          ),
        ),
      ]),
    );
  }
}

class _Section extends StatelessWidget {
  final IconData icon;
  final String title;
  final Color color;
  final List<String> items;
  final IconData bulletIcon;
  const _Section({
    required this.icon,
    required this.title,
    required this.color,
    required this.items,
    required this.bulletIcon,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(16),
          boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 8, offset: const Offset(0, 2))],
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Container(
              width: 30, height: 30,
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Icon(icon, color: color, size: 16),
            ),
            const SizedBox(width: 10),
            Text(title, style: AppTextStyles.h5),
          ]),
          const SizedBox(height: 12),
          ...items.map((item) => Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Icon(bulletIcon, size: 18, color: color),
              const SizedBox(width: 8),
              Expanded(child: Text(item, style: AppTextStyles.body2.copyWith(color: AppColors.textSecondary, height: 1.5))),
            ]),
          )),
        ]),
      ),
    );
  }
}

// ── Error view ────────────────────────────────────────────────────────────────

class _ErrorView extends StatelessWidget {
  final String message;
  const _ErrorView({required this.message});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(36),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Container(
            width: 72, height: 72,
            decoration: BoxDecoration(color: AppColors.error.withValues(alpha: 0.1), shape: BoxShape.circle),
            child: const Icon(Icons.error_outline_rounded, size: 36, color: AppColors.error),
          ),
          const SizedBox(height: 20),
          const Text('Something went wrong', style: AppTextStyles.h4, textAlign: TextAlign.center),
          const SizedBox(height: 8),
          Text(message, style: AppTextStyles.body2.copyWith(color: AppColors.textSecondary, height: 1.5), textAlign: TextAlign.center),
          const SizedBox(height: 28),
          ElevatedButton.icon(
            onPressed: () => context.read<SelfAssessmentCubit>().retryFromError(),
            icon: const Icon(Icons.refresh_rounded, size: 18),
            label: const Text('Try Again'),
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.primary,
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 13),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
              textStyle: const TextStyle(fontFamily: 'Poppins', fontSize: 14, fontWeight: FontWeight.w600),
            ),
          ),
        ]),
      ),
    );
  }
}
