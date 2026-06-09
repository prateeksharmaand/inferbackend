import 'dart:ui';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:firebase_messaging/firebase_messaging.dart';

@pragma('vm:entry-point')
Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await NotificationService.instance.showNotification(
    id: message.hashCode,
    title: message.notification?.title ?? 'PHR Alert',
    body: message.notification?.body ?? '',
    payload: message.data.toString(),
  );
}

class NotificationService {
  static final NotificationService instance = NotificationService._internal();
  factory NotificationService() => instance;
  NotificationService._internal();

  final FlutterLocalNotificationsPlugin _localNotifications = FlutterLocalNotificationsPlugin();
  final FirebaseMessaging _fcm = FirebaseMessaging.instance;

  Future<void> initialize() async {
    const androidInit = AndroidInitializationSettings('@mipmap/ic_launcher');
    const iosInit = DarwinInitializationSettings(
      requestAlertPermission: true, requestBadgePermission: true, requestSoundPermission: true,
    );
    const initSettings = InitializationSettings(android: androidInit, iOS: iosInit);
    await _localNotifications.initialize(initSettings,
      onDidReceiveNotificationResponse: _onNotificationTapped);

    await _fcm.requestPermission(alert: true, badge: true, sound: true);
    FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackgroundHandler);
    FirebaseMessaging.onMessage.listen(_handleForegroundMessage);
  }

  void _onNotificationTapped(NotificationResponse response) {}

  void _handleForegroundMessage(RemoteMessage message) {
    if (message.notification != null) {
      showNotification(
        id: message.hashCode,
        title: message.notification!.title ?? 'PHR',
        body: message.notification!.body ?? '',
        payload: message.data.toString(),
      );
    }
  }

  Future<void> showNotification({required int id, required String title, required String body, String? payload}) async {
    const androidDetails = AndroidNotificationDetails(
      'phr_channel', 'PHR Notifications',
      channelDescription: 'Health reminders and alerts',
      importance: Importance.high, priority: Priority.high,
      color: Color(0xFF7C3AED),
    );
    const iosDetails = DarwinNotificationDetails(presentAlert: true, presentBadge: true, presentSound: true);
    const details = NotificationDetails(android: androidDetails, iOS: iosDetails);
    await _localNotifications.show(id, title, body, details, payload: payload);
  }

  Future<void> showVitalAlert({required String vitalType, required String value, required String status}) async {
    await showNotification(
      id: DateTime.now().millisecondsSinceEpoch ~/ 1000,
      title: 'Vital Alert: ${_formatVitalName(vitalType)}',
      body: 'Your $vitalType reading of $value is $status. Please consult a doctor.',
      payload: 'vital_alert_$vitalType',
    );
  }

  String _formatVitalName(String type) {
    switch (type) {
      case 'blood_pressure': return 'Blood Pressure';
      case 'glucose': return 'Blood Glucose';
      case 'spo2': return 'Oxygen Saturation';
      case 'heart_rate': return 'Heart Rate';
      case 'temperature': return 'Body Temperature';
      default: return type;
    }
  }

  Future<void> cancelReminder(int id) => _localNotifications.cancel(id);

  Future<void> cancelAllReminders() => _localNotifications.cancelAll();

  Future<String?> getFcmToken() => _fcm.getToken();
}
