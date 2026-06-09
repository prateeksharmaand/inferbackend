import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:pdfx/pdfx.dart';
import 'package:dio/dio.dart';
import 'package:intl/intl.dart';
import '../../../core/cubits/documents_cubit.dart';
import '../../../core/models/document_model.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/constants/app_constants.dart';

final _dateFmt = DateFormat('dd MMM yyyy');

class SmartReportScreen extends StatefulWidget {
  final DocumentModel doc;
  const SmartReportScreen({super.key, required this.doc});

  @override
  State<SmartReportScreen> createState() => _SmartReportScreenState();
}

class _SmartReportScreenState extends State<SmartReportScreen> {
  late DocumentModel _doc;
  bool _reanalyzing = false;

  @override
  void initState() {
    super.initState();
    _doc = widget.doc;
  }

  Future<void> _reanalyze() async {
    if (_doc.id == null) return;
    setState(() => _reanalyzing = true);
    final updated = await context.read<DocumentsCubit>().reanalyzeDocument(_doc.id!);
    if (mounted) {
      setState(() {
        _reanalyzing = false;
        if (updated != null) _doc = updated;
      });
      if (updated == null) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Re-analysis failed. Please try again.'), backgroundColor: AppColors.error),
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Found ${updated.extractedVitals?.length ?? 0} vitals'),
            backgroundColor: AppColors.success,
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return BlocListener<DocumentsCubit, DocumentsState>(
      listenWhen: (prev, next) {
        final prevDoc = prev.documents.where((d) => d.id == _doc.id).firstOrNull;
        final nextDoc = next.documents.where((d) => d.id == _doc.id).firstOrNull;
        return nextDoc != null && nextDoc.extractedVitals != prevDoc?.extractedVitals;
      },
      listener: (context, state) {
        final updated = state.documents.where((d) => d.id == _doc.id).firstOrNull;
        if (updated != null && mounted) setState(() => _doc = updated);
      },
      child: DefaultTabController(
      length: 2,
      child: Scaffold(
        backgroundColor: AppColors.background,
        appBar: AppBar(
          title: Text(_doc.title, overflow: TextOverflow.ellipsis),
          actions: [
            if (_reanalyzing)
              const Padding(
                padding: EdgeInsets.symmetric(horizontal: 16),
                child: Center(child: SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))),
              )
            else
              IconButton(
                icon: const Icon(Icons.refresh_rounded),
                tooltip: 'Re-analyze vitals',
                onPressed: _reanalyze,
              ),
          ],
          bottom: const TabBar(
            tabs: [
              Tab(text: 'Smart Report'),
              Tab(text: 'Original Report'),
            ],
          ),
        ),
        body: TabBarView(
          children: [
            _SmartReportTab(doc: _doc),
            _OriginalReportTab(doc: _doc),
          ],
        ),
      ),
    ));
  }
}

// ─── Smart Report Tab ────────────────────────────────────────────────────────

class _SmartReportTab extends StatefulWidget {
  final DocumentModel doc;
  const _SmartReportTab({required this.doc});

  @override
  State<_SmartReportTab> createState() => _SmartReportTabState();
}

class _SmartReportTabState extends State<_SmartReportTab> {
  bool _showOutOfRange = false;

  static const _abnormalStatuses = {'high', 'low', 'critical', 'elevated'};

  bool _isOutOfRange(dynamic data) {
    if (data is Map) {
      return _abnormalStatuses.contains(data['status'] as String? ?? '');
    }
    return false;
  }

  @override
  Widget build(BuildContext context) {
    final vitals = widget.doc.extractedVitals ?? {};
    final allEntries = vitals.entries.toList();
    final outOfRangeEntries = allEntries.where((e) => _isOutOfRange(e.value)).toList();
    final displayed = _showOutOfRange ? outOfRangeEntries : allEntries;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Filter chips
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 0),
          child: Row(
            children: [
              _FilterPill(
                label: 'All Lab Vitals',
                count: allEntries.length,
                selected: !_showOutOfRange,
                onTap: () => setState(() => _showOutOfRange = false),
              ),
              const SizedBox(width: 10),
              _FilterPill(
                label: 'Out of Range',
                count: outOfRangeEntries.length,
                selected: _showOutOfRange,
                isWarning: true,
                onTap: () => setState(() => _showOutOfRange = true),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        // Document info banner
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: _InfoBanner(doc: widget.doc),
        ),
        const SizedBox(height: 12),
        // List
        Expanded(
          child: displayed.isEmpty
              ? _EmptyState(outOfRange: _showOutOfRange)
              : ListView.builder(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                  itemCount: displayed.length,
                  itemBuilder: (_, i) => _VitalCard(
                    name: displayed[i].key,
                    data: displayed[i].value,
                  ),
                ),
        ),
      ],
    );
  }
}

class _FilterPill extends StatelessWidget {
  final String label;
  final int count;
  final bool selected;
  final bool isWarning;
  final VoidCallback onTap;

  const _FilterPill({
    required this.label,
    required this.count,
    required this.selected,
    this.isWarning = false,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final color = isWarning ? AppColors.warning : AppColors.primary;
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
        decoration: BoxDecoration(
          color: selected ? color : AppColors.surface,
          borderRadius: BorderRadius.circular(22),
          border: Border.all(color: selected ? color : AppColors.border),
          boxShadow: selected
              ? [BoxShadow(color: color.withValues(alpha: 0.25), blurRadius: 8, offset: const Offset(0, 2))]
              : [],
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              label,
              style: TextStyle(
                fontFamily: 'Poppins',
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: selected ? Colors.white : AppColors.textSecondary,
              ),
            ),
            const SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
              decoration: BoxDecoration(
                color: selected
                    ? Colors.white.withValues(alpha: 0.28)
                    : (isWarning ? AppColors.warningLight : AppColors.primaryLight),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Text(
                '$count',
                style: TextStyle(
                  fontFamily: 'Poppins',
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  color: selected ? Colors.white : color,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _InfoBanner extends StatelessWidget {
  final DocumentModel doc;
  const _InfoBanner({required this.doc});

  @override
  Widget build(BuildContext context) {
    final meta = [
      if (doc.doctorName != null) doc.doctorName!,
      if (doc.facilityName != null) doc.facilityName!,
      if (doc.documentDate != null) _dateFmt.format(doc.documentDate!.toLocal()),
    ].join(' • ');

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: AppColors.primaryLight,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          const Icon(Icons.auto_awesome_rounded, color: AppColors.primary, size: 18),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  doc.type,
                  style: AppTextStyles.caption.copyWith(color: AppColors.primary, fontWeight: FontWeight.w600),
                ),
                if (meta.isNotEmpty) ...[
                  const SizedBox(height: 1),
                  Text(meta, style: AppTextStyles.caption),
                ],
              ],
            ),
          ),
          Text(
            'AI Extracted',
            style: AppTextStyles.caption.copyWith(color: AppColors.primary, fontWeight: FontWeight.w600),
          ),
        ],
      ),
    );
  }
}

class _VitalCard extends StatelessWidget {
  final String name;
  final dynamic data;
  const _VitalCard({required this.name, required this.data});

  static String _fmtValue(dynamic v) {
    if (v is num) {
      final d = v.toDouble();
      return d == d.truncateToDouble() ? d.toInt().toString() : d.toStringAsFixed(2);
    }
    return '$v';
  }

  static String _fmt(String key) => key
      .split('_')
      .map((w) => w.isEmpty ? '' : '${w[0].toUpperCase()}${w.substring(1)}')
      .join(' ');

  static Color _color(String status) {
    switch (status) {
      case 'normal':   return AppColors.success;
      case 'elevated':
      case 'high':     return AppColors.warning;
      case 'low':      return AppColors.info;
      case 'critical': return AppColors.error;
      default:         return AppColors.textHint;
    }
  }

  static IconData _icon(String status) {
    switch (status) {
      case 'normal':   return Icons.check_circle_outline;
      case 'elevated':
      case 'high':     return Icons.arrow_upward_rounded;
      case 'low':      return Icons.arrow_downward_rounded;
      case 'critical': return Icons.warning_amber_rounded;
      default:         return Icons.help_outline;
    }
  }

  @override
  Widget build(BuildContext context) {
    final map = data is Map ? data as Map<dynamic, dynamic> : <dynamic, dynamic>{};
    final value = map['value'];
    final unit = (map['unit'] as String?) ?? '';
    final status = (map['status'] as String?) ?? 'unknown';
    final refMin = map['reference_min'];
    final refMax = map['reference_max'];
    final color = _color(status);

    final hasRange = refMin is num && refMax is num && refMax > refMin;
    final numValue = value is num ? value.toDouble() : null;

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(14),
        boxShadow: [
          BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 8, offset: const Offset(0, 2)),
        ],
      ),
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 14, 14, 10),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      width: 42,
                      height: 42,
                      decoration: BoxDecoration(
                        color: color.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(11),
                      ),
                      child: Icon(_icon(status), color: color, size: 20),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(_fmt(name), style: AppTextStyles.body2.copyWith(fontWeight: FontWeight.w600, color: AppColors.textPrimary)),
                          const SizedBox(height: 3),
                          Row(
                            crossAxisAlignment: CrossAxisAlignment.baseline,
                            textBaseline: TextBaseline.alphabetic,
                            children: [
                              Text(
                                value != null ? _fmtValue(value) : '—',
                                style: const TextStyle(fontFamily: 'Poppins', fontSize: 20, fontWeight: FontWeight.w700, color: AppColors.textPrimary),
                              ),
                              if (unit.isNotEmpty) ...[
                                const SizedBox(width: 4),
                                Text(unit, style: AppTextStyles.caption),
                              ],
                            ],
                          ),
                        ],
                      ),
                    ),
                    _StatusBadge(status: status, color: color),
                  ],
                ),
                if (hasRange && numValue != null) ...[
                  const SizedBox(height: 10),
                  _RangeBar(
                    value: numValue,
                    refMin: refMin.toDouble(),
                    refMax: refMax.toDouble(),
                    unit: unit,
                    color: color,
                  ),
                ],
              ],
            ),
          ),
          ClipRRect(
            borderRadius: const BorderRadius.only(
              bottomLeft: Radius.circular(14),
              bottomRight: Radius.circular(14),
            ),
            child: LinearProgressIndicator(
              value: 1,
              minHeight: 3,
              backgroundColor: color.withValues(alpha: 0.15),
              valueColor: AlwaysStoppedAnimation<Color>(color.withValues(alpha: 0.5)),
            ),
          ),
        ],
      ),
    );
  }
}

class _RangeBar extends StatelessWidget {
  final double value;
  final double refMin;
  final double refMax;
  final String unit;
  final Color color;

  static String _n(double v) =>
      v == v.truncateToDouble() ? v.toInt().toString() : v.toStringAsFixed(1);

  const _RangeBar({
    required this.value,
    required this.refMin,
    required this.refMax,
    required this.unit,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    // Display range: extend 20% beyond each side of the reference range
    final span = refMax - refMin;
    final displayMin = (refMin - span * 0.2).clamp(0, double.infinity).toDouble();
    final displayMax = refMax + span * 0.2;
    final displayRange = displayMax - displayMin;

    final normalStart = (refMin - displayMin) / displayRange;
    final normalEnd = (refMax - displayMin) / displayRange;
    final valuePos = ((value - displayMin) / displayRange).clamp(0.0, 1.0);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Labels row
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              'Min: ${_n(refMin)}',
              style: AppTextStyles.caption.copyWith(fontSize: 10),
            ),
            Text(
              'Ref: ${_n(refMin)} – ${_n(refMax)} $unit'.trim(),
              style: AppTextStyles.caption.copyWith(
                fontSize: 10,
                color: AppColors.success,
                fontWeight: FontWeight.w600,
              ),
            ),
            Text(
              'Max: ${_n(refMax)}',
              style: AppTextStyles.caption.copyWith(fontSize: 10),
            ),
          ],
        ),
        const SizedBox(height: 5),
        // Bar
        LayoutBuilder(
          builder: (_, constraints) {
            final w = constraints.maxWidth;
            return SizedBox(
              height: 20,
              child: Stack(
                clipBehavior: Clip.none,
                children: [
                  // Track
                  Positioned(
                    left: 0, right: 0, top: 7, bottom: 7,
                    child: Container(
                      decoration: BoxDecoration(
                        color: AppColors.surfaceVariant,
                        borderRadius: BorderRadius.circular(4),
                      ),
                    ),
                  ),
                  // Normal zone (green)
                  Positioned(
                    left: normalStart * w,
                    width: (normalEnd - normalStart) * w,
                    top: 7, bottom: 7,
                    child: Container(
                      decoration: BoxDecoration(
                        color: AppColors.success.withValues(alpha: 0.25),
                        borderRadius: BorderRadius.circular(4),
                      ),
                    ),
                  ),
                  // Value marker
                  Positioned(
                    left: (valuePos * w - 5).clamp(0, w - 10),
                    top: 2,
                    child: Container(
                      width: 10,
                      height: 16,
                      decoration: BoxDecoration(
                        color: color,
                        borderRadius: BorderRadius.circular(3),
                        boxShadow: [
                          BoxShadow(color: color.withValues(alpha: 0.45), blurRadius: 4, offset: const Offset(0, 1)),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            );
          },
        ),
      ],
    );
  }
}

class _StatusBadge extends StatelessWidget {
  final String status;
  final Color color;
  const _StatusBadge({required this.status, required this.color});

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: color.withValues(alpha: 0.3)),
        ),
        child: Text(
          status.toUpperCase(),
          style: TextStyle(
            fontFamily: 'Poppins',
            fontSize: 10,
            fontWeight: FontWeight.w700,
            color: color,
            letterSpacing: 0.5,
          ),
        ),
      );
}

class _EmptyState extends StatelessWidget {
  final bool outOfRange;
  const _EmptyState({required this.outOfRange});

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                outOfRange ? Icons.check_circle_outline : Icons.science_outlined,
                size: 60,
                color: outOfRange ? AppColors.success : AppColors.textHint,
              ),
              const SizedBox(height: 16),
              Text(
                outOfRange ? 'All values in range!' : 'No vitals extracted',
                style: AppTextStyles.h5.copyWith(
                  color: outOfRange ? AppColors.success : AppColors.textPrimary,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                outOfRange
                    ? 'Great news — every result looks normal.'
                    : 'No lab values were found in this document.',
                style: AppTextStyles.body2,
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      );
}

// ─── Original Report Tab ─────────────────────────────────────────────────────

class _OriginalReportTab extends StatefulWidget {
  final DocumentModel doc;
  const _OriginalReportTab({required this.doc});

  @override
  State<_OriginalReportTab> createState() => _OriginalReportTabState();
}

class _OriginalReportTabState extends State<_OriginalReportTab> {
  PdfController? _pdf;
  bool _loading = false;
  bool _error = false;

  String get _fileUrl => AppConstants.fileBaseUrl + (widget.doc.fileUrl ?? '');

  @override
  void initState() {
    super.initState();
    if ((widget.doc.mimeType ?? '') == 'application/pdf' && widget.doc.fileUrl != null) {
      _loadPdf();
    }
  }

  Future<void> _loadPdf() async {
    if (!mounted) return;
    setState(() { _loading = true; _error = false; });
    try {
      final response = await Dio().get<List<int>>(
        _fileUrl,
        options: Options(responseType: ResponseType.bytes),
      );
      final bytes = Uint8List.fromList(response.data!);
      if (mounted) {
        setState(() {
          _pdf = PdfController(document: PdfDocument.openData(bytes));
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() { _loading = false; _error = true; });
    }
  }

  @override
  void dispose() {
    _pdf?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (widget.doc.fileUrl == null) {
      return _buildNoFile();
    }
    final mime = widget.doc.mimeType ?? '';
    if (mime.startsWith('image/')) return _buildImageViewer();
    if (mime == 'application/pdf') return _buildPdfViewer();
    return _buildUnsupported(mime);
  }

  Widget _buildImageViewer() => InteractiveViewer(
        minScale: 0.5,
        maxScale: 5,
        child: Center(
          child: CachedNetworkImage(
            imageUrl: _fileUrl,
            fit: BoxFit.contain,
            placeholder: (_, __) => const Center(child: CircularProgressIndicator()),
            errorWidget: (_, __, ___) => Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: const [
                Icon(Icons.broken_image_outlined, size: 64, color: AppColors.textHint),
                SizedBox(height: 12),
                Text('Failed to load image', style: AppTextStyles.body2),
              ],
            ),
          ),
        ),
      );

  Widget _buildPdfViewer() {
    if (_loading) {
      return const Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            CircularProgressIndicator(),
            SizedBox(height: 16),
            Text('Loading PDF…', style: AppTextStyles.body2),
          ],
        ),
      );
    }
    if (_error) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.error_outline, size: 56, color: AppColors.error),
            const SizedBox(height: 12),
            const Text('Failed to load PDF', style: AppTextStyles.body2),
            const SizedBox(height: 16),
            ElevatedButton.icon(
              onPressed: _loadPdf,
              icon: const Icon(Icons.refresh),
              label: const Text('Retry'),
            ),
          ],
        ),
      );
    }
    if (_pdf != null) {
      return PdfView(
        controller: _pdf!,
        scrollDirection: Axis.vertical,
      );
    }
    return const SizedBox.shrink();
  }

  Widget _buildNoFile() => const Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.folder_off_outlined, size: 56, color: AppColors.textHint),
            SizedBox(height: 12),
            Text('No file attached', style: AppTextStyles.body2),
          ],
        ),
      );

  Widget _buildUnsupported(String mime) => Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.description_outlined, size: 56, color: AppColors.textHint),
            const SizedBox(height: 12),
            Text(
              'Preview not available\nfor ${mime.isEmpty ? 'this file type' : mime}',
              style: AppTextStyles.body2,
              textAlign: TextAlign.center,
            ),
          ],
        ),
      );
}
