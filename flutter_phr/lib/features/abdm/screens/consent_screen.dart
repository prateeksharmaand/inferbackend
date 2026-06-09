import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../../core/cubits/abdm_cubit.dart';
import '../../../core/models/abha_model.dart';

class ConsentScreen extends StatefulWidget {
  const ConsentScreen({super.key});

  @override
  State<ConsentScreen> createState() => _ConsentScreenState();
}

class _ConsentScreenState extends State<ConsentScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabs;

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 2, vsync: this);
    context.read<AbdmCubit>().loadConsentRequests();
  }

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF5F4FF),
      appBar: AppBar(
        title: const Text('Consent Management', style: TextStyle(fontWeight: FontWeight.w700)),
        backgroundColor: Colors.transparent,
        elevation: 0,
        foregroundColor: const Color(0xFF7B6EF6),
        bottom: TabBar(
          controller: _tabs,
          labelColor: const Color(0xFF7B6EF6),
          unselectedLabelColor: Colors.grey,
          indicatorColor: const Color(0xFF7B6EF6),
          tabs: const [
            Tab(text: 'My Consents'),
            Tab(text: 'New Request'),
          ],
        ),
      ),
      body: BlocConsumer<AbdmCubit, AbdmState>(
        listener: (ctx, state) {
          if (state.status == AbdmStatus.error && state.error != null) {
            ScaffoldMessenger.of(ctx).showSnackBar(
              SnackBar(content: Text(state.error!), backgroundColor: Colors.red.shade600),
            );
            ctx.read<AbdmCubit>().clearError();
          }
          if (state.message != null) {
            ScaffoldMessenger.of(ctx).showSnackBar(
              SnackBar(content: Text(state.message!), backgroundColor: Colors.green.shade600),
            );
            ctx.read<AbdmCubit>().clearMessage();
            _tabs.animateTo(0);
          }
        },
        builder: (ctx, state) => TabBarView(
          controller: _tabs,
          children: [
            _ConsentListTab(state: state),
            _NewConsentTab(state: state),
          ],
        ),
      ),
    );
  }
}

// ── Consent list tab ───────────────────────────────────────────────────────────

class _ConsentListTab extends StatelessWidget {
  final AbdmState state;
  const _ConsentListTab({required this.state});

  @override
  Widget build(BuildContext context) {
    if (state.status == AbdmStatus.loading && state.consentRequests.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }
    if (state.consentRequests.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.verified_user_outlined, size: 64, color: Colors.grey.shade300),
            const SizedBox(height: 16),
            const Text('No consent requests yet',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: Colors.grey)),
            const SizedBox(height: 8),
            const Text('Create a new request to share your health records',
                style: TextStyle(fontSize: 13, color: Colors.grey), textAlign: TextAlign.center),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: () => context.read<AbdmCubit>().loadConsentRequests(),
      child: ListView.separated(
        padding: const EdgeInsets.all(16),
        itemCount: state.consentRequests.length,
        separatorBuilder: (_, __) => const SizedBox(height: 10),
        itemBuilder: (_, i) => _ConsentCard(consent: state.consentRequests[i]),
      ),
    );
  }
}

class _ConsentCard extends StatelessWidget {
  final ConsentRequest consent;
  const _ConsentCard({required this.consent});

  @override
  Widget build(BuildContext context) {
    final (statusColor, statusIcon, statusLabel) = _statusInfo(consent.status);
    final isPending = consent.status == 'REQUESTED';

    return Container(
      padding: const EdgeInsets.all(16),
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
          Row(
            children: [
              Expanded(
                child: Text(
                  _purposeLabel(consent.purpose),
                  style: const TextStyle(
                      fontWeight: FontWeight.w700, fontSize: 15, color: Color(0xFF2D2B55)),
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: statusColor.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(statusIcon, color: statusColor, size: 14),
                    const SizedBox(width: 4),
                    Text(statusLabel,
                        style: TextStyle(
                            color: statusColor, fontSize: 12, fontWeight: FontWeight.w600)),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          _InfoRow(label: 'HIU', value: consent.hiuId),
          _InfoRow(label: 'Requested', value: _formatDate(consent.createdAt)),
          if (consent.requestId.isNotEmpty)
            _InfoRow(label: 'Request ID', value: consent.requestId),
          if (isPending) ...[
            const SizedBox(height: 14),
            const Divider(height: 1),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () => _respond(context, 'DENY'),
                    icon: const Icon(Icons.close_rounded, size: 16),
                    label: const Text('Deny'),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: Colors.red.shade600,
                      side: BorderSide(color: Colors.red.shade300),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                      padding: const EdgeInsets.symmetric(vertical: 10),
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: ElevatedButton.icon(
                    onPressed: () => _respond(context, 'GRANT'),
                    icon: const Icon(Icons.check_rounded, size: 16),
                    label: const Text('Grant Consent'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF7B6EF6),
                      foregroundColor: Colors.white,
                      elevation: 0,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                      padding: const EdgeInsets.symmetric(vertical: 10),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  void _respond(BuildContext context, String action) {
    context.read<AbdmCubit>().respondToConsent(consent.requestId, action);
  }

  (Color, IconData, String) _statusInfo(String status) => switch (status) {
        'GRANTED'   => (Colors.green, Icons.check_circle_rounded, 'Granted'),
        'DENIED'    => (Colors.red, Icons.cancel_rounded, 'Denied'),
        'REVOKED'   => (Colors.orange, Icons.remove_circle_rounded, 'Revoked'),
        'EXPIRED'   => (Colors.grey, Icons.timer_off_rounded, 'Expired'),
        _           => (Colors.blue, Icons.hourglass_top_rounded, 'Pending'),
      };

  String _purposeLabel(String code) => switch (code) {
        'CAREMGT'   => 'Care Management',
        'BTG'       => 'Break the Glass',
        'PUBHLTH'   => 'Public Health',
        'HPAYMT'    => 'Healthcare Payment',
        'DSRCH'     => 'Disease Specific Research',
        'PATRQT'    => 'Self Requested',
        _           => code,
      };

  String _formatDate(DateTime dt) =>
      '${dt.day} ${_months[dt.month - 1]} ${dt.year}';

  static const _months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ];
}

class _InfoRow extends StatelessWidget {
  final String label;
  final String value;
  const _InfoRow({required this.label, required this.value});

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 3),
        child: Row(
          children: [
            SizedBox(
              width: 90,
              child: Text(label,
                  style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
            ),
            Expanded(
              child: Text(value,
                  style: const TextStyle(fontSize: 12, color: Color(0xFF2D2B55))),
            ),
          ],
        ),
      );
}

// ── New consent request tab ────────────────────────────────────────────────────

class _NewConsentTab extends StatefulWidget {
  final AbdmState state;
  const _NewConsentTab({required this.state});

  @override
  State<_NewConsentTab> createState() => _NewConsentTabState();
}

class _NewConsentTabState extends State<_NewConsentTab> {
  final _hiuCtrl = TextEditingController();
  String _purpose = 'CAREMGT';
  final _selectedHiTypes = <String>{};
  DateTimeRange? _dateRange;

  static const _purposes = [
    ('CAREMGT',  'Care Management'),
    ('PATRQT',   'Self Requested'),
    ('HPAYMT',   'Healthcare Payment'),
    ('PUBHLTH',  'Public Health'),
    ('DSRCH',    'Disease Specific Research'),
  ];

  static const _hiTypes = [
    'Prescription',
    'DiagnosticReport',
    'OPConsultation',
    'DischargeSummary',
    'ImmunizationRecord',
    'HealthDocumentRecord',
    'WellnessRecord',
  ];

  @override
  void dispose() {
    _hiuCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final loading = widget.state.status == AbdmStatus.loading;

    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _SectionLabel('Health Information User (HIU)'),
          const SizedBox(height: 8),
          TextField(
            controller: _hiuCtrl,
            decoration: InputDecoration(
              hintText: 'Enter HIU ID',
              filled: true,
              fillColor: Colors.white,
              border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide(color: Colors.grey.shade200)),
              enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide(color: Colors.grey.shade200)),
              focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: const BorderSide(color: Color(0xFF7B6EF6))),
              contentPadding:
                  const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            ),
          ),
          const SizedBox(height: 20),
          _SectionLabel('Purpose of Access'),
          const SizedBox(height: 8),
          ..._purposes.map((p) => _PurposeTile(
                value: p.$1,
                label: p.$2,
                selected: _purpose == p.$1,
                onTap: () => setState(() => _purpose = p.$1),
              )),
          const SizedBox(height: 20),
          _SectionLabel('Health Information Types'),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: _hiTypes
                .map((t) => FilterChip(
                      label: Text(t, style: const TextStyle(fontSize: 12)),
                      selected: _selectedHiTypes.contains(t),
                      onSelected: (v) => setState(
                          () => v ? _selectedHiTypes.add(t) : _selectedHiTypes.remove(t)),
                      selectedColor: const Color(0xFF7B6EF6).withValues(alpha: 0.15),
                      checkmarkColor: const Color(0xFF7B6EF6),
                      side: BorderSide(
                          color: _selectedHiTypes.contains(t)
                              ? const Color(0xFF7B6EF6)
                              : Colors.grey.shade300),
                    ))
                .toList(),
          ),
          const SizedBox(height: 20),
          _SectionLabel('Date Range'),
          const SizedBox(height: 8),
          InkWell(
            onTap: _pickDateRange,
            borderRadius: BorderRadius.circular(12),
            child: Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: Colors.grey.shade200),
              ),
              child: Row(
                children: [
                  const Icon(Icons.date_range_rounded, color: Color(0xFF7B6EF6), size: 20),
                  const SizedBox(width: 12),
                  Text(
                    _dateRange == null
                        ? 'Select date range'
                        : '${_fmtDate(_dateRange!.start)} → ${_fmtDate(_dateRange!.end)}',
                    style: TextStyle(
                        color: _dateRange == null ? Colors.grey : const Color(0xFF2D2B55),
                        fontSize: 14),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 28),
          SizedBox(
            width: double.infinity,
            height: 50,
            child: ElevatedButton.icon(
              onPressed: loading || _hiuCtrl.text.isEmpty || _selectedHiTypes.isEmpty
                  ? null
                  : _submit,
              icon: const Icon(Icons.send_rounded),
              label: loading
                  ? const SizedBox(
                      width: 18, height: 18,
                      child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                  : const Text('Submit Consent Request',
                      style: TextStyle(fontWeight: FontWeight.w600)),
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF9C27B0),
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                elevation: 0,
              ),
            ),
          ),
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.amber.shade50,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: Colors.amber.shade200),
            ),
            child: Row(
              children: [
                Icon(Icons.info_outline_rounded, color: Colors.amber.shade700, size: 18),
                const SizedBox(width: 10),
                const Expanded(
                  child: Text(
                    'The HIU will receive your consent request and must approve it before accessing your health records.',
                    style: TextStyle(fontSize: 12, color: Color(0xFF5D4037)),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _pickDateRange() async {
    final picked = await showDateRangePicker(
      context: context,
      firstDate: DateTime(2000),
      lastDate: DateTime.now(),
      initialDateRange: _dateRange,
      builder: (ctx, child) => Theme(
        data: Theme.of(ctx).copyWith(
          colorScheme: const ColorScheme.light(primary: Color(0xFF7B6EF6)),
        ),
        child: child!,
      ),
    );
    if (picked != null) setState(() => _dateRange = picked);
  }

  void _submit() {
    context.read<AbdmCubit>().createConsentRequest(
      hiuId: _hiuCtrl.text.trim(),
      purpose: _purpose,
      hiTypes: _selectedHiTypes.toList(),
      dateFrom: _dateRange?.start,
      dateTo: _dateRange?.end,
    );
  }

  String _fmtDate(DateTime d) => '${d.day}/${d.month}/${d.year}';
}

class _SectionLabel extends StatelessWidget {
  final String text;
  const _SectionLabel(this.text);

  @override
  Widget build(BuildContext context) => Text(text,
      style: const TextStyle(
          fontWeight: FontWeight.w600, fontSize: 13, color: Color(0xFF5C5A8E)));
}

class _PurposeTile extends StatelessWidget {
  final String value;
  final String label;
  final bool selected;
  final VoidCallback onTap;
  const _PurposeTile({
    required this.value,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.only(bottom: 6),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: selected ? const Color(0xFF7B6EF6).withValues(alpha: 0.08) : Colors.white,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: selected ? const Color(0xFF7B6EF6) : Colors.grey.shade200,
            width: selected ? 1.5 : 1,
          ),
        ),
        child: Row(
          children: [
            Container(
              width: 18,
              height: 18,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(
                  color: selected ? const Color(0xFF7B6EF6) : Colors.grey.shade400,
                  width: 2,
                ),
                color: selected ? const Color(0xFF7B6EF6) : Colors.transparent,
              ),
              child: selected
                  ? const Icon(Icons.circle, color: Colors.white, size: 8)
                  : null,
            ),
            const SizedBox(width: 12),
            Text(label,
                style: TextStyle(
                    fontSize: 14,
                    color: selected ? const Color(0xFF2D2B55) : Colors.grey.shade700,
                    fontWeight: selected ? FontWeight.w600 : FontWeight.normal)),
          ],
        ),
      ),
    );
  }
}
