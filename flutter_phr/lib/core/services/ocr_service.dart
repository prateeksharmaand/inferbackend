import 'dart:io';
import 'package:google_mlkit_text_recognition/google_mlkit_text_recognition.dart';
import 'package:image_picker/image_picker.dart';
import 'api_service.dart';
import '../models/vital_model.dart';

class OcrService {
  final TextRecognizer _textRecognizer = TextRecognizer(script: TextRecognitionScript.latin);
  final ApiService _api = ApiService();
  final ImagePicker _picker = ImagePicker();

  Future<String?> extractTextFromFile(File imageFile) async {
    try {
      final inputImage = InputImage.fromFile(imageFile);
      final recognizedText = await _textRecognizer.processImage(inputImage);
      return recognizedText.text;
    } catch (e) {
      return null;
    }
  }

  Future<String?> extractTextFromCamera() async {
    final xFile = await _picker.pickImage(source: ImageSource.camera, imageQuality: 85);
    if (xFile == null) return null;
    return extractTextFromFile(File(xFile.path));
  }

  Future<String?> extractTextFromGallery() async {
    final xFile = await _picker.pickImage(source: ImageSource.gallery, imageQuality: 85);
    if (xFile == null) return null;
    return extractTextFromFile(File(xFile.path));
  }

  Future<OcrExtractionResult?> extractAndAnalyzeDocument(File file) async {
    final ocrText = await extractTextFromFile(file);
    if (ocrText == null || ocrText.isEmpty) return null;
    try {
      final response = await _api.post('/ocr/analyze', data: {'text': ocrText});
      return OcrExtractionResult(
        rawText: ocrText,
        extractedVitals: Map<String, dynamic>.from(response.data['vitals'] ?? {}),
        documentType: response.data['document_type'],
        doctorName: response.data['doctor_name'],
        facilityName: response.data['facility_name'],
        documentDate: response.data['document_date'] != null
            ? DateTime.parse(response.data['document_date']) : null,
        suggestedTitle: response.data['suggested_title'],
        confidence: (response.data['confidence'] ?? 0).toDouble(),
      );
    } catch (e) {
      return OcrExtractionResult(rawText: ocrText, extractedVitals: {}, confidence: 0);
    }
  }

  void dispose() => _textRecognizer.close();
}

class OcrExtractionResult {
  final String rawText;
  final Map<String, dynamic> extractedVitals;
  final String? documentType;
  final String? doctorName;
  final String? facilityName;
  final DateTime? documentDate;
  final String? suggestedTitle;
  final double confidence;

  const OcrExtractionResult({
    required this.rawText, required this.extractedVitals, required this.confidence,
    this.documentType, this.doctorName, this.facilityName, this.documentDate, this.suggestedTitle,
  });

  bool get hasVitals => extractedVitals.isNotEmpty;
}
