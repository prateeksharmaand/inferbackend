import 'dart:io';
import 'package:dio/dio.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../models/document_model.dart';
import '../services/api_service.dart';

class DocumentsState {
  final List<DocumentModel> documents;
  final bool isLoading;
  final bool isUploading;
  final double uploadProgress;
  final String? error;
  final String? searchQuery;
  final String? filterType;
  final String sortOrder; // 'newest' | 'oldest'
  final List<String> filterTags;

  const DocumentsState({
    this.documents = const [], this.isLoading = false, this.isUploading = false,
    this.uploadProgress = 0, this.error, this.searchQuery, this.filterType,
    this.sortOrder = 'newest', this.filterTags = const [],
  });

  DocumentsState copyWith({List<DocumentModel>? documents, bool? isLoading,
    bool? isUploading, double? uploadProgress, String? error,
    String? searchQuery, String? filterType,
    String? sortOrder, List<String>? filterTags}) => DocumentsState(
    documents: documents ?? this.documents,
    isLoading: isLoading ?? this.isLoading,
    isUploading: isUploading ?? this.isUploading,
    uploadProgress: uploadProgress ?? this.uploadProgress,
    error: error, searchQuery: searchQuery ?? this.searchQuery,
    filterType: filterType ?? this.filterType,
    sortOrder: sortOrder ?? this.sortOrder,
    filterTags: filterTags ?? this.filterTags,
  );

  Set<String> get allTags {
    final tags = <String>{};
    for (final doc in documents) tags.addAll(doc.tags);
    return tags;
  }

  bool get hasActiveFilters =>
    (filterType != null && filterType!.isNotEmpty) ||
    filterTags.isNotEmpty ||
    sortOrder != 'newest';

  List<DocumentModel> get filteredDocuments {
    var docs = documents.toList();
    if (filterType != null && filterType!.isNotEmpty) {
      docs = docs.where((d) => d.type == filterType).toList();
    }
    if (searchQuery != null && searchQuery!.isNotEmpty) {
      final q = searchQuery!.toLowerCase();
      docs = docs.where((d) =>
        d.title.toLowerCase().contains(q) ||
        d.type.toLowerCase().contains(q) ||
        (d.doctorName?.toLowerCase().contains(q) ?? false) ||
        d.tags.any((t) => t.toLowerCase().contains(q))
      ).toList();
    }
    if (filterTags.isNotEmpty) {
      docs = docs.where((d) => d.tags.any((t) => filterTags.contains(t))).toList();
    }
    if (sortOrder == 'oldest') {
      docs.sort((a, b) => a.uploadedAt.compareTo(b.uploadedAt));
    } else {
      docs.sort((a, b) => b.uploadedAt.compareTo(a.uploadedAt));
    }
    return docs;
  }
}

class DocumentsCubit extends Cubit<DocumentsState> {
  final ApiService _api = ApiService();
  DocumentsCubit() : super(const DocumentsState());

  /// Reload without showing the full loading shimmer — used by the background poll.
  Future<void> silentRefresh() async {
    try {
      final response = await _api.get('/documents');
      final docs = (response.data['documents'] as List)
          .map((d) => DocumentModel.fromJson(d))
          .toList();
      emit(state.copyWith(documents: docs));
    } catch (_) {
      // fail silently — don't overwrite error state
    }
  }

  Future<void> loadDocuments() async {
    emit(state.copyWith(isLoading: true, error: null));
    try {
      final response = await _api.get('/documents');
      final docs = (response.data['documents'] as List).map((d) => DocumentModel.fromJson(d)).toList();
      emit(state.copyWith(documents: docs, isLoading: false));
    } catch (e) {
      emit(state.copyWith(isLoading: false, error: e.toString()));
    }
  }

  Future<DocumentModel?> uploadDocument({
    required File file, required String title, required String type,
    String? doctorName, String? facilityName, DateTime? documentDate, List<String>? tags,
    void Function(double)? onProgress,
  }) async {
    emit(state.copyWith(isUploading: true, uploadProgress: 0, error: null));
    try {
      final formData = await _buildFormData(file, title, type, doctorName, facilityName, documentDate, tags);

      final response = await _api.uploadFile('/documents', formData, onProgress: (sent, total) {
        final progress = sent / total;
        emit(state.copyWith(uploadProgress: progress));
        onProgress?.call(progress);
      });

      final doc = DocumentModel.fromJson(response.data['document']);
      emit(state.copyWith(documents: [doc, ...state.documents], isUploading: false, uploadProgress: 0));

      return doc;
    } catch (e) {
      emit(state.copyWith(isUploading: false, error: e.toString()));
      return null;
    }
  }

  Future<FormData> _buildFormData(File file, String title, String type,
      String? doctorName, String? facilityName, DateTime? documentDate,
      List<String>? tags) async {
    final fileName = file.path.split(RegExp(r'[/\\]')).last;
    return FormData.fromMap({
      'file': await MultipartFile.fromFile(file.path, filename: fileName),
      'title': title,
      'type': type,
      if (doctorName != null) 'doctor_name': doctorName,
      if (facilityName != null) 'facility_name': facilityName,
      if (documentDate != null) 'document_date': documentDate.toIso8601String(),
      if (tags != null && tags.isNotEmpty) 'tags': tags.join(','),
    });
  }

  Future<DocumentModel?> reanalyzeDocument(String id) async {
    try {
      final response = await _api.post(
        '/documents/$id/reanalyze',
        options: Options(receiveTimeout: const Duration(minutes: 3)),
      );
      final updated = DocumentModel.fromJson(response.data['document']);
      emit(state.copyWith(
        documents: state.documents.map((d) => d.id == id ? updated : d).toList(),
      ));
      return updated;
    } catch (e) {
      emit(state.copyWith(error: e.toString()));
      return null;
    }
  }

  Future<bool> deleteDocument(String id) async {
    try {
      await _api.delete('/documents/$id');
      emit(state.copyWith(documents: state.documents.where((d) => d.id != id).toList()));
      return true;
    } catch (e) {
      emit(state.copyWith(error: e.toString()));
      return false;
    }
  }

  void setSearchQuery(String query) => emit(state.copyWith(searchQuery: query));
  void setFilterType(String? type) => emit(state.copyWith(filterType: type));
  void setSortOrder(String order) => emit(state.copyWith(sortOrder: order));
  void toggleFilterTag(String tag) {
    final tags = List<String>.from(state.filterTags);
    if (tags.contains(tag)) tags.remove(tag); else tags.add(tag);
    emit(state.copyWith(filterTags: tags));
  }
  void clearFilters() => emit(state.copyWith(
    searchQuery: '', filterType: null, sortOrder: 'newest', filterTags: [],
  ));
}
