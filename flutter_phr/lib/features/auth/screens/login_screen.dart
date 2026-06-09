import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import '../../../core/cubits/auth_cubit.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/constants/app_constants.dart';
import '../../../widgets/common/custom_button.dart';
import '../../../widgets/common/custom_text_field.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});
  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailCtrl = TextEditingController();
  final _passCtrl = TextEditingController();
  bool _obscure = true;

  @override
  void dispose() { _emailCtrl.dispose(); _passCtrl.dispose(); super.dispose(); }

  Future<void> _login() async {
    if (!_formKey.currentState!.validate()) return;
    final success = await context.read<AuthCubit>().login(_emailCtrl.text.trim(), _passCtrl.text);
    if (success && mounted) context.go(AppRoutes.home);
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthCubit>().state;
    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(child: SingleChildScrollView(child: Padding(
        padding: const EdgeInsets.all(AppSpacing.lg),
        child: Form(key: _formKey, child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const SizedBox(height: 40),
          Center(child: Container(width: 72, height: 72, decoration: BoxDecoration(
            gradient: const LinearGradient(colors: AppColors.primaryGradient),
            borderRadius: BorderRadius.circular(20),
          ), child: const Icon(Icons.favorite, color: Colors.white, size: 40))),
          const SizedBox(height: 24),
          const Center(child: Text('Welcome Back', style: AppTextStyles.h2)),
          const SizedBox(height: 8),
          Center(child: Text('Sign in to your health account', style: AppTextStyles.body2)),
          const SizedBox(height: 40),
          CustomTextField(
            controller: _emailCtrl, label: 'Email Address',
            hint: 'Enter your email', keyboardType: TextInputType.emailAddress,
            prefixIcon: const Icon(Icons.email_outlined, color: AppColors.textHint),
            validator: (v) { if (v?.isEmpty ?? true) return 'Email required'; if (!v!.contains('@')) return 'Invalid email'; return null; },
          ),
          const SizedBox(height: 16),
          CustomTextField(
            controller: _passCtrl, label: 'Password',
            hint: 'Enter your password', obscureText: _obscure,
            prefixIcon: const Icon(Icons.lock_outlined, color: AppColors.textHint),
            suffixIcon: IconButton(
              icon: Icon(_obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined, color: AppColors.textHint),
              onPressed: () => setState(() => _obscure = !_obscure),
            ),
            validator: (v) { if (v?.isEmpty ?? true) return 'Password required'; if (v!.length < 6) return 'Min 6 characters'; return null; },
          ),
          const SizedBox(height: 8),
          Align(alignment: Alignment.centerRight, child: TextButton(
            onPressed: () {}, child: Text('Forgot Password?', style: AppTextStyles.body2.copyWith(color: AppColors.primary)),
          )),
          if (auth.error != null) ...[
            const SizedBox(height: 8),
            Container(padding: const EdgeInsets.all(12), decoration: BoxDecoration(
              color: AppColors.errorLight, borderRadius: BorderRadius.circular(10),
            ), child: Row(children: [
              const Icon(Icons.error_outline, color: AppColors.error, size: 18),
              const SizedBox(width: 8),
              Expanded(child: Text(auth.error!, style: AppTextStyles.caption.copyWith(color: AppColors.error))),
            ])),
          ],
          const SizedBox(height: 24),
          CustomButton(text: 'Sign In', isLoading: auth.isLoading, onPressed: _login),
          const SizedBox(height: 16),
          Row(mainAxisAlignment: MainAxisAlignment.center, children: [
            Text("Don't have an account? ", style: AppTextStyles.body2),
            GestureDetector(onTap: () => context.go(AppRoutes.register),
              child: Text('Sign Up', style: AppTextStyles.body2.copyWith(color: AppColors.primary, fontWeight: FontWeight.w600))),
          ]),
          const SizedBox(height: 32),
          _buildHealthStats(),
        ])),
      ))),
    );
  }

  Widget _buildHealthStats() => Container(padding: const EdgeInsets.all(16), decoration: BoxDecoration(
    color: AppColors.surface, borderRadius: BorderRadius.circular(16),
    border: Border.all(color: AppColors.border),
  ), child: Row(mainAxisAlignment: MainAxisAlignment.spaceAround, children: [
    _stat('10K+', 'Users'),
    _divider(),
    _stat('50+', 'Vitals Tracked'),
    _divider(),
    _stat('256-bit', 'Encrypted'),
  ]));

  Widget _stat(String value, String label) => Column(children: [
    Text(value, style: AppTextStyles.h5.copyWith(color: AppColors.primary)),
    Text(label, style: AppTextStyles.caption),
  ]);

  Widget _divider() => Container(width: 1, height: 36, color: AppColors.divider);
}
