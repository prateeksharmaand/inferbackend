import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../core/cubits/documents_cubit.dart';
import '../../../core/cubits/gmail_sync_cubit.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/constants/app_constants.dart';
import '../../../core/models/document_model.dart';
import '../../../core/widgets/shimmer_widgets.dart';


class DocumentsScreen extends StatefulWidget {
  const DocumentsScreen({super.key});
  @override
  State<DocumentsScreen> createState() => _DocumentsScreenState();
}

class _DocumentsScreenState extends State<DocumentsScreen> {
  Timer? _pollTimer;
  Timer? _gmailPollTimer;

  @override
  void initState() {
    super.initState();
    Future.microtask(() {
      context.read<DocumentsCubit>().loadDocuments();
      context.read<GmailSyncCubit>().loadStatus();
      _startPolling();
    });
  }

  void _startPolling() {
    _pollTimer = Timer.periodic(const Duration(seconds: 20), (_) {
      if (!mounted) return;
      final docs = context.read<DocumentsCubit>().state.documents;
      final hasPending = docs.any((d) => d.extractedVitals == null);
      if (hasPending) context.read<DocumentsCubit>().silentRefresh();
    });
  }

  // Called while waiting for the user to complete Google OAuth in browser
  void _startGmailConnectionPoll() {
    _gmailPollTimer?.cancel();
    _gmailPollTimer = Timer.periodic(const Duration(seconds: 4), (_) async {
      if (!mounted) return;
      await context.read<GmailSyncCubit>().loadStatus();
      if (context.read<GmailSyncCubit>().state.status == GmailStatus.connected) {
        _gmailPollTimer?.cancel();
        if (mounted) context.read<DocumentsCubit>().loadDocuments();
      }
    });
    // Stop polling after 5 minutes regardless
    Future.delayed(const Duration(minutes: 5), () => _gmailPollTimer?.cancel());
  }

  Future<void> _connectGmail() async {
    final url = await context.read<GmailSyncCubit>().getAuthUrl();
    if (url == null || !mounted) return;
    final uri = Uri.parse(url);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
      _startGmailConnectionPoll();
    } else {
      await launchUrl(uri, mode: LaunchMode.platformDefault);
      _startGmailConnectionPoll();
    }
  }

  Future<void> _syncNow() async {
    final count = await context.read<GmailSyncCubit>().triggerSync();
    if (!mounted) return;
    if (count > 0) context.read<DocumentsCubit>().loadDocuments();
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(count > 0 ? 'Imported $count new report${count == 1 ? '' : 's'} from Gmail' : 'No new reports found'),
    ));
  }

  void _showFilterSheet(DocumentsState docs) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => BlocProvider.value(
        value: context.read<DocumentsCubit>(),
        child: const _FilterSheet(),
      ),
    );
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    _gmailPollTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final docs = context.watch<DocumentsCubit>().state;
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text('Medical Documents'),
        actions: [
          IconButton(
            icon: Stack(clipBehavior: Clip.none, children: [
              const Icon(Icons.tune_rounded),
              if (docs.hasActiveFilters)
                Positioned(
                  right: -2, top: -2,
                  child: Container(
                    width: 8, height: 8,
                    decoration: const BoxDecoration(color: AppColors.primary, shape: BoxShape.circle),
                  ),
                ),
            ]),
            tooltip: 'Sort & Filter',
            onPressed: () => _showFilterSheet(docs),
          ),
        ],
      ),
      body: Column(children: [
        Padding(padding: const EdgeInsets.fromLTRB(16, 16, 16, 12), child: Column(children: [
          TextField(decoration: InputDecoration(hintText: 'Search documents...', prefixIcon: const Icon(Icons.search_outlined, color: AppColors.textHint), border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)), filled: true, fillColor: AppColors.surface),
            onChanged: (v) => context.read<DocumentsCubit>().setSearchQuery(v)),
          const SizedBox(height: 12),
          SizedBox(height: 36, child: ListView(scrollDirection: Axis.horizontal, children: [
            _filterChip(context, 'All', null, docs.filterType),
            ...AppConstants.documentTypes.take(6).map((t) => _filterChip(context, t, t, docs.filterType)),
          ])),
        ])),
        // Gmail sync banner
        BlocBuilder<GmailSyncCubit, GmailSyncState>(
          builder: (context, gmail) => _GmailSyncBanner(
            state: gmail,
            onConnect: _connectGmail,
            onSync: _syncNow,
            onDisconnect: () => context.read<GmailSyncCubit>().disconnect(),
          ),
        ),
        Expanded(child: RefreshIndicator(
          color: AppColors.primary,
          onRefresh: () => context.read<DocumentsCubit>().loadDocuments(),
          child: docs.isLoading
            ? GridView.builder(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 2,
                  crossAxisSpacing: 12,
                  mainAxisSpacing: 12,
                  childAspectRatio: 0.78,
                ),
                itemCount: 6,
                itemBuilder: (_, __) => const ShimmerDocumentGridTile(),
              )
            : docs.filteredDocuments.isEmpty
              ? SingleChildScrollView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  child: SizedBox(
                    height: MediaQuery.of(context).size.height * 0.5,
                    child: _buildEmpty(context),
                  ),
                )
              : GridView.builder(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 2,
                    crossAxisSpacing: 12,
                    mainAxisSpacing: 12,
                    childAspectRatio: 0.78,
                  ),
                  itemCount: docs.filteredDocuments.length,
                  itemBuilder: (_, i) => _DocumentCard(doc: docs.filteredDocuments[i]),
                ),
        )),
      ]),
      floatingActionButton: FloatingActionButton(onPressed: () => context.push('${AppRoutes.documents}/upload'),
        backgroundColor: AppColors.primary, child: const Icon(Icons.add, color: Colors.white)),
    );
  }

  Widget _filterChip(BuildContext context, String label, String? type, String? selected) => Padding(
    padding: const EdgeInsets.only(right: 8),
    child: FilterChip(
      label: Text(label, style: TextStyle(fontFamily: 'Poppins', fontSize: 12, color: selected == type ? AppColors.primary : AppColors.textSecondary)),
      selected: selected == type,
      onSelected: (_) => context.read<DocumentsCubit>().setFilterType(type),
      backgroundColor: AppColors.surface, selectedColor: AppColors.primaryLight,
      checkmarkColor: AppColors.primary, showCheckmark: true,
    ),
  );

  Widget _buildEmpty(BuildContext context) => Center(child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
    const Icon(Icons.folder_open_outlined, size: 64, color: AppColors.textHint),
    const SizedBox(height: 16),
    const Text('No Documents Yet', style: AppTextStyles.h4),
    const SizedBox(height: 8),
    const Text('Upload your medical records to get started', style: AppTextStyles.body2),
    const SizedBox(height: 24),
    ElevatedButton.icon(icon: const Icon(Icons.upload_file), label: const Text('Upload Document'),
      onPressed: () => context.push('${AppRoutes.documents}/upload')),
  ]));
}

// ─── Gmail Sync Banner ────────────────────────────────────────────────────────

class _GmailSyncBanner extends StatelessWidget {
  final GmailSyncState state;
  final VoidCallback onConnect;
  final VoidCallback onSync;
  final VoidCallback onDisconnect;

  const _GmailSyncBanner({
    required this.state,
    required this.onConnect,
    required this.onSync,
    required this.onDisconnect,
  });

  static final _fmt = DateFormat('dd MMM, hh:mm a');

  @override
  Widget build(BuildContext context) {
    if (state.status == GmailStatus.unknown) return const SizedBox.shrink();

    if (state.status == GmailStatus.disconnected) {
      return Padding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
        child: InkWell(
          onTap: onConnect,
          borderRadius: BorderRadius.circular(14),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
            decoration: BoxDecoration(
              color: AppColors.primaryLight,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: AppColors.primary.withValues(alpha: 0.25)),
            ),
            child: Row(children: [
              const Icon(Icons.mail_outline_rounded, color: AppColors.primary, size: 20),
              const SizedBox(width: 10),
              const Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('Connect Gmail', style: TextStyle(fontFamily: 'Poppins', fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.primary)),
                  Text('Auto-import medical reports from your inbox', style: TextStyle(fontFamily: 'Poppins', fontSize: 11, color: AppColors.textSecondary)),
                ]),
              ),
              const Icon(Icons.arrow_forward_ios_rounded, size: 13, color: AppColors.primary),
            ]),
          ),
        ),
      );
    }

    // Connected state
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
      child: Container(
        padding: const EdgeInsets.fromLTRB(14, 10, 10, 10),
        decoration: BoxDecoration(
          color: AppColors.successLight,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: AppColors.success.withValues(alpha: 0.3)),
        ),
        child: Row(children: [
          const Icon(Icons.mark_email_read_outlined, color: AppColors.success, size: 20),
          const SizedBox(width: 10),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(state.email ?? 'Gmail', style: const TextStyle(fontFamily: 'Poppins', fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.textPrimary), overflow: TextOverflow.ellipsis),
              Text(
                state.lastSyncedAt != null ? 'Synced ${_fmt.format(state.lastSyncedAt!)}' : 'Auto-sync active',
                style: const TextStyle(fontFamily: 'Poppins', fontSize: 10, color: AppColors.textSecondary),
              ),
            ]),
          ),
          if (state.isSyncing)
            const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.primary))
          else
            TextButton(
              onPressed: onSync,
              style: TextButton.styleFrom(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                minimumSize: Size.zero, tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              ),
              child: const Text('Sync Now', style: TextStyle(fontFamily: 'Poppins', fontSize: 12, fontWeight: FontWeight.w600)),
            ),
          IconButton(
            icon: const Icon(Icons.link_off_rounded, size: 18, color: AppColors.textHint),
            onPressed: onDisconnect,
            padding: EdgeInsets.zero,
            constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
            tooltip: 'Disconnect Gmail',
          ),
        ]),
      ),
    );
  }
}

class _DocumentCard extends StatelessWidget {
  final DocumentModel doc;
  const _DocumentCard({required this.doc});

  static final _dateFmt = DateFormat('dd MMM yyyy');

  static IconData _typeIcon(String type) {
    switch (type) {
      case 'Lab Report':        return Icons.science_outlined;
      case 'Prescription':      return Icons.medication_outlined;
      case 'Radiology Report':  return Icons.image_search_outlined;
      case 'Discharge Summary': return Icons.local_hospital_outlined;
      default:                  return Icons.description_outlined;
    }
  }

  @override
  Widget build(BuildContext context) {
    final hasVitals = doc.extractedVitals != null && doc.extractedVitals!.isNotEmpty;

    return Material(
      color: AppColors.surface,
      borderRadius: BorderRadius.circular(16),
      elevation: 0,
      child: InkWell(
        onTap: () => context.push(AppRoutes.documentReport, extra: doc),
        borderRadius: BorderRadius.circular(16),
        child: Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: AppColors.border, width: 1),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Icon header
              Container(
                width: double.infinity,
                height: 88,
                decoration: const BoxDecoration(
                  color: AppColors.primaryLight,
                  borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
                ),
                child: Center(
                  child: Icon(_typeIcon(doc.type), color: AppColors.primary, size: 36),
                ),
              ),
              // Content
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(10, 8, 10, 10),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Type badge
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(
                          color: AppColors.primaryLight,
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Text(
                          doc.type,
                          style: AppTextStyles.caption.copyWith(
                            color: AppColors.primary, fontWeight: FontWeight.w600, fontSize: 9,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      const SizedBox(height: 5),
                      // Title
                      Text(
                        doc.title,
                        style: AppTextStyles.body2.copyWith(fontWeight: FontWeight.w600),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 3),
                      // Date
                      Text(
                        _dateFmt.format(doc.uploadedAt.toLocal()),
                        style: AppTextStyles.caption.copyWith(fontSize: 10),
                      ),
                      if (doc.doctorName != null) ...[
                        const SizedBox(height: 1),
                        Text(
                          doc.doctorName!,
                          style: AppTextStyles.caption.copyWith(fontSize: 10),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                      const Spacer(),
                      if (doc.extractedVitals == null)
                        const _GeneratingChip()
                      else if (hasVitals)
                        _SmartChip(count: doc.extractedVitals!.length),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _GeneratingChip extends StatelessWidget {
  const _GeneratingChip();

  @override
  Widget build(BuildContext context) => PHRShimmer(
    child: Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 4),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: const Color(0xFFD0C8FF), width: 1),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 7, height: 7,
            decoration: const BoxDecoration(
              color: Color(0xFFB8B0EE),
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: 4),
          const Text(
            'Generating Smart Vitals...',
            style: TextStyle(
              fontFamily: 'Poppins', fontSize: 8,
              fontWeight: FontWeight.w600, color: Color(0xFFB8B0EE),
            ),
          ),
        ],
      ),
    ),
  );
}

class _SmartChip extends StatelessWidget {
  final int count;
  const _SmartChip({required this.count});

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
    decoration: BoxDecoration(
      gradient: const LinearGradient(colors: AppColors.primaryGradient),
      borderRadius: BorderRadius.circular(20),
    ),
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        const Icon(Icons.auto_awesome, size: 9, color: Colors.white),
        const SizedBox(width: 3),
        Text(
          'Smart · $count vitals',
          style: const TextStyle(
            fontFamily: 'Poppins', fontSize: 9,
            fontWeight: FontWeight.w700, color: Colors.white,
          ),
        ),
      ],
    ),
  );
}

// ─── Filter / Sort Sheet ──────────────────────────────────────────────────────

class _FilterSheet extends StatelessWidget {
  const _FilterSheet();

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<DocumentsCubit, DocumentsState>(
      builder: (context, state) {
        final cubit = context.read<DocumentsCubit>();
        final tags = state.allTags.toList()..sort();

        return Container(
          decoration: const BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
          ),
          padding: EdgeInsets.fromLTRB(20, 0, 20, MediaQuery.of(context).viewInsets.bottom + 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Handle bar
              Center(
                child: Container(
                  margin: const EdgeInsets.symmetric(vertical: 12),
                  width: 40, height: 4,
                  decoration: BoxDecoration(
                    color: AppColors.border,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),

              // Header
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text('Sort & Filter', style: AppTextStyles.h4),
                  if (state.hasActiveFilters)
                    TextButton(
                      onPressed: cubit.clearFilters,
                      style: TextButton.styleFrom(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        minimumSize: Size.zero,
                        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                      ),
                      child: const Text('Clear All',
                        style: TextStyle(fontFamily: 'Poppins', fontSize: 13,
                          fontWeight: FontWeight.w600, color: AppColors.error)),
                    ),
                ],
              ),
              const SizedBox(height: 20),

              // ── Sort by Date ──
              const Text('SORT BY DATE', style: AppTextStyles.label),
              const SizedBox(height: 10),
              Row(children: [
                Expanded(child: _SortOption(
                  icon: Icons.arrow_downward_rounded,
                  label: 'Newest First',
                  selected: state.sortOrder == 'newest',
                  onTap: () => cubit.setSortOrder('newest'),
                )),
                const SizedBox(width: 12),
                Expanded(child: _SortOption(
                  icon: Icons.arrow_upward_rounded,
                  label: 'Oldest First',
                  selected: state.sortOrder == 'oldest',
                  onTap: () => cubit.setSortOrder('oldest'),
                )),
              ]),

              // ── Filter by Tag ──
              if (tags.isNotEmpty) ...[
                const SizedBox(height: 24),
                Row(children: [
                  const Text('FILTER BY TAG', style: AppTextStyles.label),
                  const SizedBox(width: 8),
                  if (state.filterTags.isNotEmpty)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                      decoration: BoxDecoration(
                        color: AppColors.primary,
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Text('${state.filterTags.length}',
                        style: const TextStyle(fontFamily: 'Poppins', fontSize: 10,
                          fontWeight: FontWeight.w700, color: Colors.white)),
                    ),
                ]),
                const SizedBox(height: 10),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: tags.map((tag) {
                    final selected = state.filterTags.contains(tag);
                    return GestureDetector(
                      onTap: () => cubit.toggleFilterTag(tag),
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 180),
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                        decoration: BoxDecoration(
                          color: selected ? AppColors.primary : AppColors.surfaceVariant,
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(
                            color: selected ? AppColors.primary : AppColors.border,
                          ),
                        ),
                        child: Row(mainAxisSize: MainAxisSize.min, children: [
                          if (selected) ...[
                            const Icon(Icons.check_rounded, size: 13, color: Colors.white),
                            const SizedBox(width: 5),
                          ],
                          Text(tag, style: TextStyle(
                            fontFamily: 'Poppins', fontSize: 13, fontWeight: FontWeight.w500,
                            color: selected ? Colors.white : AppColors.textSecondary,
                          )),
                        ]),
                      ),
                    );
                  }).toList(),
                ),
              ] else ...[
                const SizedBox(height: 24),
                const Text('FILTER BY TAG', style: AppTextStyles.label),
                const SizedBox(height: 10),
                const Text('No tags found on your documents yet.',
                  style: AppTextStyles.caption),
              ],

              const SizedBox(height: 24),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: () => Navigator.of(context).pop(),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                    textStyle: const TextStyle(fontFamily: 'Poppins', fontSize: 14, fontWeight: FontWeight.w600),
                  ),
                  child: Text(state.hasActiveFilters ? 'Apply Filters' : 'Done'),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _SortOption extends StatelessWidget {
  final IconData icon;
  final String label;
  final bool selected;
  final VoidCallback onTap;
  const _SortOption({required this.icon, required this.label, required this.selected, required this.onTap});

  @override
  Widget build(BuildContext context) => GestureDetector(
    onTap: onTap,
    child: AnimatedContainer(
      duration: const Duration(milliseconds: 180),
      padding: const EdgeInsets.symmetric(vertical: 12),
      decoration: BoxDecoration(
        color: selected ? AppColors.primary : AppColors.surfaceVariant,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: selected ? AppColors.primary : AppColors.border),
      ),
      child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
        Icon(icon, size: 16, color: selected ? Colors.white : AppColors.textSecondary),
        const SizedBox(width: 8),
        Text(label, style: TextStyle(
          fontFamily: 'Poppins', fontSize: 13, fontWeight: FontWeight.w600,
          color: selected ? Colors.white : AppColors.textSecondary,
        )),
      ]),
    ),
  );
}

