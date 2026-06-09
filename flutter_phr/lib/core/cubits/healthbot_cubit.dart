import 'package:flutter_bloc/flutter_bloc.dart';
import '../models/healthbot_model.dart';
import '../services/api_service.dart';

class HealthBotState {
  final List<ChatMessage> messages;
  final bool isLoading;
  final List<String> suggestedFollowUps;
  final List<DrugInteraction> lastInteractions;
  const HealthBotState({this.messages = const [], this.isLoading = false,
    this.suggestedFollowUps = const [], this.lastInteractions = const []});
  HealthBotState copyWith({List<ChatMessage>? messages, bool? isLoading,
    List<String>? suggestedFollowUps, List<DrugInteraction>? lastInteractions}) => HealthBotState(
    messages: messages ?? this.messages, isLoading: isLoading ?? this.isLoading,
    suggestedFollowUps: suggestedFollowUps ?? this.suggestedFollowUps,
    lastInteractions: lastInteractions ?? this.lastInteractions);
}

class HealthBotCubit extends Cubit<HealthBotState> {
  final ApiService _api = ApiService();
  HealthBotCubit() : super(const HealthBotState());

  Future<void> sendMessage(String message) async {
    final userMsg = ChatMessage(id: DateTime.now().millisecondsSinceEpoch.toString(),
      content: message, isUser: true, timestamp: DateTime.now());
    emit(state.copyWith(messages: [...state.messages, userMsg], isLoading: true));
    try {
      final response = await _api.post('/healthbot/chat', data: {
        'message': message,
        'history': state.messages.take(10).map((m) => m.toJson()).toList(),
      });
      final botMsg = ChatMessage.fromJson(response.data['message']);
      emit(state.copyWith(messages: [...state.messages, botMsg], isLoading: false,
        suggestedFollowUps: List<String>.from(response.data['suggestions'] ?? [])));
    } catch (e) {
      final errMsg = ChatMessage(id: 'err_${DateTime.now().millisecondsSinceEpoch}',
        content: 'Sorry, I encountered an error. Please try again.', isUser: false, timestamp: DateTime.now());
      emit(state.copyWith(messages: [...state.messages, errMsg], isLoading: false));
    }
  }

  Future<List<DrugInteraction>> checkDrugInteractions(List<String> drugs) async {
    emit(state.copyWith(isLoading: true));
    try {
      final response = await _api.post('/healthbot/drug-interactions', data: {'drugs': drugs});
      final interactions = (response.data['interactions'] as List).map((i) => DrugInteraction.fromJson(i)).toList();
      emit(state.copyWith(isLoading: false, lastInteractions: interactions));
      return interactions;
    } catch (e) {
      emit(state.copyWith(isLoading: false));
      return [];
    }
  }

  void clearChat() => emit(const HealthBotState());
  void clearInteractions() => emit(state.copyWith(lastInteractions: []));
}
