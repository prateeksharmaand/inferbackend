import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../../core/cubits/abdm_cubit.dart';
import '../../../core/models/abha_model.dart';

class LinkRecordsScreen extends StatefulWidget {
  const LinkRecordsScreen({super.key});

  @override
  State<LinkRecordsScreen> createState() => _LinkRecordsScreenState();
}

class _LinkRecordsScreenState extends State<LinkRecordsScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabs;

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 2, vsync: this);
    context.read<AbdmCubit>().loadLinkedCareContexts();
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
        title: const Text('Health Records', style: TextStyle(fontWeight: FontWeight.w700)),
        backgroundColor: Colors.transparent,
        elevation: 0,
        foregroundColor: const Color(0xFF7B6EF6),
        bottom: TabBar(
          controller: _tabs,
          labelColor: const Color(0xFF7B6EF6),
          unselectedLabelColor: Colors.grey,
          indicatorColor: const Color(0xFF7B6EF6),
          tabs: const [
            Tab(text: 'Linked Records'),
            Tab(text: 'Discover & Link'),
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
          }
        },
        builder: (ctx, state) => TabBarView(
          controller: _tabs,
          children: [
            _LinkedTab(state: state),
            _DiscoverTab(state: state),
          ],
        ),
      ),
    );
  }
}

// ── Linked records tab ─────────────────────────────────────────────────────────

class _LinkedTab extends StatelessWidget {
  final AbdmState state;
  const _LinkedTab({required this.state});

  @override
  Widget build(BuildContext context) {
    if (state.status == AbdmStatus.loading && state.careContexts.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }
    if (state.careContexts.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.folder_open_rounded, size: 64, color: Colors.grey.shade300),
            const SizedBox(height: 16),
            const Text('No linked records yet',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: Colors.grey)),
            const SizedBox(height: 8),
            const Text('Discover records from the "Discover & Link" tab',
                style: TextStyle(fontSize: 13, color: Colors.grey), textAlign: TextAlign.center),
          ],
        ),
      );
    }

    final grouped = <String, List<CareContext>>{};
    for (final ctx in state.careContexts) {
      grouped.putIfAbsent(ctx.hipId, () => []).add(ctx);
    }

    return RefreshIndicator(
      onRefresh: () => context.read<AbdmCubit>().loadLinkedCareContexts(),
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text('${state.careContexts.length} record(s) linked',
              style: const TextStyle(
                  fontSize: 13, color: Colors.grey, fontWeight: FontWeight.w500)),
          const SizedBox(height: 12),
          ...grouped.entries.map((e) => _FacilityGroup(hipId: e.key, contexts: e.value)),
        ],
      ),
    );
  }
}

class _FacilityGroup extends StatelessWidget {
  final String hipId;
  final List<CareContext> contexts;
  const _FacilityGroup({required this.hipId, required this.contexts});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
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
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: const Color(0xFFFF9800).withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: const Icon(Icons.local_hospital_rounded,
                      color: Color(0xFFFF9800), size: 22),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(hipId,
                          style: const TextStyle(
                              fontWeight: FontWeight.w700,
                              fontSize: 14,
                              color: Color(0xFF2D2B55))),
                      Text('${contexts.length} record(s)',
                          style: const TextStyle(fontSize: 12, color: Colors.grey)),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const Divider(height: 1),
          ...contexts.map((c) => _CareContextTile(ctx: c)),
        ],
      ),
    );
  }
}

class _CareContextTile extends StatelessWidget {
  final CareContext ctx;
  const _CareContextTile({required this.ctx});

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: _hiTypeIcon(ctx.hiType),
      title: Text(ctx.display,
          style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500)),
      subtitle: Text(ctx.hiType, style: const TextStyle(fontSize: 12)),
      trailing: ctx.linkedAt != null
          ? Text(
              '${ctx.linkedAt!.day}/${ctx.linkedAt!.month}/${ctx.linkedAt!.year}',
              style: const TextStyle(fontSize: 11, color: Colors.grey),
            )
          : null,
    );
  }

  Widget _hiTypeIcon(String hiType) {
    final data = {
      'Prescription': (Icons.medication_rounded, Color(0xFF4CAF82)),
      'DiagnosticReport': (Icons.biotech_rounded, Color(0xFF2196F3)),
      'DischargeSummary': (Icons.summarize_rounded, Color(0xFF9C27B0)),
      'OPConsultation': (Icons.medical_services_rounded, Color(0xFFFF9800)),
      'ImmunizationRecord': (Icons.vaccines_rounded, Color(0xFF4CAF50)),
      'WellnessRecord': (Icons.favorite_rounded, Color(0xFFF44336)),
    };
    final (icon, color) = data[hiType] ?? (Icons.description_rounded, Colors.grey);
    return Container(
      width: 36,
      height: 36,
      decoration: BoxDecoration(
          color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(8)),
      child: Icon(icon, color: color, size: 18),
    );
  }
}

// ── Discover tab ───────────────────────────────────────────────────────────────

class _DiscoverTab extends StatefulWidget {
  final AbdmState state;
  const _DiscoverTab({required this.state});

  @override
  State<_DiscoverTab> createState() => _DiscoverTabState();
}

class _DiscoverTabState extends State<_DiscoverTab> {
  // Pre-filled with the known HIP ID; user can change for other facilities
  final _hipCtrl = TextEditingController(text: 'noushealthhip');
  final Set<int> _selected = {};

  @override
  void dispose() {
    _hipCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final loading = widget.state.status == AbdmStatus.loading;
    final discovered = widget.state.discoveredContexts;

    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Info banner
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: const Color(0xFF7B6EF6).withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: const Color(0xFF7B6EF6).withValues(alpha: 0.2)),
            ),
            child: Row(
              children: [
                const Icon(Icons.info_outline_rounded, color: Color(0xFF7B6EF6), size: 18),
                const SizedBox(width: 10),
                const Expanded(
                  child: Text(
                    'Enter a Health Facility ID to find your records at that facility.',
                    style: TextStyle(fontSize: 12, color: Color(0xFF5C5A8E)),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
          _Field(ctrl: _hipCtrl, hint: 'e.g. noushealthhip', label: 'Health Facility ID (HIP ID)'),
          const SizedBox(height: 20),
          SizedBox(
            width: double.infinity,
            height: 50,
            child: ElevatedButton.icon(
              onPressed: loading ? null : _discover,
              icon: loading && discovered.isEmpty
                  ? const SizedBox(
                      width: 18, height: 18,
                      child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                  : const Icon(Icons.search_rounded),
              label: const Text('Find My Records',
                  style: TextStyle(fontWeight: FontWeight.w600)),
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF7B6EF6),
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                elevation: 0,
              ),
            ),
          ),

          if (discovered.isNotEmpty) ...[
            const SizedBox(height: 24),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('${discovered.length} record(s) found',
                    style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15)),
                TextButton(
                  onPressed: () => setState(() {
                    if (_selected.length == discovered.length) {
                      _selected.clear();
                    } else {
                      _selected.addAll(List.generate(discovered.length, (i) => i));
                    }
                  }),
                  child: Text(
                    _selected.length == discovered.length ? 'Deselect All' : 'Select All',
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            ...discovered.asMap().entries.map((e) => _DiscoveredTile(
                  ctx: e.value,
                  selected: _selected.contains(e.key),
                  onToggle: () => setState(() {
                    if (_selected.contains(e.key)) {
                      _selected.remove(e.key);
                    } else {
                      _selected.add(e.key);
                    }
                  }),
                )),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              height: 50,
              child: ElevatedButton.icon(
                onPressed: _selected.isEmpty || loading ? null : _linkSelected,
                icon: loading && widget.state.linkStep == LinkStep.initiating
                    ? const SizedBox(width: 18, height: 18,
                        child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                    : const Icon(Icons.link_rounded),
                label: Text(
                  widget.state.linkStep == LinkStep.initiating
                      ? 'Linking...'
                      : 'Link ${_selected.length} Record(s)',
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF4CAF82),
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                  elevation: 0,
                ),
              ),
            ),
          ],

          if (widget.state.status == AbdmStatus.success &&
              discovered.isEmpty &&
              widget.state.message != null) ...[
            const SizedBox(height: 32),
            Center(
              child: Column(
                children: [
                  Icon(Icons.search_off_rounded, size: 48, color: Colors.grey.shade300),
                  const SizedBox(height: 12),
                  Text(widget.state.message!,
                      style: const TextStyle(color: Colors.grey, fontSize: 14)),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  void _discover() {
    if (_hipCtrl.text.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Enter HIP ID')));
      return;
    }
    setState(() => _selected.clear());
    context.read<AbdmCubit>().discoverCareContexts(hipId: _hipCtrl.text.trim());
  }

  void _linkSelected() {
    final selectedCtx = _selected.map((i) => widget.state.discoveredContexts[i]).toList();
    context.read<AbdmCubit>().initiateLink(selectedCtx);
  }
}

class _DiscoveredTile extends StatelessWidget {
  final CareContext ctx;
  final bool selected;
  final VoidCallback onToggle;
  const _DiscoveredTile({required this.ctx, required this.selected, required this.onToggle});

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 0,
      margin: const EdgeInsets.only(bottom: 8),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(
          color: selected ? const Color(0xFF7B6EF6) : Colors.grey.shade200,
          width: selected ? 2 : 1,
        ),
      ),
      child: ListTile(
        leading: Checkbox(
          value: selected,
          onChanged: (_) => onToggle(),
          activeColor: const Color(0xFF7B6EF6),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(4)),
        ),
        title: Text(ctx.display, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500)),
        subtitle: Text(ctx.hiType, style: const TextStyle(fontSize: 12)),
        onTap: onToggle,
      ),
    );
  }
}

class _Field extends StatelessWidget {
  final TextEditingController ctrl;
  final String hint;
  final String label;
  const _Field({required this.ctrl, required this.hint, required this.label});

  @override
  Widget build(BuildContext context) => TextField(
        controller: ctrl,
        decoration: InputDecoration(
          labelText: label,
          hintText: hint,
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
          contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        ),
      );
}
