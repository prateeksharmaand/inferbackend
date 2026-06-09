import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../../core/cubits/health_sync_cubit.dart';
import '../../../core/cubits/vitals_cubit.dart';
import '../../../core/theme/app_theme.dart';

class HealthSyncSheet extends StatefulWidget {
  const HealthSyncSheet({super.key});

  static void show(BuildContext context) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => BlocProvider.value(
        value: context.read<HealthSyncCubit>(),
        child: BlocProvider.value(
          value: context.read<VitalsCubit>(),
          child: const HealthSyncSheet(),
        ),
      ),
    );
  }

  @override
  State<HealthSyncSheet> createState() => _HealthSyncSheetState();
}

class _HealthSyncSheetState extends State<HealthSyncSheet> {
  int _selectedDays = 7;

  String _formatTime(DateTime dt) {
    final now = DateTime.now();
    final diff = now.difference(dt);
    if (diff.inMinutes < 1) return 'Just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    return '${dt.day}/${dt.month} ${dt.hour}:${dt.minute.toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    return BlocConsumer<HealthSyncCubit, HealthSyncState>(
      listener: (context, state) {
        if (state.status == HealthSyncStatus.success) {
          // Refresh vitals after successful sync
          context.read<VitalsCubit>().loadLatestVitals();
          context.read<VitalsCubit>().loadVitals();
        }
      },
      builder: (context, state) {
        return Container(
          decoration: const BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
          ),
          padding: EdgeInsets.only(
            left: 24, right: 24, top: 8,
            bottom: MediaQuery.of(context).padding.bottom + 12,
          ),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            // drag handle
            Container(width: 40, height: 4, margin: const EdgeInsets.only(bottom: 10),
              decoration: BoxDecoration(color: AppColors.border, borderRadius: BorderRadius.circular(2))),

            // header
            Row(children: [
              Container(
                width: 38, height: 38,
                decoration: BoxDecoration(
                  gradient: const LinearGradient(colors: AppColors.primaryGradient),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(Icons.sync_rounded, color: Colors.white, size: 20),
              ),
              const SizedBox(width: 12),
              const Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('Health Connect Sync', style: AppTextStyles.h4),
                Text('Import vitals from your health apps', style: AppTextStyles.caption),
              ])),
            ]),

            const SizedBox(height: 8),
            if (state.lastSyncedAt != null)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(color: AppColors.successLight, borderRadius: BorderRadius.circular(10)),
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  const Icon(Icons.check_circle_outline, color: AppColors.success, size: 14),
                  const SizedBox(width: 6),
                  Text(
                    'Last synced: ${_formatTime(state.lastSyncedAt!)}',
                    style: const TextStyle(fontFamily: 'Poppins', fontSize: 11, color: AppColors.success, fontWeight: FontWeight.w500),
                  ),
                ]),
              ),

            const SizedBox(height: 10),

            // how it works — shown only before first sync
            if (state.lastSyncedAt == null) ...[
              _buildHowItWorks(),
              const SizedBox(height: 10),
            ],

            // data types grid
            _buildDataTypesGrid(),

            const SizedBox(height: 10),

            // days selector
            _buildDaysSelector(state),

            const SizedBox(height: 10),

            // status / progress
            if (state.status != HealthSyncStatus.idle) ...[
              _buildStatus(state),
              const SizedBox(height: 8),
            ],

            // action button
            _buildActionButton(context, state),
          ]),
        );
      },
    );
  }

  Widget _buildHowItWorks() {
    const steps = [
      (Icons.download_rounded, 'Install Health Connect', 'Get it free from the Play Store if not already installed.'),
      (Icons.settings_rounded, 'Enable Samsung Health sync', 'Samsung Health → Settings → Connected services → Health Connect → turn on data types.'),
      (Icons.sync_rounded, 'Tap Sync Now', 'Your vitals are imported automatically and saved to your PHR profile.'),
    ];
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: AppColors.surfaceVariant,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Row(children: [
          Icon(Icons.info_outline_rounded, size: 15, color: AppColors.primary),
          SizedBox(width: 6),
          Text('How it works', style: TextStyle(fontFamily: 'Poppins', fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.primary)),
        ]),
        const SizedBox(height: 8),
        ...steps.asMap().entries.map((e) {
          final i = e.key;
          final step = e.value;
          return Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Container(
                width: 28, height: 28,
                decoration: BoxDecoration(color: AppColors.primaryLight, borderRadius: BorderRadius.circular(8)),
                child: Icon(step.$1, size: 14, color: AppColors.primary),
              ),
              const SizedBox(width: 10),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('${i + 1}. ${step.$2}', style: const TextStyle(fontFamily: 'Poppins', fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.textPrimary)),
                const SizedBox(height: 2),
                Text(step.$3, style: AppTextStyles.caption),
              ])),
            ]),
          );
        }),
      ]),
    );
  }

  Widget _buildDataTypesGrid() {
    final types = [
      (Icons.favorite_rounded, 'Heart Rate', AppColors.heartRate),
      (Icons.water_drop_rounded, 'Blood Glucose', AppColors.info),
      (Icons.monitor_weight_rounded, 'Weight', AppColors.warning),
      (Icons.air_rounded, 'SpO2', AppColors.success),
      (Icons.thermostat_rounded, 'Temperature', AppColors.error),
      (Icons.bloodtype_rounded, 'Blood Pressure', AppColors.primary),
    ];
    return Wrap(
      spacing: 8, runSpacing: 8,
      children: types.map((t) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: t.$3.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: t.$3.withValues(alpha: 0.25)),
        ),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Icon(t.$1, color: t.$3, size: 14),
          const SizedBox(width: 6),
          Text(t.$2, style: TextStyle(fontFamily: 'Poppins', fontSize: 11, fontWeight: FontWeight.w500, color: t.$3)),
        ]),
      )).toList(),
    );
  }

  Widget _buildDaysSelector(HealthSyncState state) {
    final options = [1, 7, 14, 30];
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const Text('Sync Period', style: AppTextStyles.h5),
      const SizedBox(height: 6),
      Row(children: options.map((d) {
        final selected = _selectedDays == d;
        return Expanded(child: GestureDetector(
          onTap: state.isLoading ? null : () => setState(() => _selectedDays = d),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 150),
            margin: const EdgeInsets.only(right: 8),
            padding: const EdgeInsets.symmetric(vertical: 8),
            decoration: BoxDecoration(
              color: selected ? AppColors.primary : AppColors.surfaceVariant,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Text(
              d == 1 ? 'Today' : '$d days',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontFamily: 'Poppins', fontSize: 12, fontWeight: FontWeight.w600,
                color: selected ? Colors.white : AppColors.textSecondary,
              ),
            ),
          ),
        ));
      }).toList()),
    ]);
  }

  Widget _buildStatus(HealthSyncState state) {
    Widget content;

    switch (state.status) {
      case HealthSyncStatus.checkingAvailability:
        content = _statusRow(Icons.search_rounded, AppColors.info, 'Checking Health Connect...');
        break;
      case HealthSyncStatus.requestingPermission:
        content = _statusRow(Icons.lock_open_rounded, AppColors.warning, 'Requesting permissions...');
        break;
      case HealthSyncStatus.syncing:
        content = Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          _statusRow(Icons.sync_rounded, AppColors.primary,
            state.total > 0 ? 'Syncing ${state.synced} / ${state.total} vitals...' : 'Reading health data...'),
          if (state.total > 0) ...[
            const SizedBox(height: 10),
            LinearProgressIndicator(
              value: state.progress,
              backgroundColor: AppColors.primaryLight,
              valueColor: const AlwaysStoppedAnimation(AppColors.primary),
              borderRadius: BorderRadius.circular(4),
              minHeight: 6,
            ),
          ],
        ]);
        break;
      case HealthSyncStatus.success:
        content = _statusRow(Icons.check_circle_rounded, AppColors.success,
          state.total == 0
            ? 'No new vitals found in this period.'
            : '${state.synced} of ${state.total} vitals synced successfully!');
        break;
      case HealthSyncStatus.error:
        content = _statusRow(Icons.error_rounded, AppColors.error, state.error ?? 'Sync failed.');
        break;
      case HealthSyncStatus.unavailable:
        content = _statusRow(Icons.warning_rounded, AppColors.warning,
          'Health Connect is not installed. Install it from the Play Store.');
        break;
      default:
        content = const SizedBox.shrink();
    }

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.surfaceVariant,
        borderRadius: BorderRadius.circular(14),
      ),
      child: content,
    );
  }

  Widget _statusRow(IconData icon, Color color, String text) => Row(children: [
    Icon(icon, color: color, size: 18),
    const SizedBox(width: 10),
    Expanded(child: Text(text, style: AppTextStyles.body2.copyWith(color: AppColors.textPrimary))),
  ]);

  Widget _buildActionButton(BuildContext context, HealthSyncState state) {
    const style = ButtonStyle(
      padding: WidgetStatePropertyAll(EdgeInsets.symmetric(vertical: 12)),
      minimumSize: WidgetStatePropertyAll(Size(double.infinity, 44)),
    );

    if (state.status == HealthSyncStatus.success || state.status == HealthSyncStatus.error) {
      return ElevatedButton.icon(
        style: style,
        icon: const Icon(Icons.refresh_rounded),
        label: const Text('Sync Again'),
        onPressed: () => context.read<HealthSyncCubit>().sync(days: _selectedDays),
      );
    }

    return ElevatedButton.icon(
      style: style,
      icon: state.isLoading
        ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
        : const Icon(Icons.sync_rounded),
      label: Text(state.isLoading ? 'Syncing...' : 'Sync Now'),
      onPressed: state.isLoading ? null : () => context.read<HealthSyncCubit>().sync(days: _selectedDays),
    );
  }
}
