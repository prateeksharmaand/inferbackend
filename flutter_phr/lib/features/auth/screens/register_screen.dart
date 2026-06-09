import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import '../../../core/cubits/auth_cubit.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/constants/app_constants.dart';
import '../../../widgets/common/custom_button.dart';
import '../../../widgets/common/custom_text_field.dart';

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});
  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _formKey = GlobalKey<FormState>();
  final _firstNameCtrl = TextEditingController();
  final _lastNameCtrl = TextEditingController();
  final _emailCtrl = TextEditingController();
  final _phoneCtrl = TextEditingController();
  final _passCtrl = TextEditingController();
  final _confirmPassCtrl = TextEditingController();
  bool _obscure = true;
  int _step = 0;
  DateTime? _dob;
  String? _gender;
  String? _bloodType;

  @override
  void dispose() {
    _firstNameCtrl.dispose(); _lastNameCtrl.dispose(); _emailCtrl.dispose();
    _phoneCtrl.dispose(); _passCtrl.dispose(); _confirmPassCtrl.dispose();
    super.dispose();
  }

  Future<void> _register() async {
    if (!_formKey.currentState!.validate()) return;
    final data = {
      'first_name': _firstNameCtrl.text.trim(), 'last_name': _lastNameCtrl.text.trim(),
      'email': _emailCtrl.text.trim(), 'phone': _phoneCtrl.text.trim(),
      'password': _passCtrl.text, 'date_of_birth': _dob?.toIso8601String(),
      'gender': _gender, 'blood_type': _bloodType,
    };
    final success = await context.read<AuthCubit>().register(data);
    if (success && mounted) context.go(AppRoutes.home);
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthCubit>().state;
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: Colors.transparent, elevation: 0,
        leading: IconButton(icon: const Icon(Icons.arrow_back_ios, size: 20), onPressed: () => context.go(AppRoutes.login)),
        title: const Text('Create Account', style: AppTextStyles.h4),
      ),
      body: SafeArea(child: SingleChildScrollView(child: Padding(
        padding: const EdgeInsets.all(AppSpacing.lg),
        child: Form(key: _formKey, child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          _buildProgressIndicator(),
          const SizedBox(height: 24),
          if (_step == 0) ...[
            const Text('Personal Info', style: AppTextStyles.h3),
            const SizedBox(height: 4),
            const Text('Let us know who you are', style: AppTextStyles.body2),
            const SizedBox(height: 24),
            Row(children: [
              Expanded(child: CustomTextField(controller: _firstNameCtrl, label: 'First Name', hint: 'John',
                validator: (v) => v?.isEmpty ?? true ? 'Required' : null)),
              const SizedBox(width: 12),
              Expanded(child: CustomTextField(controller: _lastNameCtrl, label: 'Last Name', hint: 'Doe',
                validator: (v) => v?.isEmpty ?? true ? 'Required' : null)),
            ]),
            const SizedBox(height: 16),
            CustomTextField(controller: _emailCtrl, label: 'Email', hint: 'john@example.com',
              keyboardType: TextInputType.emailAddress,
              prefixIcon: const Icon(Icons.email_outlined, color: AppColors.textHint),
              validator: (v) { if (v?.isEmpty ?? true) return 'Email required'; if (!v!.contains('@')) return 'Invalid email'; return null; }),
            const SizedBox(height: 16),
            CustomTextField(controller: _phoneCtrl, label: 'Phone', hint: '+91 9876543210',
              keyboardType: TextInputType.phone,
              prefixIcon: const Icon(Icons.phone_outlined, color: AppColors.textHint)),
          ] else if (_step == 1) ...[
            const Text('Health Profile', style: AppTextStyles.h3),
            const SizedBox(height: 4),
            const Text('Basic health information', style: AppTextStyles.body2),
            const SizedBox(height: 24),
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Date of Birth', style: AppTextStyles.body2),
              subtitle: Text(_dob != null ? '${_dob!.day}/${_dob!.month}/${_dob!.year}' : 'Select date', style: AppTextStyles.body1),
              trailing: const Icon(Icons.calendar_today_outlined, color: AppColors.primary),
              onTap: () async {
                final date = await showDatePicker(context: context, initialDate: DateTime(1990),
                  firstDate: DateTime(1920), lastDate: DateTime.now());
                if (date != null) setState(() => _dob = date);
              },
            ),
            const Divider(),
            const SizedBox(height: 12),
            const Text('Gender', style: AppTextStyles.body2),
            const SizedBox(height: 8),
            Wrap(spacing: 8, children: ['Male', 'Female', 'Other'].map((g) => ChoiceChip(
              label: Text(g), selected: _gender == g,
              onSelected: (s) => setState(() => _gender = s ? g : null),
              selectedColor: AppColors.primaryLight,
              labelStyle: TextStyle(color: _gender == g ? AppColors.primary : AppColors.textSecondary, fontFamily: 'Poppins'),
            )).toList()),
            const SizedBox(height: 16),
            const Text('Blood Type', style: AppTextStyles.body2),
            const SizedBox(height: 8),
            Wrap(spacing: 8, runSpacing: 8, children: AppConstants.bloodTypes.map((bt) => ChoiceChip(
              label: Text(bt), selected: _bloodType == bt,
              onSelected: (s) => setState(() => _bloodType = s ? bt : null),
              selectedColor: AppColors.primaryLight,
              labelStyle: TextStyle(color: _bloodType == bt ? AppColors.primary : AppColors.textSecondary, fontFamily: 'Poppins'),
            )).toList()),
          ] else ...[
            const Text('Set Password', style: AppTextStyles.h3),
            const SizedBox(height: 24),
            CustomTextField(controller: _passCtrl, label: 'Password', hint: 'Min 8 characters',
              obscureText: _obscure,
              prefixIcon: const Icon(Icons.lock_outlined, color: AppColors.textHint),
              suffixIcon: IconButton(icon: Icon(_obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined, color: AppColors.textHint),
                onPressed: () => setState(() => _obscure = !_obscure)),
              validator: (v) { if (v?.isEmpty ?? true) return 'Required'; if (v!.length < 8) return 'Min 8 characters'; return null; }),
            const SizedBox(height: 16),
            CustomTextField(controller: _confirmPassCtrl, label: 'Confirm Password', hint: 'Re-enter password',
              obscureText: _obscure,
              prefixIcon: const Icon(Icons.lock_outlined, color: AppColors.textHint),
              validator: (v) { if (v != _passCtrl.text) return 'Passwords do not match'; return null; }),
          ],
          if (auth.error != null) ...[
            const SizedBox(height: 12),
            Container(padding: const EdgeInsets.all(12), decoration: BoxDecoration(
              color: AppColors.errorLight, borderRadius: BorderRadius.circular(10),
            ), child: Text(auth.error!, style: AppTextStyles.caption.copyWith(color: AppColors.error))),
          ],
          const SizedBox(height: 32),
          Row(children: [
            if (_step > 0) ...[
              Expanded(child: OutlinedButton(onPressed: () => setState(() => _step--), child: const Text('Back'))),
              const SizedBox(width: 12),
            ],
            Expanded(child: CustomButton(
              text: _step == 2 ? 'Create Account' : 'Continue',
              isLoading: auth.isLoading,
              onPressed: _step == 2 ? _register : () => setState(() => _step++),
            )),
          ]),
          const SizedBox(height: 16),
          Row(mainAxisAlignment: MainAxisAlignment.center, children: [
            const Text('Already have an account? ', style: AppTextStyles.body2),
            GestureDetector(onTap: () => context.go(AppRoutes.login),
              child: Text('Sign In', style: AppTextStyles.body2.copyWith(color: AppColors.primary, fontWeight: FontWeight.w600))),
          ]),
        ])),
      ))),
    );
  }

  Widget _buildProgressIndicator() => Row(children: List.generate(3, (i) => Expanded(child: Container(
    margin: EdgeInsets.only(right: i < 2 ? 4 : 0),
    height: 4,
    decoration: BoxDecoration(
      color: i <= _step ? AppColors.primary : AppColors.border,
      borderRadius: BorderRadius.circular(2),
    ),
  ))));
}
