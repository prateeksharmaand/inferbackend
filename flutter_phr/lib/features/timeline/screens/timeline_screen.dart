import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import '../../../core/cubits/timeline_cubit.dart';
import '../../../core/models/document_model.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/shimmer_widgets.dart';

class TimelineScreen extends StatefulWidget {
  const TimelineScreen({super.key});
  @override
  State<TimelineScreen> createState() => _TimelineScreenState();
}

class _TimelineScreenState extends State<TimelineScreen> {
  String _filter = 'all';

  static const _filters = [
    ('all',      'All',        Icons.timeline_rounded),
    ('vital',    'Vitals',     Icons.favorite_rounded),
    ('document', 'Reports',    Icons.description_outlined),
    ('reminder', 'Reminders',  Icons.alarm_rounded),
    ('risk',     'Risk',       Icons.analytics_outlined),
    ('alert',    'Alerts',     Icons.warning_amber_rounded),
  ];

  @override
  void initState() {
    super.initState();
    Future.microtask(() => context.read<TimelineCubit>().loadTimeline());
  }

  List<TimelineEvent> _filtered(List<TimelineEvent> events) =>
      _filter == 'all' ? events : events.where((e) => e.eventType == _filter).toList();

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
        title: const Text('Health Timeline', style: AppTextStyles.h5),
        actions: [
          BlocBuilder<TimelineCubit, TimelineState>(
            builder: (context, state) => IconButton(
              icon: state.isLoading
                  ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.primary))
                  : const Icon(Icons.calendar_today_outlined, color: AppColors.primary, size: 20),
              onPressed: state.isLoading ? null : _pickDate,
            ),
          ),
        ],
      ),
      body: BlocBuilder<TimelineCubit, TimelineState>(
        builder: (context, state) => RefreshIndicator(
          color: AppColors.primary,
          onRefresh: () => context.read<TimelineCubit>().loadTimeline(),
          child: CustomScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            slivers: [
              SliverToBoxAdapter(child: _buildFilters()),
              if (state.isLoading)
                SliverPadding(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                  sliver: SliverList(delegate: SliverChildBuilderDelegate(
                    (_, i) => ShimmerTimelineTile(isLast: i == 5),
                    childCount: 6,
                  )),
                )
              else if (_filtered(state.events).isEmpty)
                SliverFillRemaining(hasScrollBody: false, child: _buildEmpty())
              else
                ..._buildGroupedSlivers(state.events),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildFilters() => SingleChildScrollView(
    scrollDirection: Axis.horizontal,
    padding: const EdgeInsets.fromLTRB(16, 10, 16, 6),
    child: Row(children: _filters.map((f) {
      final sel = _filter == f.$1;
      final color = _typeColor(f.$1);
      return Padding(
        padding: const EdgeInsets.only(right: 8),
        child: GestureDetector(
          onTap: () => setState(() => _filter = f.$1),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 180),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
            decoration: BoxDecoration(
              color: sel ? color : AppColors.surface,
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: sel ? color : AppColors.border, width: 1.5),
            ),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              Icon(f.$3, size: 13, color: sel ? Colors.white : color),
              const SizedBox(width: 5),
              Text(f.$2, style: TextStyle(
                fontFamily: 'Poppins', fontSize: 12, fontWeight: FontWeight.w600,
                color: sel ? Colors.white : AppColors.textSecondary,
              )),
            ]),
          ),
        ),
      );
    }).toList()),
  );

  List<Widget> _buildGroupedSlivers(List<TimelineEvent> all) {
    final filtered = _filtered(all);
    final groups = <String, List<TimelineEvent>>{};
    for (final e in filtered) {
      groups.putIfAbsent(_dateLabel(e.eventDate), () => []).add(e);
    }
    return groups.entries.map((entry) => SliverMainAxisGroup(slivers: [
      SliverToBoxAdapter(child: _DateHeader(label: entry.key)),
      SliverPadding(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        sliver: SliverList(delegate: SliverChildBuilderDelegate(
          (_, i) => _EventTile(event: entry.value[i], isLast: i == entry.value.length - 1),
          childCount: entry.value.length,
        )),
      ),
    ])).toList();
  }

  String _dateLabel(DateTime d) {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final day = DateTime(d.year, d.month, d.day);
    if (day == today) return 'Today';
    if (day == today.subtract(const Duration(days: 1))) return 'Yesterday';
    if (today.difference(day).inDays < 7) {
      const wd = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      return wd[d.weekday - 1];
    }
    const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return '${d.day} ${m[d.month - 1]} ${d.year}';
  }

  Future<void> _pickDate() async {
    final date = await showDatePicker(
      context: context, initialDate: DateTime.now(),
      firstDate: DateTime(2020), lastDate: DateTime.now(),
    );
    if (date != null && mounted) {
      context.read<TimelineCubit>().loadTimeline(
        from: DateTime(date.year, date.month, 1),
        to: DateTime(date.year, date.month + 1, 0),
      );
    }
  }

  Widget _buildEmpty() => Center(
    child: Padding(
      padding: const EdgeInsets.all(36),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Container(
          width: 80, height: 80,
          decoration: const BoxDecoration(color: AppColors.primaryLight, shape: BoxShape.circle),
          child: const Icon(Icons.timeline_rounded, size: 40, color: AppColors.primary),
        ),
        const SizedBox(height: 20),
        const Text('Nothing here yet', style: AppTextStyles.h4, textAlign: TextAlign.center),
        const SizedBox(height: 8),
        Text(
          _filter == 'all'
              ? 'Your health events — vitals, reports, reminders and risk assessments — appear here automatically.'
              : 'No ${_filters.firstWhere((f) => f.$1 == _filter).$2.toLowerCase()} events found.',
          style: AppTextStyles.body2.copyWith(height: 1.6),
          textAlign: TextAlign.center,
        ),
      ]),
    ),
  );

  static Color _typeColor(String type) {
    switch (type) {
      case 'vital':    return AppColors.primary;
      case 'document': return AppColors.info;
      case 'reminder': return AppColors.warning;
      case 'alert':    return AppColors.error;
      case 'risk':     return const Color(0xFF7C3AED);
      case 'account':  return AppColors.success;
      default:         return AppColors.textSecondary;
    }
  }
}

// ── Date header ───────────────────────────────────────────────────────────────

class _DateHeader extends StatelessWidget {
  final String label;
  const _DateHeader({required this.label});

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(16, 16, 16, 6),
    child: Row(children: [
      Text(label, style: AppTextStyles.label.copyWith(color: AppColors.textSecondary, letterSpacing: 0.6)),
      const SizedBox(width: 10),
      const Expanded(child: Divider(height: 1, color: AppColors.border)),
    ]),
  );
}

// ── Event tile ────────────────────────────────────────────────────────────────

class _EventTile extends StatelessWidget {
  final TimelineEvent event;
  final bool isLast;
  const _EventTile({required this.event, required this.isLast});

  @override
  Widget build(BuildContext context) {
    final color = _color(event.eventType);
    return IntrinsicHeight(
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        // Left connector column
        Column(children: [
          Container(
            width: 38, height: 38,
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.12),
              shape: BoxShape.circle,
              border: Border.all(color: color.withValues(alpha: 0.35), width: 1.5),
            ),
            child: Icon(_icon(event.eventType), color: color, size: 17),
          ),
          if (!isLast) Expanded(child: Container(
            width: 1.5, margin: const EdgeInsets.symmetric(vertical: 3),
            color: AppColors.border,
          )),
        ]),
        const SizedBox(width: 12),
        // Card
        Expanded(child: Padding(
          padding: EdgeInsets.only(bottom: isLast ? 8 : 14),
          child: Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: AppColors.surface,
              borderRadius: BorderRadius.circular(16),
              boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 8, offset: const Offset(0, 2))],
            ),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Expanded(child: Text(event.title, style: AppTextStyles.h5, maxLines: 2, overflow: TextOverflow.ellipsis)),
                const SizedBox(width: 8),
                Text(_timeStr(event.eventDate), style: AppTextStyles.caption.copyWith(color: AppColors.textHint)),
              ]),
              if (event.description != null && event.description!.isNotEmpty) ...[
                const SizedBox(height: 5),
                Text(event.description!, style: AppTextStyles.body2.copyWith(height: 1.5, color: AppColors.textSecondary)),
              ],
              if (event.data != null && event.data!.isNotEmpty) ...[
                const SizedBox(height: 8),
                Wrap(spacing: 6, runSpacing: 4, children: event.data!.entries
                    .where((e) => e.value != null && e.value.toString().isNotEmpty)
                    .take(4)
                    .map((e) => _DataChip(label: e.key, value: e.value.toString(), color: color))
                    .toList()),
              ],
              const SizedBox(height: 8),
              _TypeBadge(type: event.eventType, color: color),
            ]),
          ),
        )),
      ]),
    );
  }

  String _timeStr(DateTime d) {
    final h = d.hour.toString().padLeft(2, '0');
    final m = d.minute.toString().padLeft(2, '0');
    return '$h:$m';
  }

  Color _color(String type) => _TimelineScreenState._typeColor(type);

  IconData _icon(String type) {
    switch (type) {
      case 'vital':    return Icons.favorite_rounded;
      case 'document': return Icons.description_rounded;
      case 'reminder': return Icons.alarm_rounded;
      case 'alert':    return Icons.warning_amber_rounded;
      case 'risk':     return Icons.analytics_rounded;
      case 'account':  return Icons.person_rounded;
      default:         return Icons.event_note_rounded;
    }
  }
}

class _DataChip extends StatelessWidget {
  final String label;
  final String value;
  final Color color;
  const _DataChip({required this.label, required this.value, required this.color});

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
    decoration: BoxDecoration(
      color: color.withValues(alpha: 0.08),
      borderRadius: BorderRadius.circular(6),
      border: Border.all(color: color.withValues(alpha: 0.2)),
    ),
    child: Text('$label: $value',
        style: TextStyle(fontFamily: 'Poppins', fontSize: 10, fontWeight: FontWeight.w500, color: color)),
  );
}

class _TypeBadge extends StatelessWidget {
  final String type;
  final Color color;
  const _TypeBadge({required this.type, required this.color});

  String get _label {
    switch (type) {
      case 'vital':    return 'Vital';
      case 'document': return 'Report';
      case 'reminder': return 'Reminder';
      case 'alert':    return 'Alert';
      case 'risk':     return 'Risk Assessment';
      case 'account':  return 'Account';
      default:         return type;
    }
  }

  @override
  Widget build(BuildContext context) => Align(
    alignment: Alignment.centerLeft,
    child: Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(_label, style: TextStyle(
        fontFamily: 'Poppins', fontSize: 10, fontWeight: FontWeight.w600, color: color,
      )),
    ),
  );
}
