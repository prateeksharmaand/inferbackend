import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../../core/cubits/abdm_cubit.dart';
import '../../../core/models/abha_model.dart';

class HealthRecordsScreen extends StatefulWidget {
  const HealthRecordsScreen({super.key});

  @override
  State<HealthRecordsScreen> createState() => _HealthRecordsScreenState();
}

class _HealthRecordsScreenState extends State<HealthRecordsScreen> {
  @override
  void initState() {
    super.initState();
    context.read<AbdmCubit>().loadHealthRecords();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF5F4FF),
      appBar: AppBar(
        title: const Text('Health Records', style: TextStyle(fontWeight: FontWeight.w700)),
        backgroundColor: Colors.transparent,
        elevation: 0,
        foregroundColor: const Color(0xFF7B6EF6),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh_rounded),
            onPressed: () => context.read<AbdmCubit>().loadHealthRecords(),
          ),
        ],
      ),
      body: BlocConsumer<AbdmCubit, AbdmState>(
        listener: (ctx, state) {
          if (state.status == AbdmStatus.error && state.error != null) {
            ScaffoldMessenger.of(ctx).showSnackBar(
              SnackBar(content: Text(state.error!), backgroundColor: Colors.red.shade600),
            );
            ctx.read<AbdmCubit>().clearError();
          }
        },
        builder: (ctx, state) {
          if (state.status == AbdmStatus.loading && state.healthRecords.isEmpty) {
            return const Center(child: CircularProgressIndicator());
          }

          if (state.healthRecords.isEmpty) {
            return _EmptyState();
          }

          return RefreshIndicator(
            onRefresh: () => ctx.read<AbdmCubit>().loadHealthRecords(),
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                _SummaryBanner(count: state.healthRecords.length),
                const SizedBox(height: 16),
                ...state.healthRecords.map((r) => _RecordCard(record: r)),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.folder_shared_outlined, size: 72, color: Colors.grey.shade300),
            const SizedBox(height: 20),
            const Text(
              'No health records yet',
              style: TextStyle(
                  fontSize: 18, fontWeight: FontWeight.w700, color: Color(0xFF2D2B55)),
            ),
            const SizedBox(height: 8),
            Text(
              'Health records from linked facilities will appear here once a consent request is approved.',
              style: TextStyle(fontSize: 13, color: Colors.grey.shade600),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 24),
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: const Color(0xFF7B6EF6).withValues(alpha: 0.07),
                borderRadius: BorderRadius.circular(14),
              ),
              child: Column(
                children: [
                  _StepRow(step: '1', text: 'Link records from a health facility'),
                  const SizedBox(height: 8),
                  _StepRow(step: '2', text: 'Create a consent request'),
                  const SizedBox(height: 8),
                  _StepRow(step: '3', text: 'Records will be pushed here on approval'),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _StepRow extends StatelessWidget {
  final String step;
  final String text;
  const _StepRow({required this.step, required this.text});

  @override
  Widget build(BuildContext context) => Row(
        children: [
          Container(
            width: 24,
            height: 24,
            decoration: BoxDecoration(
              color: const Color(0xFF7B6EF6),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Center(
              child: Text(step,
                  style: const TextStyle(
                      color: Colors.white, fontSize: 11, fontWeight: FontWeight.w700)),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(text, style: const TextStyle(fontSize: 13, color: Color(0xFF5C5A8E))),
          ),
        ],
      );
}

class _SummaryBanner extends StatelessWidget {
  final int count;
  const _SummaryBanner({required this.count});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFFF44336), Color(0xFFEF5350)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        children: [
          const Icon(Icons.folder_shared_rounded, color: Colors.white, size: 28),
          const SizedBox(width: 14),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('$count Record(s) Received',
                  style: const TextStyle(
                      color: Colors.white, fontWeight: FontWeight.w700, fontSize: 16)),
              const Text('FHIR R4 health information',
                  style: TextStyle(color: Colors.white70, fontSize: 12)),
            ],
          ),
        ],
      ),
    );
  }
}

class _RecordCard extends StatelessWidget {
  final HealthRecord record;
  const _RecordCard({required this.record});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
              color: Colors.black.withValues(alpha: 0.05),
              blurRadius: 8,
              offset: const Offset(0, 2)),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: const Color(0xFFF44336).withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Icon(Icons.description_rounded,
                      color: Color(0xFFF44336), size: 22),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        record.careContextReference.isNotEmpty
                            ? record.careContextReference
                            : 'Health Record',
                        style: const TextStyle(
                            fontWeight: FontWeight.w700,
                            fontSize: 14,
                            color: Color(0xFF2D2B55)),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      Text(
                        'Received ${_fmtDate(record.receivedAt)}',
                        style:
                            const TextStyle(fontSize: 12, color: Colors.grey),
                      ),
                    ],
                  ),
                ),
                if (record.media != null)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: Colors.blue.shade50,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(record.media!,
                        style: TextStyle(
                            color: Colors.blue.shade700,
                            fontSize: 11,
                            fontWeight: FontWeight.w600)),
                  ),
              ],
            ),
          ),
          if (record.content != null && record.content!.isNotEmpty) ...[
            const Divider(height: 1),
            _FhirContent(content: record.content!),
          ],
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
            child: Row(
              children: [
                Icon(Icons.swap_horiz_rounded, size: 14, color: Colors.grey.shade500),
                const SizedBox(width: 4),
                Expanded(
                  child: Text(
                    'TxID: ${record.transactionId}',
                    style: TextStyle(fontSize: 10, color: Colors.grey.shade500),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  String _fmtDate(DateTime d) {
    const months = ['Jan','Feb','Mar','Apr','May','Jun',
                    'Jul','Aug','Sep','Oct','Nov','Dec'];
    return '${d.day} ${months[d.month - 1]} ${d.year}';
  }
}

class _FhirContent extends StatefulWidget {
  final String content;
  const _FhirContent({required this.content});

  @override
  State<_FhirContent> createState() => _FhirContentState();
}

class _FhirContentState extends State<_FhirContent> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    Map<String, dynamic>? parsed;
    try {
      parsed = jsonDecode(widget.content) as Map<String, dynamic>?;
    } catch (_) {}

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        InkWell(
          onTap: () => setState(() => _expanded = !_expanded),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            child: Row(
              children: [
                Text(
                  _expanded ? 'Hide Content' : 'View FHIR Content',
                  style: const TextStyle(
                      color: Color(0xFF7B6EF6),
                      fontSize: 13,
                      fontWeight: FontWeight.w600),
                ),
                const SizedBox(width: 4),
                Icon(
                  _expanded ? Icons.expand_less_rounded : Icons.expand_more_rounded,
                  color: const Color(0xFF7B6EF6),
                  size: 18,
                ),
              ],
            ),
          ),
        ),
        if (_expanded) ...[
          const Divider(height: 1),
          if (parsed != null) _FhirSummary(fhir: parsed) else _RawContent(content: widget.content),
        ],
      ],
    );
  }
}

class _FhirSummary extends StatelessWidget {
  final Map<String, dynamic> fhir;
  const _FhirSummary({required this.fhir});

  @override
  Widget build(BuildContext context) {
    final resourceType = fhir['resourceType'] as String? ?? 'Unknown';
    final entries = (fhir['entry'] as List?)?.cast<Map<String, dynamic>>() ?? [];

    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _FhirChip(label: 'Resource Type', value: resourceType),
          if (entries.isNotEmpty) ...[
            const SizedBox(height: 8),
            _FhirChip(label: 'Entries', value: '${entries.length}'),
          ],
          if (fhir['id'] != null) ...[
            const SizedBox(height: 8),
            _FhirChip(label: 'ID', value: fhir['id'].toString()),
          ],
          if (fhir['subject'] != null) ...[
            const SizedBox(height: 8),
            _FhirChip(
                label: 'Subject',
                value: (fhir['subject'] as Map?)?['reference']?.toString() ?? ''),
          ],
        ],
      ),
    );
  }
}

class _FhirChip extends StatelessWidget {
  final String label;
  final String value;
  const _FhirChip({required this.label, required this.value});

  @override
  Widget build(BuildContext context) => Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('$label: ',
              style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: Colors.grey.shade600)),
          Expanded(
            child: Text(value,
                style: const TextStyle(fontSize: 12, color: Color(0xFF2D2B55))),
          ),
        ],
      );
}

class _RawContent extends StatelessWidget {
  final String content;
  const _RawContent({required this.content});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.all(12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.grey.shade50,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.grey.shade200),
      ),
      child: Text(
        content.length > 500 ? '${content.substring(0, 500)}…' : content,
        style: const TextStyle(fontSize: 11, fontFamily: 'monospace', color: Color(0xFF2D2B55)),
      ),
    );
  }
}
