import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:file_picker/file_picker.dart';
import 'package:image_picker/image_picker.dart';
import 'package:go_router/go_router.dart';
import '../../../core/cubits/documents_cubit.dart';
import '../../../core/cubits/vitals_cubit.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/constants/app_constants.dart';
import '../../../widgets/common/custom_button.dart';
import '../../../widgets/common/custom_text_field.dart';

class UploadDocumentScreen extends StatefulWidget {
  const UploadDocumentScreen({super.key});
  @override
  State<UploadDocumentScreen> createState() => _UploadDocumentScreenState();
}

class _UploadDocumentScreenState extends State<UploadDocumentScreen> {
  final _formKey = GlobalKey<FormState>();
  final _titleCtrl = TextEditingController();
  final _doctorCtrl = TextEditingController();
  final _facilityCtrl = TextEditingController();
  String _selectedType = AppConstants.documentTypes.first;
  DateTime? _documentDate;
  File? _selectedFile;
  String? _fileName;
  bool _isUploading = false;
  double _uploadProgress = 0;
  List<String> _tags = [];
  final _tagCtrl = TextEditingController();

  @override
  void dispose() { _titleCtrl.dispose(); _doctorCtrl.dispose(); _facilityCtrl.dispose(); _tagCtrl.dispose(); super.dispose(); }

  Future<void> _pickFile() async {
    final result = await FilePicker.platform.pickFiles(allowedExtensions: ['pdf', 'jpg', 'jpeg', 'png'], type: FileType.custom, withData: false);
    if (result != null && result.files.isNotEmpty) {
      setState(() { _selectedFile = File(result.files.first.path!); _fileName = result.files.first.name; });
    }
  }

  Future<void> _pickFromCamera() async {
    final image = await ImagePicker().pickImage(source: ImageSource.camera, imageQuality: 85);
    if (image != null) {
      setState(() { _selectedFile = File(image.path); _fileName = 'camera_${DateTime.now().millisecondsSinceEpoch}.jpg'; });
    }
  }

  Future<void> _upload() async {
    if (!_formKey.currentState!.validate() || _selectedFile == null) {
      if (_selectedFile == null) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Please select a file')));
      return;
    }
    setState(() { _isUploading = true; _uploadProgress = 0; });
    final doc = await context.read<DocumentsCubit>().uploadDocument(
      file: _selectedFile!, title: _titleCtrl.text.trim(), type: _selectedType,
      doctorName: _doctorCtrl.text.trim().isEmpty ? null : _doctorCtrl.text.trim(),
      facilityName: _facilityCtrl.text.trim().isEmpty ? null : _facilityCtrl.text.trim(),
      documentDate: _documentDate, tags: _tags,
      onProgress: (p) => setState(() => _uploadProgress = p),
    );
    setState(() { _isUploading = false; });
    if (!mounted) return;
    if (doc != null) {
      await context.read<VitalsCubit>().loadLatestVitals();
      final messenger = ScaffoldMessenger.of(context);
      context.pop();
      messenger.showSnackBar(const SnackBar(
        content: Text('Document uploaded! OCR analysis running in background.'),
        backgroundColor: AppColors.success, behavior: SnackBarBehavior.floating,
      ));
    } else {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(context.read<DocumentsCubit>().state.error ?? 'Upload failed. Please try again.'),
        backgroundColor: AppColors.error, behavior: SnackBarBehavior.floating,
      ));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(title: const Text('Upload Document')),
      body: SingleChildScrollView(padding: const EdgeInsets.all(16), child: Form(key: _formKey, child: Column(children: [
        _buildFilePicker(),
        const SizedBox(height: 16),
        _buildFormFields(),
        const SizedBox(height: 16),
        _buildTagInput(),
        const SizedBox(height: 24),
        if (_isUploading) ...[
          LinearProgressIndicator(value: _uploadProgress, color: AppColors.primary, backgroundColor: AppColors.primaryLight),
          const SizedBox(height: 8),
          Text('Uploading... ${(_uploadProgress * 100).toStringAsFixed(0)}%', style: AppTextStyles.caption),
          const SizedBox(height: 16),
        ],
        CustomButton(text: 'Upload Document', isLoading: _isUploading, onPressed: _upload),
      ]))),
    );
  }

  Widget _buildFilePicker() => Container(padding: const EdgeInsets.all(20), decoration: BoxDecoration(
    color: AppColors.surface, borderRadius: BorderRadius.circular(16),
    border: Border.all(color: _selectedFile != null ? AppColors.primary : AppColors.border, width: _selectedFile != null ? 2 : 1),
  ), child: _selectedFile != null ? Row(children: [
    Container(width: 48, height: 48, decoration: BoxDecoration(color: AppColors.primaryLight, borderRadius: BorderRadius.circular(12)),
      child: const Icon(Icons.description, color: AppColors.primary, size: 24)),
    const SizedBox(width: 12),
    Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(_fileName ?? '', style: AppTextStyles.body1, overflow: TextOverflow.ellipsis),
      const Text('Tap to change', style: AppTextStyles.caption),
    ])),
    IconButton(icon: const Icon(Icons.close, size: 20, color: AppColors.textHint), onPressed: () => setState(() { _selectedFile = null; _fileName = null; })),
  ]) : Column(children: [
    const Icon(Icons.cloud_upload_outlined, size: 48, color: AppColors.primary),
    const SizedBox(height: 12),
    const Text('Upload Medical Document', style: AppTextStyles.h5),
    const SizedBox(height: 4),
    const Text('PDF, JPG, PNG supported', style: AppTextStyles.caption),
    const SizedBox(height: 16),
    Row(children: [
      Expanded(child: OutlinedButton.icon(icon: const Icon(Icons.folder_outlined, size: 18), label: const Text('Browse'), onPressed: _pickFile)),
      const SizedBox(width: 12),
      Expanded(child: OutlinedButton.icon(icon: const Icon(Icons.camera_alt_outlined, size: 18), label: const Text('Camera'), onPressed: _pickFromCamera)),
    ]),
  ]));

  Widget _buildFormFields() => Container(padding: const EdgeInsets.all(16), decoration: BoxDecoration(
    color: AppColors.surface, borderRadius: BorderRadius.circular(16),
  ), child: Column(children: [
    CustomTextField(controller: _titleCtrl, label: 'Document Title', hint: 'e.g. Blood Test Report',
      validator: (v) => v?.isEmpty ?? true ? 'Required' : null),
    const SizedBox(height: 14),
    DropdownButtonFormField<String>(
      initialValue: _selectedType, decoration: const InputDecoration(labelText: 'Document Type'),
      items: AppConstants.documentTypes.map((t) => DropdownMenuItem(value: t, child: Text(t, style: AppTextStyles.body1))).toList(),
      onChanged: (v) => setState(() => _selectedType = v!),
    ),
    const SizedBox(height: 14),
    CustomTextField(controller: _doctorCtrl, label: 'Doctor Name (Optional)', hint: 'Dr. Smith'),
    const SizedBox(height: 14),
    CustomTextField(controller: _facilityCtrl, label: 'Facility (Optional)', hint: 'City Hospital'),
    const SizedBox(height: 14),
    GestureDetector(
      onTap: () async {
        final date = await showDatePicker(context: context, initialDate: DateTime.now(), firstDate: DateTime(2000), lastDate: DateTime.now());
        if (date != null) setState(() => _documentDate = date);
      },
      child: Container(padding: const EdgeInsets.all(14), decoration: BoxDecoration(
        color: AppColors.surfaceVariant, borderRadius: BorderRadius.circular(12), border: Border.all(color: AppColors.border),
      ), child: Row(children: [
        const Icon(Icons.calendar_today_outlined, color: AppColors.textHint, size: 18),
        const SizedBox(width: 10),
        Text(_documentDate != null ? 'Document Date: ${_documentDate!.day}/${_documentDate!.month}/${_documentDate!.year}' : 'Document Date (Optional)',
          style: AppTextStyles.body1.copyWith(color: _documentDate != null ? AppColors.textPrimary : AppColors.textHint)),
      ])),
    ),
  ]));

  Widget _buildTagInput() => Container(padding: const EdgeInsets.all(16), decoration: BoxDecoration(
    color: AppColors.surface, borderRadius: BorderRadius.circular(16),
  ), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
    const Text('Tags', style: AppTextStyles.h5),
    const SizedBox(height: 8),
    Row(children: [
      Expanded(child: TextField(controller: _tagCtrl, decoration: const InputDecoration(hintText: 'Add tag...', isDense: true, border: OutlineInputBorder()),
        onSubmitted: (v) { if (v.isNotEmpty) { setState(() { _tags.add(v.trim()); _tagCtrl.clear(); }); } })),
      const SizedBox(width: 8),
      ElevatedButton(onPressed: () { if (_tagCtrl.text.isNotEmpty) { setState(() { _tags.add(_tagCtrl.text.trim()); _tagCtrl.clear(); }); } }, child: const Text('Add')),
    ]),
    const SizedBox(height: 8),
    Wrap(spacing: 6, runSpacing: 6, children: _tags.map((t) => Chip(
      label: Text(t, style: AppTextStyles.caption), onDeleted: () => setState(() => _tags.remove(t)),
      backgroundColor: AppColors.primaryLight, deleteIconColor: AppColors.primary,
    )).toList()),
  ]));
}
