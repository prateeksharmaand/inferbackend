import 'package:flutter_bloc/flutter_bloc.dart';
import '../services/api_service.dart';

class AllVitalsState {
  final Map<String, dynamic> vitals;
  final bool isLoading;
  final String? error;

  const AllVitalsState({this.vitals = const {}, this.isLoading = false, this.error});

  AllVitalsState copyWith({Map<String, dynamic>? vitals, bool? isLoading, String? error}) =>
      AllVitalsState(
        vitals: vitals ?? this.vitals,
        isLoading: isLoading ?? this.isLoading,
        error: error,
      );
}

class AllVitalsCubit extends Cubit<AllVitalsState> {
  final ApiService _api = ApiService();
  AllVitalsCubit() : super(const AllVitalsState());

  Future<void> loadAllVitals() async {
    emit(state.copyWith(isLoading: true, error: null));
    try {
      final response = await _api.get('/vitals/all-latest');
      final vitals = Map<String, dynamic>.from(response.data['vitals'] as Map? ?? {});
      emit(state.copyWith(vitals: vitals, isLoading: false));
    } catch (e) {
      emit(state.copyWith(isLoading: false, error: e.toString()));
    }
  }
}
