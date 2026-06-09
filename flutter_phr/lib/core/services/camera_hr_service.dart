import 'dart:async';
import 'dart:math';
import 'package:camera/camera.dart';
import 'package:flutter/material.dart';

class HeartRateService {
  CameraController? _controller;
  StreamController<int>? _bpmController;
  Timer? _analysisTimer;
  final List<double> _redValues = [];
  bool _isMonitoring = false;
  int _currentBpm = 0;

  Stream<int>? get bpmStream => _bpmController?.stream;
  bool get isMonitoring => _isMonitoring;
  int get currentBpm => _currentBpm;

  Future<bool> initialize() async {
    try {
      final cameras = await availableCameras();
      final backCamera = cameras.firstWhere(
        (c) => c.lensDirection == CameraLensDirection.back,
        orElse: () => cameras.first,
      );
      _controller = CameraController(
        backCamera,
        ResolutionPreset.low,
        enableAudio: false,
        imageFormatGroup: ImageFormatGroup.yuv420,
      );
      await _controller!.initialize();
      await _controller!.setFlashMode(FlashMode.torch);
      return true;
    } catch (e) {
      return false;
    }
  }

  Future<void> startMonitoring() async {
    if (_controller == null || !_controller!.value.isInitialized) return;
    _bpmController = StreamController<int>.broadcast();
    _redValues.clear();
    _isMonitoring = true;

    await _controller!.startImageStream((image) {
      if (!_isMonitoring) return;
      // YUV420: planes[2] is the V (chroma-red) plane — highest correlation
      // with red blood volume. planes[0] is Y (luma), not red.
      final plane = image.planes.length >= 3 ? image.planes[2] : image.planes[0];
      final bytes = plane.bytes;
      if (bytes.isEmpty) return;
      double sum = 0;
      for (final b in bytes) {
        sum += b;
      }
      _redValues.add(sum / bytes.length);
      if (_redValues.length > 300) _redValues.removeAt(0);
    });

    _analysisTimer = Timer.periodic(const Duration(seconds: 2), (_) {
      if (_redValues.length >= 30) {
        final bpm = _calculateBpm();
        if (bpm > 0) {
          _currentBpm = bpm;
          _bpmController?.add(bpm);
        }
      }
    });
  }

  int _calculateBpm() {
    if (_redValues.length < 30) return 0;
    final data = List<double>.from(_redValues);
    final mean = data.reduce((a, b) => a + b) / data.length;
    final normalized = data.map((v) => v - mean).toList();

    int peaks = 0;
    for (int i = 1; i < normalized.length - 1; i++) {
      if (normalized[i] > normalized[i - 1] && normalized[i] > normalized[i + 1]) {
        if (normalized[i] > 0.5) peaks++;
      }
    }

    // Assume ~30 fps; duration in seconds
    const fps = 30.0;
    final durationSec = data.length / fps;
    final bpm = (peaks / durationSec * 60).round();
    return (bpm >= 40 && bpm <= 200) ? bpm : 0;
  }

  Future<void> stopMonitoring() async {
    _isMonitoring = false;
    _analysisTimer?.cancel();
    try {
      if (_controller?.value.isStreamingImages == true) {
        await _controller?.stopImageStream();
      }
    } catch (_) {}
    try { await _controller?.setFlashMode(FlashMode.off); } catch (_) {}
    _bpmController?.close();
    _bpmController = null;
  }

  Future<void> dispose() async {
    await stopMonitoring();
    try { _controller?.dispose(); } catch (_) {}
    _controller = null;
  }

  CameraController? get cameraController => _controller;
}
