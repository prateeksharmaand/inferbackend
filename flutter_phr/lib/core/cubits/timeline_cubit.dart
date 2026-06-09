import 'package:flutter_bloc/flutter_bloc.dart';
import '../models/document_model.dart';
import '../services/api_service.dart';

class TimelineState {
  final List<TimelineEvent> events;
  final bool isLoading;
  final String? error;
  const TimelineState({this.events = const [], this.isLoading = false, this.error});
  TimelineState copyWith({List<TimelineEvent>? events, bool? isLoading, String? error}) =>
    TimelineState(events: events ?? this.events, isLoading: isLoading ?? this.isLoading, error: error);
}

class TimelineCubit extends Cubit<TimelineState> {
  final ApiService _api = ApiService();
  TimelineCubit() : super(const TimelineState());

  Future<void> loadTimeline({DateTime? from, DateTime? to}) async {
    emit(state.copyWith(isLoading: true));
    try {
      final params = <String, dynamic>{};
      if (from != null) params['from'] = from.toIso8601String();
      if (to != null) params['to'] = to.toIso8601String();
      final response = await _api.get('/timeline', params: params);
      final events = (response.data['events'] as List).map((e) => TimelineEvent.fromJson(e)).toList();
      emit(state.copyWith(events: events, isLoading: false));
    } catch (e) {
      emit(state.copyWith(isLoading: false, error: e.toString()));
    }
  }
}
