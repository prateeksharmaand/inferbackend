import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:dio/dio.dart';
import '../../../core/cubits/healthbot_cubit.dart';
import '../../../core/models/healthbot_model.dart';
import '../../../core/theme/app_theme.dart';

class HealthBotScreen extends StatefulWidget {
  const HealthBotScreen({super.key});
  @override
  State<HealthBotScreen> createState() => _HealthBotScreenState();
}

class _HealthBotScreenState extends State<HealthBotScreen> with SingleTickerProviderStateMixin {
  final _msgCtrl = TextEditingController();
  final _scrollCtrl = ScrollController();
  late TabController _tabCtrl;

  // Controllers are captured from Autocomplete's fieldViewBuilder
  TextEditingController? _drug1FieldCtrl;
  TextEditingController? _drug2FieldCtrl;

  static final _dio = Dio(BaseOptions(
    connectTimeout: const Duration(seconds: 5),
    receiveTimeout: const Duration(seconds: 5),
  ));

  static const _localMeds = [
    'Aspirin', 'Ibuprofen', 'Paracetamol', 'Acetaminophen', 'Metformin',
    'Atorvastatin', 'Lisinopril', 'Amlodipine', 'Omeprazole', 'Metoprolol',
    'Simvastatin', 'Losartan', 'Azithromycin', 'Amoxicillin', 'Ciprofloxacin',
    'Doxycycline', 'Prednisone', 'Levothyroxine', 'Warfarin', 'Clopidogrel',
    'Pantoprazole', 'Gabapentin', 'Sertraline', 'Escitalopram', 'Fluoxetine',
    'Alprazolam', 'Diazepam', 'Tramadol', 'Codeine', 'Morphine',
    'Insulin', 'Glipizide', 'Glyburide', 'Rosuvastatin', 'Pravastatin',
    'Hydrochlorothiazide', 'Furosemide', 'Spironolactone', 'Carvedilol', 'Bisoprolol',
    'Enalapril', 'Ramipril', 'Valsartan', 'Candesartan', 'Telmisartan',
    'Cetirizine', 'Loratadine', 'Fexofenadine', 'Montelukast', 'Salbutamol',
    'Prednisolone', 'Dexamethasone', 'Hydrocortisone', 'Naproxen', 'Diclofenac',
    'Celecoxib', 'Meloxicam', 'Ranitidine', 'Famotidine', 'Lansoprazole',
    'Esomeprazole', 'Metoclopramide', 'Ondansetron', 'Domperidone',
    'Clonazepam', 'Lorazepam', 'Quetiapine', 'Olanzapine', 'Risperidone',
    'Lithium', 'Valproate', 'Carbamazepine', 'Phenytoin', 'Levetiracetam',
    'Amitriptyline', 'Duloxetine', 'Venlafaxine', 'Mirtazapine',
    'Tamsulosin', 'Sildenafil', 'Tadalafil', 'Alendronate', 'Allopurinol',
    'Colchicine', 'Methotrexate', 'Hydroxychloroquine', 'Sulfasalazine',
    'Folic Acid', 'Vitamin D', 'Vitamin B12', 'Iron', 'Calcium',
  ];

  Future<Iterable<String>> _searchDrugs(String query) async {
    if (query.length < 2) return const [];
    try {
      final res = await _dio.get(
        'https://api.fda.gov/drug/label.json',
        queryParameters: {
          'search': 'openfda.substance_name:${query.toLowerCase()}*',
          'count': 'openfda.substance_name.exact',
          'limit': '10',
        },
      );
      final results = (res.data['results'] as List? ?? []);
      return results.map<String>((e) {
        final term = (e['term'] as String).toLowerCase();
        return term.split(' ').map((w) => w.isNotEmpty ? '${w[0].toUpperCase()}${w.substring(1)}' : w).join(' ');
      }).take(8);
    } catch (_) {
      return _localMeds
          .where((m) => m.toLowerCase().contains(query.toLowerCase()))
          .take(8);
    }
  }

  @override
  void initState() {
    super.initState();
    _tabCtrl = TabController(length: 2, vsync: this);
    _tabCtrl.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _msgCtrl.dispose();
    _scrollCtrl.dispose();
    _tabCtrl.dispose();
    super.dispose();
  }

  void _sendMessage() {
    if (_msgCtrl.text.trim().isEmpty) return;
    context.read<HealthBotCubit>().sendMessage(_msgCtrl.text.trim());
    _msgCtrl.clear();
    Future.delayed(const Duration(milliseconds: 300), () {
      if (_scrollCtrl.hasClients) {
        _scrollCtrl.animateTo(
          _scrollCtrl.position.maxScrollExtent,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final botState = context.watch<HealthBotCubit>().state;
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: Row(children: [
          Container(
            width: 36, height: 36,
            decoration: BoxDecoration(
              gradient: const LinearGradient(colors: AppColors.aiGradient, begin: Alignment.topLeft, end: Alignment.bottomRight),
              borderRadius: BorderRadius.circular(10),
            ),
            child: const Icon(Icons.auto_awesome, color: Colors.white, size: 18),
          ),
          const SizedBox(width: 10),
          const Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('AI Consult', style: AppTextStyles.h5),
            Text('Your Health, Smarter Every Day', style: AppTextStyles.caption),
          ]),
        ]),
        actions: [
          if (_tabCtrl.index == 0)
            IconButton(icon: const Icon(Icons.delete_sweep_outlined), onPressed: () => context.read<HealthBotCubit>().clearChat())
          else
            IconButton(
              icon: const Icon(Icons.refresh_rounded),
              tooltip: 'Reset',
              onPressed: botState.isLoading ? null : () {
                _drug1FieldCtrl?.clear();
                _drug2FieldCtrl?.clear();
                context.read<HealthBotCubit>().clearInteractions();
                FocusManager.instance.primaryFocus?.unfocus();
              },
            ),
        ],
        bottom: TabBar(controller: _tabCtrl, tabs: const [Tab(text: 'Chat'), Tab(text: 'Drug Checker')]),
      ),
      body: TabBarView(controller: _tabCtrl, children: [
        _buildChatTab(botState),
        _buildDrugCheckerTab(botState),
      ]),
    );
  }

  Widget _buildChatTab(HealthBotState state) => Column(children: [
    Expanded(child: state.messages.isEmpty
        ? _buildWelcome()
        : ListView.builder(
            controller: _scrollCtrl,
            padding: const EdgeInsets.all(16),
            itemCount: state.messages.length + (state.isLoading ? 1 : 0),
            itemBuilder: (_, i) {
              if (i == state.messages.length) return _buildTypingIndicator();
              return _ChatBubble(message: state.messages[i]);
            },
          )),
    if (state.suggestedFollowUps.isNotEmpty)
      SizedBox(
        height: 44,
        child: ListView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 12),
          children: state.suggestedFollowUps.map((s) => GestureDetector(
            onTap: () { _msgCtrl.text = s; _sendMessage(); },
            child: Container(
              margin: const EdgeInsets.only(right: 8),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: AppColors.primaryLight,
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: AppColors.primary.withValues(alpha: 0.3)),
              ),
              child: Text(s, style: const TextStyle(fontFamily: 'Poppins', fontSize: 12, color: AppColors.primary)),
            ),
          )).toList(),
        ),
      ),
    Container(
      padding: EdgeInsets.only(left: 12, right: 8, top: 8, bottom: MediaQuery.of(context).padding.bottom + 8),
      decoration: const BoxDecoration(color: AppColors.surface, border: Border(top: BorderSide(color: AppColors.divider))),
      child: Row(children: [
        Expanded(child: TextField(
          controller: _msgCtrl,
          decoration: const InputDecoration(
            hintText: 'Ask about symptoms, medicines...',
            border: OutlineInputBorder(borderRadius: BorderRadius.all(Radius.circular(24))),
            filled: true,
            fillColor: AppColors.surfaceVariant,
            contentPadding: EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          ),
          maxLines: null,
          onSubmitted: (_) => _sendMessage(),
        )),
        const SizedBox(width: 8),
        Container(
          decoration: const BoxDecoration(color: AppColors.primary, shape: BoxShape.circle),
          child: IconButton(icon: const Icon(Icons.send, color: Colors.white, size: 20), onPressed: _sendMessage),
        ),
      ]),
    ),
  ]);

  Widget _buildWelcome() => SingleChildScrollView(
    padding: const EdgeInsets.all(24),
    child: Column(children: [
      const SizedBox(height: 32),
      Container(
        width: 72, height: 72,
        decoration: BoxDecoration(
          gradient: const LinearGradient(colors: AppColors.aiGradient, begin: Alignment.topLeft, end: Alignment.bottomRight),
          borderRadius: BorderRadius.circular(24),
          boxShadow: [BoxShadow(color: AppColors.primary.withValues(alpha: 0.3), blurRadius: 16, offset: const Offset(0, 6))],
        ),
        child: const Icon(Icons.auto_awesome, color: Colors.white, size: 36),
      ),
      const SizedBox(height: 20),
      Text('Consult AI on Health Matters', style: AppTextStyles.h3.copyWith(color: AppColors.primary, fontWeight: FontWeight.w700), textAlign: TextAlign.center),
      const SizedBox(height: 6),
      const Text('Your Health, Smarter Every Day', style: AppTextStyles.body2, textAlign: TextAlign.center),
      const SizedBox(height: 32),
      ...['What are symptoms of high blood pressure?', 'Is my BP reading of 140/90 dangerous?', 'What should I eat for diabetes?', 'Give me food recommendations for my health'].map((q) =>
        GestureDetector(
          onTap: () { _msgCtrl.text = q; _sendMessage(); },
          child: Container(
            margin: const EdgeInsets.only(bottom: 10),
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: AppColors.surface,
              borderRadius: BorderRadius.circular(16),
              boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 8, offset: const Offset(0, 2))],
            ),
            child: Row(children: [
              Container(width: 36, height: 36, decoration: BoxDecoration(color: AppColors.primaryLight, borderRadius: BorderRadius.circular(10)), child: const Icon(Icons.chat_rounded, color: AppColors.primary, size: 18)),
              const SizedBox(width: 12),
              Expanded(child: Text(q, style: AppTextStyles.body1)),
              const Icon(Icons.arrow_forward_ios_rounded, color: AppColors.textHint, size: 14),
            ]),
          ),
        )),
    ]),
  );

  Widget _buildTypingIndicator() => const Align(
    alignment: Alignment.centerLeft,
    child: Padding(
      padding: EdgeInsets.only(bottom: 8),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        SizedBox(width: 48, height: 48, child: CircleAvatar(backgroundColor: AppColors.primaryLight, child: Icon(Icons.smart_toy, color: AppColors.primary, size: 20))),
        SizedBox(width: 8),
        Card(child: Padding(padding: EdgeInsets.all(12), child: Row(mainAxisSize: MainAxisSize.min, children: [
          SizedBox(width: 4, height: 4, child: CircularProgressIndicator(strokeWidth: 1.5)),
          SizedBox(width: 6),
          Text('Typing...', style: AppTextStyles.caption),
        ]))),
      ]),
    ),
  );

  Widget _buildDrugCheckerTab(HealthBotState state) => BlocListener<HealthBotCubit, HealthBotState>(
    listenWhen: (prev, curr) => prev.isLoading && !curr.isLoading,
    listener: (_, __) => FocusManager.instance.primaryFocus?.unfocus(),
    child: SingleChildScrollView(
    padding: const EdgeInsets.all(16),
    child: Column(children: [
      Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(16)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('Drug Interaction Checker', style: AppTextStyles.h4),
          const SizedBox(height: 4),
          const Text('Check if two medicines can be taken together safely', style: AppTextStyles.body2),
          const SizedBox(height: 16),
          _MedicineAutocomplete(
            label: 'Medicine 1',
            hint: 'e.g. Metformin',
            searchDrugs: _searchDrugs,
            onControllerReady: (ctrl) => _drug1FieldCtrl = ctrl,
          ),
          const SizedBox(height: 8),
          const Center(child: Icon(Icons.swap_vert, color: AppColors.textHint)),
          const SizedBox(height: 8),
          _MedicineAutocomplete(
            label: 'Medicine 2',
            hint: 'e.g. Aspirin',
            searchDrugs: _searchDrugs,
            onControllerReady: (ctrl) => _drug2FieldCtrl = ctrl,
          ),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              icon: const Icon(Icons.search),
              label: const Text('Check Interaction'),
              onPressed: state.isLoading ? null : () {
                final d1 = _drug1FieldCtrl?.text.trim() ?? '';
                final d2 = _drug2FieldCtrl?.text.trim() ?? '';
                if (d1.isEmpty || d2.isEmpty) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Please enter both medicine names')),
                  );
                  return;
                }
                context.read<HealthBotCubit>().checkDrugInteractions([d1, d2]);
              },
            ),
          ),
        ]),
      ),
      const SizedBox(height: 16),
      if (state.isLoading) const CircularProgressIndicator(),
      ...state.lastInteractions.map((i) => _buildInteractionCard(i)),
    ]),
  ));

  Widget _buildInteractionCard(DrugInteraction i) {
    final Color color = i.severity == 'major' ? AppColors.error : i.severity == 'moderate' ? AppColors.warning : AppColors.success;
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.05),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Icon(i.severity == 'major' ? Icons.warning : i.severity == 'moderate' ? Icons.info : Icons.check_circle, color: color, size: 20),
          const SizedBox(width: 8),
          Text('${i.severity.toUpperCase()} Interaction', style: TextStyle(fontFamily: 'Poppins', fontSize: 13, color: color, fontWeight: FontWeight.w700)),
        ]),
        const SizedBox(height: 8),
        Text('${i.drug1} + ${i.drug2}', style: AppTextStyles.h5),
        const SizedBox(height: 6),
        Text(i.description, style: AppTextStyles.body2),
        const SizedBox(height: 8),
        Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(color: color.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(8)),
          child: Text(i.recommendation, style: AppTextStyles.caption.copyWith(color: color)),
        ),
      ]),
    );
  }
}

// ---------- Autocomplete field ----------

class _MedicineAutocomplete extends StatelessWidget {
  final String label;
  final String hint;
  final Future<Iterable<String>> Function(String) searchDrugs;
  final void Function(TextEditingController) onControllerReady;

  const _MedicineAutocomplete({
    required this.label,
    required this.hint,
    required this.searchDrugs,
    required this.onControllerReady,
  });

  @override
  Widget build(BuildContext context) {
    return Autocomplete<String>(
      optionsBuilder: (TextEditingValue textEditingValue) => searchDrugs(textEditingValue.text),
      displayStringForOption: (option) => option,
      onSelected: (_) {},
      fieldViewBuilder: (context, textEditingController, focusNode, onFieldSubmitted) {
        onControllerReady(textEditingController);
        return TextField(
          controller: textEditingController,
          focusNode: focusNode,
          textCapitalization: TextCapitalization.words,
          decoration: InputDecoration(
            labelText: label,
            hintText: hint,
            prefixIcon: const Icon(Icons.medication_outlined),
            suffixIcon: ValueListenableBuilder<TextEditingValue>(
              valueListenable: textEditingController,
              builder: (_, value, __) => value.text.isEmpty
                  ? const SizedBox.shrink()
                  : IconButton(
                      icon: const Icon(Icons.clear, size: 18),
                      onPressed: textEditingController.clear,
                    ),
            ),
          ),
        );
      },
      optionsViewBuilder: (context, onSelected, options) {
        return Align(
          alignment: Alignment.topLeft,
          child: Material(
            elevation: 4,
            borderRadius: BorderRadius.circular(14),
            color: AppColors.surface,
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxHeight: 240),
              child: ListView.separated(
                padding: const EdgeInsets.symmetric(vertical: 6),
                shrinkWrap: true,
                itemCount: options.length,
                separatorBuilder: (_, __) => const Divider(height: 1, indent: 16, endIndent: 16),
                itemBuilder: (context, index) {
                  final option = options.elementAt(index);
                  return InkWell(
                    borderRadius: BorderRadius.circular(8),
                    onTap: () => onSelected(option),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                      child: Row(children: [
                        const Icon(Icons.medication_rounded, size: 16, color: AppColors.primary),
                        const SizedBox(width: 10),
                        Expanded(child: Text(option, style: AppTextStyles.body1)),
                      ]),
                    ),
                  );
                },
              ),
            ),
          ),
        );
      },
    );
  }
}

// ---------- Chat bubble ----------

class _ChatBubble extends StatelessWidget {
  final ChatMessage message;
  const _ChatBubble({required this.message});

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 12),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.end,
      mainAxisAlignment: message.isUser ? MainAxisAlignment.end : MainAxisAlignment.start,
      children: [
        if (!message.isUser) ...[
          const CircleAvatar(backgroundColor: AppColors.primaryLight, radius: 18, child: Icon(Icons.smart_toy, color: AppColors.primary, size: 18)),
          const SizedBox(width: 8),
        ],
        Flexible(child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          decoration: BoxDecoration(
            color: message.isUser ? AppColors.primary : AppColors.surface,
            borderRadius: BorderRadius.only(
              topLeft: const Radius.circular(16),
              topRight: const Radius.circular(16),
              bottomLeft: Radius.circular(message.isUser ? 16 : 4),
              bottomRight: Radius.circular(message.isUser ? 4 : 16),
            ),
            boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 4, offset: const Offset(0, 2))],
          ),
          child: Text(message.content, style: TextStyle(fontFamily: 'Poppins', fontSize: 13, color: message.isUser ? Colors.white : AppColors.textPrimary, height: 1.4)),
        )),
        if (message.isUser) ...[
          const SizedBox(width: 8),
          const CircleAvatar(backgroundColor: AppColors.primaryLight, radius: 18, child: Icon(Icons.person, color: AppColors.primary, size: 18)),
        ],
      ],
    ),
  );
}
