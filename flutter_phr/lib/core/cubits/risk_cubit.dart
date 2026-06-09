import 'package:flutter_bloc/flutter_bloc.dart';
import '../models/risk_model.dart';
import '../services/api_service.dart';

class RiskState {
  final RiskResult? result;
  final bool isLoading;
  final String? error;

  const RiskState({this.result, this.isLoading = false, this.error});

  RiskState copyWith({RiskResult? result, bool? isLoading, String? error}) =>
      RiskState(
        result:    result    ?? this.result,
        isLoading: isLoading ?? this.isLoading,
        error:     error,
      );
}

class RiskCubit extends Cubit<RiskState> {
  final ApiService _api = ApiService();

  RiskCubit() : super(const RiskState());

  Future<void> loadRisk({bool refresh = false}) async {
    emit(state.copyWith(isLoading: true, error: null));
    try {
      final response = await _api.get('/risk', params: {'refresh': refresh ? 'true' : 'false'});
      final result = RiskResult.fromJson(response.data['risk'] as Map<String, dynamic>);
      emit(RiskState(result: result, isLoading: false));
    } catch (e) {
      emit(state.copyWith(isLoading: false, error: e.toString()));
    }
  }

  Future<void> refresh() => loadRisk(refresh: true);
}
