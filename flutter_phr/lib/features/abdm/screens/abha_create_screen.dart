import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import '../../../core/cubits/abdm_cubit.dart';

import '../../../core/constants/app_constants.dart';

/// Handles both "create ABHA" (aadhaar/mobile) and "link existing ABHA" flows.
/// Pass `extra: 'login'` via GoRouter to open the login tab directly.
class AbhaCreateScreen extends StatefulWidget {
  final String? mode; // null or 'login'
  const AbhaCreateScreen({super.key, this.mode});

  @override
  State<AbhaCreateScreen> createState() => _AbhaCreateScreenState();
}

class _AbhaCreateScreenState extends State<AbhaCreateScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabs;

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 2, vsync: this,
        initialIndex: widget.mode == 'login' ? 1 : 0);
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
        title: const Text('Setup ABHA', style: TextStyle(fontWeight: FontWeight.w700)),
        backgroundColor: Colors.transparent,
        elevation: 0,
        foregroundColor: const Color(0xFF7B6EF6),
        bottom: TabBar(
          controller: _tabs,
          labelColor: const Color(0xFF7B6EF6),
          unselectedLabelColor: Colors.grey,
          indicatorColor: const Color(0xFF7B6EF6),
          tabs: const [
            Tab(text: 'Create via Aadhaar'),
            Tab(text: 'Link ABHA'),
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
          if (state.message != null && state.hasAbha) {
            ScaffoldMessenger.of(ctx).showSnackBar(
              SnackBar(content: Text(state.message!), backgroundColor: Colors.green.shade600),
            );
            ctx.pushReplacement(AppRoutes.abhaCard);
          }
        },
        builder: (ctx, state) => TabBarView(
          controller: _tabs,
          children: [
            _AadhaarTab(state: state),
            _LoginTab(state: state),
          ],
        ),
      ),
    );
  }
}

// ── Aadhaar tab ───────────────────────────────────────────────────────────────

class _AadhaarTab extends StatefulWidget {
  final AbdmState state;
  const _AadhaarTab({required this.state});

  @override
  State<_AadhaarTab> createState() => _AadhaarTabState();
}

class _AadhaarTabState extends State<_AadhaarTab> {
  final _aadhaarCtrl = TextEditingController();
  final _mobileCtrl  = TextEditingController();
  final _otpCtrl     = TextEditingController();
  bool _otpSent = false;

  @override
  void dispose() {
    _aadhaarCtrl.dispose();
    _mobileCtrl.dispose();
    _otpCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final loading = widget.state.status == AbdmStatus.loading;
    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _StepBanner(
            icon: Icons.fingerprint_rounded,
            title: 'Create ABHA via Aadhaar',
            subtitle: 'OTP will be sent to your Aadhaar-linked mobile number',
          ),
          const SizedBox(height: 28),
          if (!_otpSent) ...[
            _buildLabel('Aadhaar Number'),
            _buildField(
              controller: _aadhaarCtrl,
              hint: 'Enter 12-digit Aadhaar number',
              keyboardType: TextInputType.number,
              maxLength: 12,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
            ),
            const SizedBox(height: 20),
            _buildLabel('Mobile Number'),
            _buildField(
              controller: _mobileCtrl,
              hint: 'Enter 10-digit mobile to link with ABHA',
              keyboardType: TextInputType.phone,
              maxLength: 10,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
            ),
            const SizedBox(height: 24),
            _PrimaryButton(
              label: 'Send OTP',
              loading: loading,
              onPressed: () {
                if (_aadhaarCtrl.text.length != 12) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Enter valid 12-digit Aadhaar')),
                  );
                  return;
                }
                if (_mobileCtrl.text.length != 10) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Enter valid 10-digit mobile number')),
                  );
                  return;
                }
                context.read<AbdmCubit>().startAadhaarEnrol(
                  _aadhaarCtrl.text.trim(),
                  _mobileCtrl.text.trim(),
                );
                setState(() => _otpSent = true);
              },
            ),
          ] else ...[
            _buildLabel('OTP'),
            _buildField(
              controller: _otpCtrl,
              hint: 'Enter 6-digit OTP',
              keyboardType: TextInputType.number,
              maxLength: 6,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
            ),
            const SizedBox(height: 8),
            TextButton(
              onPressed: loading
                  ? null
                  : () => context.read<AbdmCubit>().startAadhaarEnrol(
                        _aadhaarCtrl.text.trim(),
                        _mobileCtrl.text.trim(),
                      ),
              child: const Text('Resend OTP'),
            ),
            const SizedBox(height: 8),
            _PrimaryButton(
              label: 'Verify & Create ABHA',
              loading: loading,
              onPressed: () {
                if (_otpCtrl.text.length < 4) return;
                context.read<AbdmCubit>().verifyAadhaarOtp(_otpCtrl.text.trim());
              },
            ),
            const SizedBox(height: 12),
            TextButton(
              onPressed: () => setState(() => _otpSent = false),
              child: const Text('Change Aadhaar / Mobile'),
            ),
          ],
        ],
      ),
    );
  }
}

// ── Link/Login tab ────────────────────────────────────────────────────────────

class _LoginTab extends StatefulWidget {
  final AbdmState state;
  const _LoginTab({required this.state});

  @override
  State<_LoginTab> createState() => _LoginTabState();
}

class _LoginTabState extends State<_LoginTab> {
  final _abhaCtrl = TextEditingController();
  final _otpCtrl  = TextEditingController();
  bool _otpSent = false;

  @override
  void dispose() {
    _abhaCtrl.dispose();
    _otpCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final loading = widget.state.status == AbdmStatus.loading;
    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _StepBanner(
            icon: Icons.link_rounded,
            title: 'Link Existing ABHA',
            subtitle: 'Already have an ABHA number? Link it to your PHR account',
          ),
          const SizedBox(height: 28),
          if (!_otpSent) ...[
            _buildLabel('ABHA Number or Address'),
            _buildField(
              controller: _abhaCtrl,
              hint: 'e.g. 12-3456-7890-1234 or name@abdm',
              keyboardType: TextInputType.text,
            ),
            const SizedBox(height: 24),
            _PrimaryButton(
              label: 'Send OTP',
              loading: loading,
              onPressed: () {
                if (_abhaCtrl.text.isEmpty) return;
                context.read<AbdmCubit>().startAbhaLogin(_abhaCtrl.text.trim());
                setState(() => _otpSent = true);
              },
            ),
          ] else ...[
            _buildLabel('OTP'),
            _buildField(
              controller: _otpCtrl,
              hint: 'Enter OTP sent to your ABHA-linked mobile',
              keyboardType: TextInputType.number,
              maxLength: 6,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
            ),
            const SizedBox(height: 16),
            _PrimaryButton(
              label: 'Verify & Link',
              loading: loading,
              onPressed: () {
                if (_otpCtrl.text.isEmpty) return;
                context.read<AbdmCubit>().verifyAbhaLoginOtp(_otpCtrl.text.trim());
              },
            ),
            const SizedBox(height: 12),
            TextButton(
              onPressed: () => setState(() => _otpSent = false),
              child: const Text('Change ABHA number'),
            ),
          ],
        ],
      ),
    );
  }
}

// ── Shared widgets ────────────────────────────────────────────────────────────

class _StepBanner extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  const _StepBanner({required this.icon, required this.title, required this.subtitle});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF7B6EF6).withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        children: [
          Icon(icon, color: const Color(0xFF7B6EF6), size: 36),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title,
                    style: const TextStyle(
                        fontWeight: FontWeight.w700, fontSize: 15, color: Color(0xFF2D2B55))),
                const SizedBox(height: 4),
                Text(subtitle,
                    style: const TextStyle(fontSize: 12, color: Color(0xFF5C5A8E))),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

Widget _buildLabel(String text) => Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Text(text,
          style: const TextStyle(
              fontWeight: FontWeight.w600, fontSize: 14, color: Color(0xFF2D2B55))),
    );

Widget _buildField({
  required TextEditingController controller,
  required String hint,
  TextInputType keyboardType = TextInputType.text,
  int? maxLength,
  List<TextInputFormatter>? inputFormatters,
}) =>
    TextField(
      controller: controller,
      keyboardType: keyboardType,
      maxLength: maxLength,
      inputFormatters: inputFormatters,
      decoration: InputDecoration(
        hintText: hint,
        counterText: '',
        filled: true,
        fillColor: Colors.white,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: Colors.grey.shade200),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: Colors.grey.shade200),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: Color(0xFF7B6EF6)),
        ),
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      ),
    );

class _PrimaryButton extends StatelessWidget {
  final String label;
  final bool loading;
  final VoidCallback? onPressed;
  const _PrimaryButton({required this.label, required this.loading, this.onPressed});

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      height: 50,
      child: ElevatedButton(
        onPressed: loading ? null : onPressed,
        style: ElevatedButton.styleFrom(
          backgroundColor: const Color(0xFF7B6EF6),
          foregroundColor: Colors.white,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          elevation: 0,
        ),
        child: loading
            ? const SizedBox(
                width: 22,
                height: 22,
                child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
              )
            : Text(label, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15)),
      ),
    );
  }
}
