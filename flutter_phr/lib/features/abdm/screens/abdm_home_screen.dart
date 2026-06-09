import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import '../../../core/cubits/abdm_cubit.dart';
import '../../../core/constants/app_constants.dart';

class AbdmHomeScreen extends StatefulWidget {
  const AbdmHomeScreen({super.key});

  @override
  State<AbdmHomeScreen> createState() => _AbdmHomeScreenState();
}

class _AbdmHomeScreenState extends State<AbdmHomeScreen> {
  @override
  void initState() {
    super.initState();
    context.read<AbdmCubit>().checkAbhaStatus();
  }

  Future<void> _confirmLogout() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogCtx) => AlertDialog(
        title: const Text('Logout from ABHA?'),
        content: const Text(
            'This clears your ABHA session from this app. Your ABHA account on the ABDM system is not affected.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(dialogCtx, false),
              child: const Text('Cancel')),
          TextButton(
              onPressed: () => Navigator.pop(dialogCtx, true),
              style: TextButton.styleFrom(foregroundColor: Colors.red),
              child: const Text('Logout')),
        ],
      ),
    );
    if (confirmed == true && mounted) {
      context.read<AbdmCubit>().logoutAbha();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF5F4FF),
      appBar: AppBar(
        title: const Text('ABDM Health Locker',
            style: TextStyle(fontWeight: FontWeight.w700)),
        backgroundColor: Colors.transparent,
        elevation: 0,
        foregroundColor: const Color(0xFF7B6EF6),
        actions: [
          BlocBuilder<AbdmCubit, AbdmState>(
            buildWhen: (p, n) => p.hasAbha != n.hasAbha,
            builder: (ctx, state) => state.hasAbha
                ? IconButton(
                    icon: const Icon(Icons.logout_rounded),
                    tooltip: 'Logout from ABHA',
                    onPressed: _confirmLogout,
                  )
                : const SizedBox.shrink(),
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
          if (state.message != null) {
            ScaffoldMessenger.of(ctx).showSnackBar(
              SnackBar(content: Text(state.message!), backgroundColor: Colors.green.shade600),
            );
            ctx.read<AbdmCubit>().clearMessage();
          }
        },
        builder: (ctx, state) {
          return RefreshIndicator(
            onRefresh: () => ctx.read<AbdmCubit>().checkAbhaStatus(),
            child: ListView(
              padding: const EdgeInsets.all(20),
              children: [
                _AbhaStatusCard(state: state),
                const SizedBox(height: 24),
                _SectionHeader(title: 'Milestone 1 — ABHA Management'),
                const SizedBox(height: 12),
                _FeatureGrid(items: [
                  _FeatureItem(
                    icon: Icons.person_add_rounded,
                    label: 'Create ABHA',
                    subtitle: 'via Aadhaar or Mobile',
                    color: const Color(0xFF7B6EF6),
                    onTap: () => context.push(AppRoutes.abhaCreate),
                    disabled: state.hasAbha,
                  ),
                  _FeatureItem(
                    icon: Icons.credit_card_rounded,
                    label: 'ABHA Card',
                    subtitle: 'View & share',
                    color: const Color(0xFF4CAF82),
                    onTap: () => context.push(AppRoutes.abhaCard),
                    disabled: !state.hasAbha,
                  ),
                  _FeatureItem(
                    icon: Icons.login_rounded,
                    label: 'Link ABHA',
                    subtitle: 'Login with ABHA number',
                    color: const Color(0xFF2196F3),
                    onTap: () => context.push(AppRoutes.abhaCreate, extra: 'login'),
                    disabled: state.hasAbha,
                  ),
                ]),
                const SizedBox(height: 24),
                _SectionHeader(title: 'Milestone 2 — Health Records'),
                const SizedBox(height: 12),
                _FeatureGrid(items: [
                  _FeatureItem(
                    icon: Icons.link_rounded,
                    label: 'Link Records',
                    subtitle: 'Discover from hospitals',
                    color: const Color(0xFFFF9800),
                    onTap: () => context.push(AppRoutes.abdmLinkRecords),
                    disabled: !state.hasAbha,
                  ),
                  _FeatureItem(
                    icon: Icons.verified_user_rounded,
                    label: 'Consents',
                    subtitle: 'Manage data access',
                    color: const Color(0xFF9C27B0),
                    onTap: () => context.push(AppRoutes.abdmConsents),
                    disabled: !state.hasAbha,
                  ),
                ]),
                const SizedBox(height: 24),
                _SectionHeader(title: 'Milestone 3 — Health Data Exchange'),
                const SizedBox(height: 12),
                _FeatureGrid(items: [
                  _FeatureItem(
                    icon: Icons.folder_shared_rounded,
                    label: 'Health Records',
                    subtitle: 'View fetched FHIR data',
                    color: const Color(0xFFF44336),
                    onTap: () => context.push(AppRoutes.abdmHealthRecords),
                    disabled: !state.hasAbha,
                  ),
                ]),
                const SizedBox(height: 40),
                _AbdmInfoBanner(),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _AbhaStatusCard extends StatelessWidget {
  final AbdmState state;
  const _AbhaStatusCard({required this.state});

  @override
  Widget build(BuildContext context) {
    final hasAbha = state.hasAbha;
    final isLoading = state.status == AbdmStatus.loading;
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: hasAbha
              ? [const Color(0xFF7B6EF6), const Color(0xFF9C8FFF)]
              : [const Color(0xFF78909C), const Color(0xFF90A4AE)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
            color: (hasAbha ? const Color(0xFF7B6EF6) : Colors.grey).withValues(alpha: 0.3),
            blurRadius: 16,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Row(
        children: [
          Container(
            width: 56,
            height: 56,
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.2),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Icon(
              hasAbha ? Icons.health_and_safety_rounded : Icons.health_and_safety_outlined,
              color: Colors.white,
              size: 30,
            ),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  hasAbha ? 'ABHA Linked' : 'ABHA Not Linked',
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w700,
                    fontSize: 18,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  hasAbha
                      ? (state.abhaAccount?.formattedAbhaNumber ?? state.abhaAccount?.abhaAddress ?? '')
                      : 'Create your Ayushman Bharat Health Account',
                  style: TextStyle(
                    color: Colors.white.withValues(alpha: 0.85),
                    fontSize: 13,
                  ),
                ),
                if (hasAbha && state.abhaAccount?.name != null) ...[
                  const SizedBox(height: 2),
                  Text(
                    state.abhaAccount!.name!,
                    style: TextStyle(
                      color: Colors.white.withValues(alpha: 0.9),
                      fontSize: 13,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ],
            ),
          ),
          if (isLoading)
            const SizedBox(
              width: 20,
              height: 20,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
              ),
            )
          else if (hasAbha)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.2),
                borderRadius: BorderRadius.circular(20),
              ),
              child: const Text('Active',
                  style: TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w600)),
            ),
        ],
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  final String title;
  const _SectionHeader({required this.title});

  @override
  Widget build(BuildContext context) => Row(
        children: [
          Container(
            width: 4,
            height: 18,
            decoration: BoxDecoration(
              color: const Color(0xFF7B6EF6),
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          const SizedBox(width: 8),
          Text(title,
              style: const TextStyle(
                  fontWeight: FontWeight.w700, fontSize: 15, color: Color(0xFF2D2B55))),
        ],
      );
}

class _FeatureItem {
  final IconData icon;
  final String label;
  final String subtitle;
  final Color color;
  final VoidCallback onTap;
  final bool disabled;
  const _FeatureItem({
    required this.icon,
    required this.label,
    required this.subtitle,
    required this.color,
    required this.onTap,
    this.disabled = false,
  });
}

class _FeatureGrid extends StatelessWidget {
  final List<_FeatureItem> items;
  const _FeatureGrid({required this.items});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: items
          .map((item) => Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: _FeatureCard(item: item),
              ))
          .toList(),
    );
  }
}

class _FeatureCard extends StatelessWidget {
  final _FeatureItem item;
  const _FeatureCard({required this.item});

  @override
  Widget build(BuildContext context) {
    return Opacity(
      opacity: item.disabled ? 0.45 : 1.0,
      child: InkWell(
        onTap: item.disabled ? null : item.onTap,
        borderRadius: BorderRadius.circular(16),
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(16),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.05),
                blurRadius: 8,
                offset: const Offset(0, 2),
              ),
            ],
          ),
          child: Row(
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: item.color.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(item.icon, color: item.color, size: 24),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(item.label,
                        style: const TextStyle(
                            fontWeight: FontWeight.w600, fontSize: 15, color: Color(0xFF2D2B55))),
                    Text(item.subtitle,
                        style: const TextStyle(fontSize: 12, color: Colors.grey)),
                  ],
                ),
              ),
              Icon(Icons.arrow_forward_ios_rounded, size: 16, color: Colors.grey.shade400),
            ],
          ),
        ),
      ),
    );
  }
}

class _AbdmInfoBanner extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF7B6EF6).withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFF7B6EF6).withValues(alpha: 0.2)),
      ),
      child: Row(
        children: [
          const Icon(Icons.info_outline_rounded, color: Color(0xFF7B6EF6), size: 20),
          const SizedBox(width: 12),
          const Expanded(
            child: Text(
              'ABDM (Ayushman Bharat Digital Mission) enables you to store, access, and share your health records securely.',
              style: TextStyle(fontSize: 12, color: Color(0xFF5C5A8E)),
            ),
          ),
        ],
      ),
    );
  }
}
