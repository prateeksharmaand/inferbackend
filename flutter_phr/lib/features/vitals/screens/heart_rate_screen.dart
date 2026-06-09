import 'dart:async';
import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../../core/services/camera_hr_service.dart';
import '../../../core/cubits/vitals_cubit.dart';
import '../../../core/theme/app_theme.dart';

class HeartRateScreen extends StatefulWidget {
  const HeartRateScreen({super.key});
  @override
  State<HeartRateScreen> createState() => _HeartRateScreenState();
}

class _HeartRateScreenState extends State<HeartRateScreen> with TickerProviderStateMixin {
  final HeartRateService _hrService = HeartRateService();
  late AnimationController _pulseCtrl;
  late Animation<double> _pulseAnim;
  StreamSubscription<int>? _bpmSub;
  int _currentBpm = 0;
  bool _initialized = false;
  bool _measuring = false;
  bool _saved = false;
  final List<int> _readings = [];
  int _countdown = 30;
  Timer? _timer;
  String _status = 'Place finger on camera lens';

  @override
  void initState() {
    super.initState();
    _pulseCtrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 600));
    _pulseAnim = Tween<double>(begin: 1.0, end: 1.15).animate(CurvedAnimation(parent: _pulseCtrl, curve: Curves.easeInOut));
    _initCamera();
  }

  Future<void> _initCamera() async {
    final ok = await _hrService.initialize();
    if (mounted) setState(() => _initialized = ok);
  }

  Future<void> _startMeasurement() async {
    if (!_initialized) return;
    setState(() { _measuring = true; _saved = false; _readings.clear(); _countdown = 30; _status = 'Keep finger still on lens'; });
    await _hrService.startMonitoring();
    _bpmSub = _hrService.bpmStream?.listen((bpm) {
      if (mounted && bpm > 0) {
        setState(() { _currentBpm = bpm; _readings.add(bpm); });
        _pulseCtrl.forward().then((_) => _pulseCtrl.reverse());
      }
    });
    _timer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted) { t.cancel(); return; }
      setState(() { _countdown--; });
      if (_countdown <= 0) { t.cancel(); _stopAndSave(); }
    });
  }

  Future<void> _stopAndSave() async {
    _timer?.cancel();
    await _hrService.stopMonitoring();
    _bpmSub?.cancel();
    if (_readings.isEmpty) { setState(() { _measuring = false; _status = 'No reading detected. Try again.'; }); return; }
    final avgBpm = _readings.reduce((a, b) => a + b) ~/ _readings.length;
    await context.read<VitalsCubit>().addVital({
      'type': 'heart_rate', 'values': {'bpm': avgBpm},
      'recorded_at': DateTime.now().toIso8601String(), 'source': 'camera',
    });
    if (mounted) setState(() { _measuring = false; _saved = true; _currentBpm = avgBpm; _status = 'Measurement complete!'; });
  }

  Future<void> _cleanUp() async {
    _timer?.cancel();
    _bpmSub?.cancel();
    await _hrService.dispose();
  }

  @override
  void dispose() {
    _timer?.cancel();
    _bpmSub?.cancel();
    _hrService.dispose();
    _pulseCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: !_measuring,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        try { await _cleanUp(); } catch (_) {}
        if (context.mounted) Navigator.of(context).pop();
      },
      child: _buildScaffold(),
    );
  }

  Widget _buildScaffold() {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(title: const Text('Camera Heart Rate')),
      body: SingleChildScrollView(child: Padding(padding: const EdgeInsets.all(16), child: Column(children: [
        _buildInfoCard(),
        const SizedBox(height: 24),
        _buildCameraPreview(),
        const SizedBox(height: 24),
        _buildBpmDisplay(),
        const SizedBox(height: 24),
        _buildControl(),
        if (_saved) ...[const SizedBox(height: 16), _buildSavedBadge()],
      ]))));
  }

  Widget _buildInfoCard() => Container(padding: const EdgeInsets.all(14), decoration: BoxDecoration(
    color: AppColors.primaryLight, borderRadius: BorderRadius.circular(12),
  ), child: const Row(children: [
    Icon(Icons.info_outline, color: AppColors.primary, size: 18),
    SizedBox(width: 10),
    Expanded(child: Text('Cover the camera lens completely with your fingertip for accurate reading. Make sure flashlight is on.',
      style: TextStyle(fontFamily: 'Poppins', fontSize: 12, color: AppColors.primary))),
  ]));

  Widget _buildCameraPreview() => Container(width: 180, height: 180, decoration: BoxDecoration(
    shape: BoxShape.circle,
    border: Border.all(color: _measuring ? AppColors.heartRate : AppColors.border, width: 3),
    boxShadow: _measuring ? [BoxShadow(color: AppColors.heartRate.withOpacity(0.3), blurRadius: 20, spreadRadius: 4)] : [],
  ), child: ClipOval(child: _initialized && _hrService.cameraController != null
    ? CameraPreview(_hrService.cameraController!)
    : Container(color: Colors.grey[200], child: const Icon(Icons.camera_alt, size: 48, color: AppColors.textHint))));

  Widget _buildBpmDisplay() => AnimatedBuilder(animation: _pulseAnim, builder: (_, __) => Transform.scale(
    scale: _measuring ? _pulseAnim.value : 1.0,
    child: Container(padding: const EdgeInsets.all(20), decoration: BoxDecoration(
      color: AppColors.surface, borderRadius: BorderRadius.circular(20),
      boxShadow: [BoxShadow(color: AppColors.heartRate.withOpacity(0.1), blurRadius: 12, offset: const Offset(0, 4))],
    ), child: Column(children: [
      const Icon(Icons.favorite, color: AppColors.heartRate, size: 32),
      const SizedBox(height: 8),
      Text(_currentBpm > 0 ? '$_currentBpm' : '--', style: AppTextStyles.h1.copyWith(color: AppColors.heartRate)),
      const Text('BPM', style: AppTextStyles.body2),
      const SizedBox(height: 4),
      Text(_measuring ? 'Time left: ${_countdown}s' : _status,
        style: AppTextStyles.caption.copyWith(color: _measuring ? AppColors.warning : AppColors.textSecondary)),
    ])),
  ));

  Widget _buildControl() => _measuring
    ? OutlinedButton.icon(icon: const Icon(Icons.stop), label: const Text('Stop'), onPressed: _stopAndSave,
        style: OutlinedButton.styleFrom(foregroundColor: AppColors.error, side: const BorderSide(color: AppColors.error)))
    : ElevatedButton.icon(icon: const Icon(Icons.play_arrow), label: const Text('Start Measurement'),
        onPressed: _initialized ? _startMeasurement : null);

  Widget _buildSavedBadge() => Container(padding: const EdgeInsets.all(12), decoration: BoxDecoration(
    color: AppColors.successLight, borderRadius: BorderRadius.circular(12),
  ), child: const Row(mainAxisAlignment: MainAxisAlignment.center, children: [
    Icon(Icons.check_circle, color: AppColors.success, size: 18),
    SizedBox(width: 8),
    Text('Reading saved to your health record', style: TextStyle(fontFamily: 'Poppins', fontSize: 13, color: AppColors.success)),
  ]));
}
