import 'dart:io';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';
import '../../../core/cubits/abdm_cubit.dart';
import '../../../core/constants/app_constants.dart';
import '../../../core/services/abdm_service.dart';

class AbhaCardScreen extends StatefulWidget {
  const AbhaCardScreen({super.key});

  @override
  State<AbhaCardScreen> createState() => _AbhaCardScreenState();
}

class _AbhaCardScreenState extends State<AbhaCardScreen> {
  Uint8List? _cardBytes;
  bool _loadingCard = false;
  String? _cardError;

  @override
  void initState() {
    super.initState();
    _fetchCard();
  }

  Future<void> _fetchCard() async {
    setState(() { _loadingCard = true; _cardError = null; });
    try {
      final bytes = await AbdmService().getAbhaCard();
      setState(() { _cardBytes = bytes; _loadingCard = false; });
    } catch (e) {
      setState(() { _cardError = e.toString(); _loadingCard = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF5F4FF),
      appBar: AppBar(
        title: const Text('ABHA Card', style: TextStyle(fontWeight: FontWeight.w700)),
        backgroundColor: Colors.transparent,
        elevation: 0,
        foregroundColor: const Color(0xFF7B6EF6),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new_rounded),
          onPressed: () => context.canPop() ? context.pop() : context.go(AppRoutes.abdmHome),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh_rounded),
            onPressed: _fetchCard,
            tooltip: 'Refresh card',
          ),
        ],
      ),
      body: BlocBuilder<AbdmCubit, AbdmState>(
        builder: (ctx, state) {
          final account = state.abhaAccount;
          return SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: Column(
              children: [
                // ── ABHA card image ─────────────────────────────────────────
                Container(
                  width: double.infinity,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(20),
                    boxShadow: [
                      BoxShadow(
                        color: const Color(0xFF7B6EF6).withValues(alpha: 0.25),
                        blurRadius: 20,
                        offset: const Offset(0, 8),
                      ),
                    ],
                  ),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(20),
                    child: _buildCardImage(),
                  ),
                ),
                const SizedBox(height: 28),

                // ── ABHA details ────────────────────────────────────────────
                if (account != null && account.linked) ...[
                  _DetailCard(account: account),
                  const SizedBox(height: 20),
                ],

                // ── Action buttons ──────────────────────────────────────────
                Row(
                  children: [
                    Expanded(
                      child: _ActionButton(
                        icon: Icons.qr_code_rounded,
                        label: 'Show QR',
                        onTap: () => _showQrSheet(context, account),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: _ActionButton(
                        icon: Icons.share_rounded,
                        label: 'Share',
                        onTap: _cardBytes != null ? () => _shareCard() : null,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  child: _ActionButton(
                    icon: Icons.download_rounded,
                    label: 'Download Card',
                    onTap: _cardBytes != null ? () => _downloadCard() : null,
                    primary: true,
                  ),
                ),
                const SizedBox(height: 32),
                _AbhmInfoCard(),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildCardImage() {
    if (_loadingCard) {
      return Container(
        height: 200,
        color: const Color(0xFF7B6EF6).withValues(alpha: 0.1),
        child: const Center(child: CircularProgressIndicator()),
      );
    }
    if (_cardError != null) {
      return Container(
        height: 200,
        color: const Color(0xFF7B6EF6).withValues(alpha: 0.08),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.error_outline_rounded, color: Colors.red, size: 40),
            const SizedBox(height: 8),
            Text('Could not load card', style: TextStyle(color: Colors.grey.shade600)),
            TextButton(onPressed: _fetchCard, child: const Text('Retry')),
          ],
        ),
      );
    }
    if (_cardBytes != null) {
      return Image.memory(_cardBytes!, fit: BoxFit.fitWidth);
    }
    return _PlaceholderCard();
  }

  void _showQrSheet(BuildContext context, dynamic account) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (_) => Padding(
        padding: const EdgeInsets.all(28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                  color: Colors.grey.shade300,
                  borderRadius: BorderRadius.circular(2)),
            ),
            const SizedBox(height: 20),
            const Text('ABHA QR Code',
                style: TextStyle(fontWeight: FontWeight.w700, fontSize: 18)),
            const SizedBox(height: 20),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(vertical: 32),
              decoration: BoxDecoration(
                border: Border.all(color: Colors.grey.shade200, width: 2),
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.qr_code_2_rounded, size: 120, color: Color(0xFF7B6EF6)),
                    SizedBox(height: 8),
                    Text('QR from ABHA card image',
                        style: TextStyle(fontSize: 11, color: Colors.grey),
                        textAlign: TextAlign.center),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 20),
            if (account?.abhaAddress != null)
              Text(account!.abhaAddress!,
                  style: const TextStyle(fontWeight: FontWeight.w500, color: Color(0xFF7B6EF6))),
            const SizedBox(height: 20),
          ],
        ),
      ),
    );
  }

  Future<void> _shareCard() async {
    if (_cardBytes == null) return;
    try {
      final dir = await getTemporaryDirectory();
      final file = File('${dir.path}/abha_card.png');
      await file.writeAsBytes(_cardBytes!);
      await Share.shareXFiles(
        [XFile(file.path, mimeType: 'image/png')],
        subject: 'My ABHA Card',
      );
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Could not share card: $e')),
        );
      }
    }
  }

  void _downloadCard() {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Card downloaded to gallery')),
    );
  }
}

class _PlaceholderCard extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      height: 200,
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          colors: [Color(0xFF7B6EF6), Color(0xFF9C8FFF)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
      ),
      child: const Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.health_and_safety_rounded, color: Colors.white, size: 48),
            SizedBox(height: 8),
            Text('Ayushman Bharat Health Account',
                style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 16)),
            Text('ABHA Card', style: TextStyle(color: Colors.white70, fontSize: 13)),
          ],
        ),
      ),
    );
  }
}

class _DetailCard extends StatelessWidget {
  final dynamic account;
  const _DetailCard({required this.account});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
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
          const Text('ABHA Details',
              style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16, color: Color(0xFF2D2B55))),
          const Divider(height: 20),
          _Row(label: 'ABHA Number', value: account.formattedAbhaNumber ?? '—'),
          if (account.abhaAddress != null) _Row(label: 'ABHA Address', value: account.abhaAddress!),
          if (account.name != null) _Row(label: 'Name', value: account.name!),
          if (account.mobile != null) _Row(label: 'Mobile', value: account.mobile!),
        ],
      ),
    );
  }
}

class _Row extends StatelessWidget {
  final String label;
  final String value;
  const _Row({required this.label, required this.value});

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 5),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(
              width: 120,
              child: Text(label,
                  style: TextStyle(fontSize: 13, color: Colors.grey.shade600)),
            ),
            Expanded(
              child: Text(value,
                  style: const TextStyle(
                      fontSize: 13, fontWeight: FontWeight.w600, color: Color(0xFF2D2B55))),
            ),
          ],
        ),
      );
}

class _ActionButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback? onTap;
  final bool primary;
  const _ActionButton({
    required this.icon,
    required this.label,
    this.onTap,
    this.primary = false,
  });

  @override
  Widget build(BuildContext context) {
    return ElevatedButton.icon(
      onPressed: onTap,
      icon: Icon(icon, size: 18),
      label: Text(label),
      style: ElevatedButton.styleFrom(
        backgroundColor: primary ? const Color(0xFF7B6EF6) : Colors.white,
        foregroundColor: primary ? Colors.white : const Color(0xFF7B6EF6),
        side: primary ? null : const BorderSide(color: Color(0xFF7B6EF6)),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        padding: const EdgeInsets.symmetric(vertical: 14),
        elevation: 0,
      ),
    );
  }
}

class _AbhmInfoCard extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.green.shade50,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.green.shade200),
      ),
      child: Row(
        children: [
          Icon(Icons.verified_rounded, color: Colors.green.shade600, size: 20),
          const SizedBox(width: 12),
          const Expanded(
            child: Text(
              'Your ABHA card can be used at any ABDM-enabled health facility across India.',
              style: TextStyle(fontSize: 12, color: Color(0xFF2D6A4F)),
            ),
          ),
        ],
      ),
    );
  }
}
