import 'package:flutter/material.dart';
import 'package:fl_chart/fl_chart.dart';
import '../../core/models/vital_model.dart';
import '../../core/theme/app_theme.dart';

class BpTrendChart extends StatelessWidget {
  final List<VitalModel>? vitals;
  final Color? color;
  const BpTrendChart({super.key, this.vitals, this.color});

  @override
  Widget build(BuildContext context) {
    if (vitals == null || vitals!.isEmpty) return _buildPlaceholder();
    final bpVitals = vitals!.where((v) => v.type == 'blood_pressure').toList().reversed.take(14).toList();
    if (bpVitals.isEmpty) return _buildPlaceholder();

    final systolicSpots = bpVitals.asMap().entries.map((e) =>
      FlSpot(e.key.toDouble(), (e.value.values['systolic'] ?? 0).toDouble())).toList();
    final diastolicSpots = bpVitals.asMap().entries.map((e) =>
      FlSpot(e.key.toDouble(), (e.value.values['diastolic'] ?? 0).toDouble())).toList();

    return LineChart(LineChartData(
      gridData: FlGridData(show: true, drawVerticalLine: false, getDrawingHorizontalLine: (_) => FlLine(color: AppColors.border, strokeWidth: 0.5)),
      titlesData: FlTitlesData(
        leftTitles: AxisTitles(sideTitles: SideTitles(showTitles: true, interval: 20, reservedSize: 32, getTitlesWidget: (v, _) => Text('${v.toInt()}', style: AppTextStyles.caption))),
        bottomTitles: AxisTitles(sideTitles: SideTitles(showTitles: true, interval: 2, reservedSize: 20, getTitlesWidget: (v, _) {
          final i = v.toInt();
          if (i < bpVitals.length) return Text('${bpVitals[i].recordedAt.day}/${bpVitals[i].recordedAt.month}', style: AppTextStyles.caption);
          return const Text('');
        })),
        topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
        rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
      ),
      borderData: FlBorderData(show: false),
      minY: 50, maxY: 200,
      lineBarsData: [
        LineChartBarData(spots: systolicSpots, isCurved: true, color: AppColors.primary, barWidth: 2.5, dotData: FlDotData(getDotPainter: (_, __, ___, ____) => FlDotCirclePainter(radius: 3, color: AppColors.primary, strokeWidth: 1.5, strokeColor: Colors.white)), belowBarData: BarAreaData(show: true, gradient: LinearGradient(colors: [AppColors.primary.withOpacity(0.2), AppColors.primary.withOpacity(0)]))),
        LineChartBarData(spots: diastolicSpots, isCurved: true, color: AppColors.secondary, barWidth: 2.5, dotData: FlDotData(getDotPainter: (_, __, ___, ____) => FlDotCirclePainter(radius: 3, color: AppColors.secondary, strokeWidth: 1.5, strokeColor: Colors.white)), belowBarData: BarAreaData(show: true, gradient: LinearGradient(colors: [AppColors.secondary.withOpacity(0.1), AppColors.secondary.withOpacity(0)]))),
      ],
    ));
  }

  Widget _buildPlaceholder() => Container(
    decoration: BoxDecoration(color: AppColors.surfaceVariant, borderRadius: BorderRadius.circular(12)),
    child: const Center(child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
      Icon(Icons.show_chart, size: 32, color: AppColors.textHint),
      SizedBox(height: 8),
      Text('No data yet', style: AppTextStyles.caption),
    ])),
  );
}

class SingleVitalChart extends StatelessWidget {
  final List<VitalModel> vitals;
  final String valueKey;
  final Color color;
  const SingleVitalChart({super.key, required this.vitals, required this.valueKey, required this.color});

  @override
  Widget build(BuildContext context) {
    if (vitals.isEmpty) return const Center(child: Text('No data', style: AppTextStyles.caption));
    final data = vitals.reversed.take(30).toList();
    final spots = data.asMap().entries.map((e) => FlSpot(e.key.toDouble(), (e.value.values[valueKey] ?? 0).toDouble())).toList();
    return LineChart(LineChartData(
      gridData: FlGridData(show: true, drawVerticalLine: false, getDrawingHorizontalLine: (_) => FlLine(color: AppColors.border, strokeWidth: 0.5)),
      titlesData: FlTitlesData(
        leftTitles: AxisTitles(sideTitles: SideTitles(showTitles: true, reservedSize: 36, getTitlesWidget: (v, _) => Text(v.toStringAsFixed(0), style: AppTextStyles.caption))),
        bottomTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
        topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
        rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
      ),
      borderData: FlBorderData(show: false),
      lineBarsData: [LineChartBarData(spots: spots, isCurved: true, color: color, barWidth: 2.5, dotData: const FlDotData(show: false), belowBarData: BarAreaData(show: true, gradient: LinearGradient(colors: [color.withOpacity(0.2), color.withOpacity(0)], begin: Alignment.topCenter, end: Alignment.bottomCenter)))],
    ));
  }
}
