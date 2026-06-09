import 'package:flutter_bloc/flutter_bloc.dart';
import '../models/assessment_model.dart';
import '../services/api_service.dart';

// ── States ────────────────────────────────────────────────────────────────────

sealed class SAState {}

class SACategories extends SAState {}

class SALoadingQuestions extends SAState {
  final String category;
  final String subcategory;
  SALoadingQuestions({required this.category, required this.subcategory});
}

class SAQuestionnaire extends SAState {
  final String category;
  final String subcategory;
  final List<AssessmentQuestion> questions;
  final int currentIndex;
  final Map<int, dynamic> answers;

  SAQuestionnaire({
    required this.category,
    required this.subcategory,
    required this.questions,
    required this.currentIndex,
    required this.answers,
  });

  SAQuestionnaire copyWith({int? currentIndex, Map<int, dynamic>? answers}) =>
      SAQuestionnaire(
        category:     category,
        subcategory:  subcategory,
        questions:    questions,
        currentIndex: currentIndex ?? this.currentIndex,
        answers:      answers ?? this.answers,
      );

  AssessmentQuestion get current => questions[currentIndex];
  bool get isLast => currentIndex == questions.length - 1;

  bool get hasAnswer {
    final ans = answers[current.id];
    if (current.isMultiple) return ans is List && ans.isNotEmpty;
    return ans != null && ans.toString().isNotEmpty;
  }
}

class SALoadingResult extends SAState {
  final String category;
  final String subcategory;
  SALoadingResult({required this.category, required this.subcategory});
}

class SAResult extends SAState {
  final String category;
  final String subcategory;
  final AssessmentResult result;
  SAResult({required this.category, required this.subcategory, required this.result});
}

class SAError extends SAState {
  final String message;
  final SAState? from;
  SAError({required this.message, this.from});
}

// ── Cubit ─────────────────────────────────────────────────────────────────────

class SelfAssessmentCubit extends Cubit<SAState> {
  final ApiService _api = ApiService();

  SelfAssessmentCubit() : super(SACategories());

  void reset() => emit(SACategories());

  Future<void> startAssessment(String category, String subcategory) async {
    emit(SALoadingQuestions(category: category, subcategory: subcategory));
    try {
      final response = await _api.post('/assessment/questions', data: {
        'category': category,
        'subcategory': subcategory,
      });
      final questions = (response.data['questions'] as List)
          .map((q) => AssessmentQuestion.fromJson(q as Map<String, dynamic>))
          .toList();
      emit(SAQuestionnaire(
        category:     category,
        subcategory:  subcategory,
        questions:    questions,
        currentIndex: 0,
        answers:      {},
      ));
    } catch (e) {
      emit(SAError(message: 'Failed to generate questions. Please try again.', from: SACategories()));
    }
  }

  void answerSingle(int questionId, String answer) {
    final s = state;
    if (s is! SAQuestionnaire) return;
    emit(s.copyWith(answers: {...s.answers, questionId: answer}));
  }

  void answerMultiple(int questionId, String option, bool selected) {
    final s = state;
    if (s is! SAQuestionnaire) return;
    final current = List<String>.from(s.answers[questionId] as List? ?? []);
    if (selected) {
      if (!current.contains(option)) current.add(option);
    } else {
      current.remove(option);
    }
    emit(s.copyWith(answers: {...s.answers, questionId: List<String>.from(current)}));
  }

  void nextQuestion() {
    final s = state;
    if (s is! SAQuestionnaire || s.isLast) return;
    emit(s.copyWith(currentIndex: s.currentIndex + 1));
  }

  void prevQuestion() {
    final s = state;
    if (s is! SAQuestionnaire) return;
    if (s.currentIndex == 0) {
      emit(SACategories());
    } else {
      emit(s.copyWith(currentIndex: s.currentIndex - 1));
    }
  }

  Future<void> submitAnswers() async {
    final s = state;
    if (s is! SAQuestionnaire) return;

    final answers = s.questions.map((q) => AssessmentAnswer(
      questionId: q.id,
      question:   q.text,
      answer:     s.answers[q.id] ?? '',
    )).toList();

    emit(SALoadingResult(category: s.category, subcategory: s.subcategory));
    try {
      final response = await _api.post('/assessment/analyze', data: {
        'category':   s.category,
        'subcategory': s.subcategory,
        'answers':    answers.map((a) => a.toJson()).toList(),
      });
      final result = AssessmentResult.fromJson(
        response.data['result'] as Map<String, dynamic>,
      );
      emit(SAResult(category: s.category, subcategory: s.subcategory, result: result));
    } catch (e) {
      emit(SAError(
        message: 'Failed to analyze answers. Please try again.',
        from: SAQuestionnaire(
          category:     s.category,
          subcategory:  s.subcategory,
          questions:    s.questions,
          currentIndex: s.questions.length - 1,
          answers:      s.answers,
        ),
      ));
    }
  }

  void retryFromError() {
    final s = state;
    if (s is SAError && s.from != null) emit(s.from!);
    else emit(SACategories());
  }
}
