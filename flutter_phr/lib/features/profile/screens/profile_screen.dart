import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../../core/cubits/auth_cubit.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/constants/app_constants.dart';
import '../../../widgets/common/custom_button.dart';
import '../../../widgets/common/custom_text_field.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});
  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  bool _editing = false;
  late TextEditingController _firstNameCtrl, _lastNameCtrl, _phoneCtrl, _heightCtrl, _weightCtrl;
  String? _gender, _bloodType;
  DateTime? _dob;
  List<String> _conditions = [];
  List<String> _allergies = [];
  bool _isSaving = false;
  final _allergyCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    final user = context.read<AuthCubit>().state.user;
    _firstNameCtrl = TextEditingController(text: user?.firstName ?? '');
    _lastNameCtrl = TextEditingController(text: user?.lastName ?? '');
    _phoneCtrl = TextEditingController(text: user?.phone ?? '');
    _heightCtrl = TextEditingController(text: user?.height?.toString() ?? '');
    _weightCtrl = TextEditingController(text: user?.weight?.toString() ?? '');
    _gender = user?.gender;
    _bloodType = user?.bloodType;
    _dob = user?.dateOfBirth;
    _conditions = List.from(user?.conditions ?? []);
    _allergies = List.from(user?.allergies ?? []);
  }

  @override
  void dispose() { _firstNameCtrl.dispose(); _lastNameCtrl.dispose(); _phoneCtrl.dispose(); _heightCtrl.dispose(); _weightCtrl.dispose(); _allergyCtrl.dispose(); super.dispose(); }

  Future<void> _save() async {
    setState(() => _isSaving = true);
    await context.read<AuthCubit>().updateProfile({
      'first_name': _firstNameCtrl.text, 'last_name': _lastNameCtrl.text,
      'phone': _phoneCtrl.text, 'gender': _gender, 'blood_type': _bloodType,
      'date_of_birth': _dob?.toIso8601String(),
      'height': double.tryParse(_heightCtrl.text), 'weight': double.tryParse(_weightCtrl.text),
      'conditions': _conditions, 'allergies': _allergies,
    });
    setState(() { _isSaving = false; _editing = false; });
  }

  @override
  Widget build(BuildContext context) {
    final user = context.watch<AuthCubit>().state.user;
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(title: const Text('Health Profile'), actions: [
        if (!_editing) IconButton(icon: const Icon(Icons.edit_outlined), onPressed: () => setState(() => _editing = true))
        else IconButton(icon: const Icon(Icons.close), onPressed: () => setState(() => _editing = false)),
      ]),
      body: SingleChildScrollView(child: Column(children: [
        _buildHeader(user?.initials ?? '?', user?.fullName ?? '', user?.email ?? ''),
        Padding(padding: const EdgeInsets.all(16), child: Column(children: [
          _buildSection('Personal Information', [
            _field('First Name', _firstNameCtrl, Icons.person_outline),
            _field('Last Name', _lastNameCtrl, Icons.person_outline),
            _field('Phone', _phoneCtrl, Icons.phone_outlined, type: TextInputType.phone),
            if (_editing) ...[
              const SizedBox(height: 8),
              const Text('Gender', style: AppTextStyles.body2),
              const SizedBox(height: 6),
              Wrap(spacing: 8, children: ['Male', 'Female', 'Other'].map((g) => ChoiceChip(label: Text(g), selected: _gender == g, onSelected: (s) => setState(() => _gender = s ? g : null), selectedColor: AppColors.primaryLight)).toList()),
              const SizedBox(height: 8),
              const Text('Blood Type', style: AppTextStyles.body2),
              const SizedBox(height: 6),
              Wrap(spacing: 8, runSpacing: 6, children: AppConstants.bloodTypes.map((bt) => ChoiceChip(label: Text(bt), selected: _bloodType == bt, onSelected: (s) => setState(() => _bloodType = s ? bt : null), selectedColor: AppColors.primaryLight)).toList()),
            ] else ...[
              _infoRow('Gender', _gender ?? 'Not set', Icons.transgender),
              _infoRow('Blood Type', _bloodType ?? 'Not set', Icons.bloodtype),
            ],
          ]),
          const SizedBox(height: 16),
          _buildSection('Health Metrics', [
            _field('Height', _heightCtrl, Icons.height, type: TextInputType.number, suffix: 'cm'),
            _field('Weight', _weightCtrl, Icons.monitor_weight_outlined, type: TextInputType.number, suffix: 'kg'),
            if (!_editing && user?.age != null) _infoRow('Age', '${user!.age} years', Icons.cake_outlined),
          ]),
          const SizedBox(height: 16),
          _buildConditionsSection(),
          const SizedBox(height: 16),
          _buildAllergiesSection(),
          const SizedBox(height: 16),
          if (!_editing) ...[
            _buildSection('Account', [
              ListTile(leading: const Icon(Icons.timeline_outlined, color: AppColors.primary), title: const Text('View Timeline', style: AppTextStyles.body1), onTap: () {}),
              ListTile(leading: const Icon(Icons.download_outlined, color: AppColors.primary), title: const Text('Export Health Data', style: AppTextStyles.body1), onTap: () {}),
              ListTile(leading: const Icon(Icons.logout, color: AppColors.error), title: const Text('Logout', style: TextStyle(fontFamily: 'Poppins', color: AppColors.error)), onTap: () => context.read<AuthCubit>().logout()),
            ]),
          ] else ...[
            CustomButton(text: 'Save Profile', isLoading: _isSaving, onPressed: _save),
            const SizedBox(height: 12),
          ],
          const SizedBox(height: 60),
        ])),
      ])),
    );
  }

  Widget _buildHeader(String initials, String name, String email) => Container(
    padding: const EdgeInsets.all(24),
    decoration: const BoxDecoration(gradient: LinearGradient(colors: AppColors.primaryGradient, begin: Alignment.topLeft, end: Alignment.bottomRight)),
    child: Row(children: [
      CircleAvatar(radius: 36, backgroundColor: Colors.white.withOpacity(0.2), child: Text(initials, style: const TextStyle(fontFamily: 'Poppins', fontSize: 24, fontWeight: FontWeight.w700, color: Colors.white))),
      const SizedBox(width: 16),
      Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(name, style: const TextStyle(fontFamily: 'Poppins', fontSize: 18, fontWeight: FontWeight.w700, color: Colors.white)),
        Text(email, style: TextStyle(fontFamily: 'Poppins', fontSize: 13, color: Colors.white.withOpacity(0.8))),
      ]),
    ]),
  );

  Widget _buildSection(String title, List<Widget> children) => Container(padding: const EdgeInsets.all(16), decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(16)), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(title, style: AppTextStyles.h5), const SizedBox(height: 12), ...children]));

  Widget _field(String label, TextEditingController ctrl, IconData icon, {TextInputType? type, String? suffix}) =>
    _editing ? Padding(padding: const EdgeInsets.only(bottom: 10), child: CustomTextField(controller: ctrl, label: label, keyboardType: type, suffixText: suffix)) :
    _infoRow(label, ctrl.text.isEmpty ? 'Not set' : (suffix != null ? '${ctrl.text} $suffix' : ctrl.text), icon);

  Widget _infoRow(String label, String value, IconData icon) => ListTile(contentPadding: EdgeInsets.zero, leading: Icon(icon, color: AppColors.primary, size: 20), title: Text(label, style: AppTextStyles.caption), subtitle: Text(value, style: AppTextStyles.body1));

  Widget _buildConditionsSection() => Container(padding: const EdgeInsets.all(16), decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(16)), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
    const Text('Medical Conditions', style: AppTextStyles.h5),
    const SizedBox(height: 12),
    if (_editing) Wrap(spacing: 8, runSpacing: 8, children: AppConstants.commonConditions.map((c) => FilterChip(label: Text(c), selected: _conditions.contains(c), onSelected: (s) => setState(() { if (s) _conditions.add(c); else _conditions.remove(c); }), selectedColor: AppColors.primaryLight)).toList())
    else if (_conditions.isEmpty) const Text('None', style: AppTextStyles.body2)
    else Wrap(spacing: 8, runSpacing: 8, children: _conditions.map((c) => Chip(label: Text(c, style: AppTextStyles.caption.copyWith(color: AppColors.primary)), backgroundColor: AppColors.primaryLight)).toList()),
  ]));

  Widget _buildAllergiesSection() => Container(padding: const EdgeInsets.all(16), decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(16)), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
    const Text('Allergies', style: AppTextStyles.h5),
    const SizedBox(height: 12),
    if (_editing) ...[
      Row(children: [
        Expanded(child: TextField(controller: _allergyCtrl, decoration: const InputDecoration(hintText: 'Add allergy...', isDense: true, border: OutlineInputBorder()), onSubmitted: (v) { if (v.isNotEmpty) { setState(() { _allergies.add(v.trim()); _allergyCtrl.clear(); }); } })),
        const SizedBox(width: 8),
        ElevatedButton(onPressed: () { if (_allergyCtrl.text.isNotEmpty) { setState(() { _allergies.add(_allergyCtrl.text.trim()); _allergyCtrl.clear(); }); } }, child: const Text('Add')),
      ]),
      const SizedBox(height: 8),
      Wrap(spacing: 8, runSpacing: 8, children: _allergies.map((a) => Chip(label: Text(a, style: AppTextStyles.caption), onDeleted: () => setState(() => _allergies.remove(a)), backgroundColor: AppColors.errorLight, deleteIconColor: AppColors.error)).toList()),
    ] else if (_allergies.isEmpty) const Text('None', style: AppTextStyles.body2)
    else Wrap(spacing: 8, runSpacing: 8, children: _allergies.map((a) => Chip(label: Text(a, style: AppTextStyles.caption.copyWith(color: AppColors.error)), backgroundColor: AppColors.errorLight)).toList()),
  ]));
}
