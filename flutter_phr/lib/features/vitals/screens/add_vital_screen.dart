import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import '../../../core/cubits/vitals_cubit.dart';
import '../../../core/theme/app_theme.dart';
import '../../../widgets/common/custom_button.dart';
import '../../../widgets/common/custom_text_field.dart';

class AddVitalScreen extends StatefulWidget {
  final String? vitalType;
  const AddVitalScreen({super.key, this.vitalType});
  @override
  State<AddVitalScreen> createState() => _AddVitalScreenState();
}

class _AddVitalScreenState extends State<AddVitalScreen> {
  final _formKey = GlobalKey<FormState>();
  late String _selectedType;
  final Map<String, TextEditingController> _controllers = {};
  DateTime _recordedAt = DateTime.now();
  final _notesCtrl = TextEditingController();
  String _glucoseContext = 'fasting';
  bool _isLoading = false;

  static const _types = [
    {'key': 'blood_pressure', 'label': 'Blood Pressure', 'icon': Icons.favorite},
    {'key': 'glucose', 'label': 'Blood Glucose', 'icon': Icons.water_drop},
    {'key': 'weight', 'label': 'Weight', 'icon': Icons.monitor_weight},
    {'key': 'spo2', 'label': 'SpO2', 'icon': Icons.air},
    {'key': 'heart_rate', 'label': 'Heart Rate', 'icon': Icons.favorite_border},
    {'key': 'temperature', 'label': 'Temperature', 'icon': Icons.thermostat},
  ];

  @override
  void initState() {
    super.initState();
    _selectedType = widget.vitalType ?? 'blood_pressure';
    _initControllers();
  }

  void _initControllers() {
    _controllers.clear();
    switch (_selectedType) {
      case 'blood_pressure':
        _controllers['systolic'] = TextEditingController();
        _controllers['diastolic'] = TextEditingController();
        _controllers['pulse'] = TextEditingController();
        break;
      case 'glucose': _controllers['value'] = TextEditingController(); break;
      case 'weight': _controllers['value'] = TextEditingController(); break;
      case 'spo2': _controllers['value'] = TextEditingController(); break;
      case 'heart_rate': _controllers['bpm'] = TextEditingController(); break;
      case 'temperature': _controllers['value'] = TextEditingController(); break;
    }
  }

  @override
  void dispose() { _controllers.values.forEach((c) => c.dispose()); _notesCtrl.dispose(); super.dispose(); }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _isLoading = true);
    final values = <String, dynamic>{};
    _controllers.forEach((k, c) { if (c.text.isNotEmpty) values[k] = double.tryParse(c.text) ?? c.text; });
    if (_selectedType == 'glucose') values['context'] = _glucoseContext;
    final vital = await context.read<VitalsCubit>().addVital({
      'type': _selectedType, 'values': values,
      'recorded_at': _recordedAt.toIso8601String(), 'notes': _notesCtrl.text,
    });
    setState(() => _isLoading = false);
    if (vital != null && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: const Text('Vital recorded successfully!'),
        backgroundColor: AppColors.success, behavior: SnackBarBehavior.floating,
      ));
      context.pop();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(title: const Text('Record Vital')),
      body: SingleChildScrollView(padding: const EdgeInsets.all(16), child: Form(key: _formKey, child: Column(children: [
        _buildTypeSelector(),
        const SizedBox(height: 20),
        _buildInputFields(),
        const SizedBox(height: 16),
        _buildDatePicker(),
        const SizedBox(height: 16),
        CustomTextField(controller: _notesCtrl, label: 'Notes (Optional)', hint: 'Any additional notes...', maxLines: 2),
        const SizedBox(height: 24),
        CustomButton(text: 'Save Vital', isLoading: _isLoading, onPressed: _save),
      ]))),
    );
  }

  Widget _buildTypeSelector() => Container(decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(16)),
    child: Column(children: _types.asMap().entries.map((e) {
      final t = e.value;
      final isSelected = _selectedType == t['key'];
      return ListTile(
        leading: Icon(t['icon'] as IconData, color: isSelected ? AppColors.primary : AppColors.textHint, size: 22),
        title: Text(t['label'] as String, style: TextStyle(fontFamily: 'Poppins', fontSize: 14,
          color: isSelected ? AppColors.primary : AppColors.textPrimary, fontWeight: isSelected ? FontWeight.w600 : FontWeight.w400)),
        trailing: isSelected ? const Icon(Icons.check_circle, color: AppColors.primary, size: 20) : null,
        onTap: () => setState(() { _selectedType = t['key'] as String; _initControllers(); }),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        selected: isSelected,
        selectedTileColor: AppColors.primaryLight,
      );
    }).toList()));

  Widget _buildInputFields() => Container(padding: const EdgeInsets.all(16), decoration: BoxDecoration(
    color: AppColors.surface, borderRadius: BorderRadius.circular(16),
  ), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
    Text('Enter Values', style: AppTextStyles.h5),
    const SizedBox(height: 16),
    if (_selectedType == 'blood_pressure') ...[
      Row(children: [
        Expanded(child: CustomTextField(controller: _controllers['systolic']!, label: 'Systolic', hint: '120',
          keyboardType: TextInputType.number, suffixText: 'mmHg',
          validator: (v) { if (v?.isEmpty ?? true) return 'Required'; final n = double.tryParse(v!); if (n == null || n < 60 || n > 250) return '60-250'; return null; })),
        const SizedBox(width: 12),
        Expanded(child: CustomTextField(controller: _controllers['diastolic']!, label: 'Diastolic', hint: '80',
          keyboardType: TextInputType.number, suffixText: 'mmHg',
          validator: (v) { if (v?.isEmpty ?? true) return 'Required'; final n = double.tryParse(v!); if (n == null || n < 40 || n > 150) return '40-150'; return null; })),
      ]),
      const SizedBox(height: 12),
      CustomTextField(controller: _controllers['pulse']!, label: 'Pulse (Optional)', hint: '72', keyboardType: TextInputType.number, suffixText: 'bpm'),
    ] else if (_selectedType == 'glucose') ...[
      CustomTextField(controller: _controllers['value']!, label: 'Blood Glucose', hint: '100',
        keyboardType: TextInputType.number, suffixText: 'mg/dL',
        validator: (v) { if (v?.isEmpty ?? true) return 'Required'; final n = double.tryParse(v!); if (n == null || n < 20 || n > 600) return '20-600'; return null; }),
      const SizedBox(height: 12),
      const Text('Context', style: AppTextStyles.body2),
      const SizedBox(height: 8),
      Wrap(spacing: 8, children: ['fasting', 'post_meal', 'random', 'bedtime'].map((c) => ChoiceChip(
        label: Text(c.replaceAll('_', ' ').split(' ').map((w) => w[0].toUpperCase() + w.substring(1)).join(' ')),
        selected: _glucoseContext == c, onSelected: (s) => setState(() => _glucoseContext = c),
        selectedColor: AppColors.primaryLight,
      )).toList()),
    ] else if (_selectedType == 'weight') ...[
      CustomTextField(controller: _controllers['value']!, label: 'Weight', hint: '70',
        keyboardType: TextInputType.number, suffixText: 'kg',
        validator: (v) { if (v?.isEmpty ?? true) return 'Required'; final n = double.tryParse(v!); if (n == null || n < 10 || n > 500) return '10-500'; return null; }),
    ] else if (_selectedType == 'spo2') ...[
      CustomTextField(controller: _controllers['value']!, label: 'Oxygen Saturation', hint: '98',
        keyboardType: TextInputType.number, suffixText: '%',
        validator: (v) { if (v?.isEmpty ?? true) return 'Required'; final n = double.tryParse(v!); if (n == null || n < 50 || n > 100) return '50-100'; return null; }),
    ] else if (_selectedType == 'heart_rate') ...[
      CustomTextField(controller: _controllers['bpm']!, label: 'Heart Rate', hint: '72',
        keyboardType: TextInputType.number, suffixText: 'bpm',
        validator: (v) { if (v?.isEmpty ?? true) return 'Required'; final n = double.tryParse(v!); if (n == null || n < 20 || n > 300) return '20-300'; return null; }),
    ] else if (_selectedType == 'temperature') ...[
      CustomTextField(controller: _controllers['value']!, label: 'Temperature', hint: '36.6',
        keyboardType: const TextInputType.numberWithOptions(decimal: true), suffixText: '°C',
        validator: (v) { if (v?.isEmpty ?? true) return 'Required'; final n = double.tryParse(v!); if (n == null || n < 30 || n > 45) return '30-45'; return null; }),
    ],
  ]));

  Widget _buildDatePicker() => GestureDetector(
    onTap: () async {
      final date = await showDatePicker(context: context, initialDate: _recordedAt, firstDate: DateTime.now().subtract(const Duration(days: 365)), lastDate: DateTime.now());
      if (date != null) {
        final time = await showTimePicker(context: context, initialTime: TimeOfDay.fromDateTime(_recordedAt));
        if (time != null) setState(() => _recordedAt = DateTime(date.year, date.month, date.day, time.hour, time.minute));
      }
    },
    child: Container(padding: const EdgeInsets.all(16), decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(16)),
      child: Row(children: [
        const Icon(Icons.calendar_today_outlined, color: AppColors.primary, size: 20),
        const SizedBox(width: 12),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('Date & Time', style: AppTextStyles.body2),
          Text('${_recordedAt.day}/${_recordedAt.month}/${_recordedAt.year} ${_recordedAt.hour}:${_recordedAt.minute.toString().padLeft(2,'0')}', style: AppTextStyles.body1),
        ])),
        const Icon(Icons.chevron_right, color: AppColors.textHint),
      ])),
  );
}
