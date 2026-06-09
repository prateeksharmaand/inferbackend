import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

class AppColors {
  static const Color primary = Color(0xFF7B6EF6);
  static const Color primaryLight = Color(0xFFEEEBFF);
  static const Color primaryDark = Color(0xFF5A4BD1);
  static const Color secondary = Color(0xFF9C8FFA);
  static const Color accent = Color(0xFFB8AEFB);
  static const Color background = Color(0xFFF5F4FF);
  static const Color surface = Color(0xFFFFFFFF);
  static const Color surfaceVariant = Color(0xFFF8F7FF);
  static const Color surfaceContainerLow = Color(0xFFF2F0FF);
  static const Color error = Color(0xFFE53935);
  static const Color errorLight = Color(0xFFFFEBEE);
  static const Color success = Color(0xFF00BFA5);
  static const Color successLight = Color(0xFFE0F2F1);
  static const Color warning = Color(0xFFFF7043);
  static const Color warningLight = Color(0xFFFBE9E7);
  static const Color info = Color(0xFF1E88E5);
  static const Color infoLight = Color(0xFFE3F2FD);
  static const Color textPrimary = Color(0xFF1C1B1F);
  static const Color textSecondary = Color(0xFF49454F);
  static const Color textHint = Color(0xFF938F99);
  static const Color textOnPrimary = Color(0xFFFFFFFF);
  static const Color divider = Color(0xFFE7E0EC);
  static const Color border = Color(0xFFCAC4D0);
  static const Color outlineVariant = Color(0xFFE7E0EC);
  static const Color bpNormal = Color(0xFF00BFA5);
  static const Color bpElevated = Color(0xFFFF7043);
  static const Color bpHigh = Color(0xFFE53935);
  static const Color bpLow = Color(0xFF1E88E5);
  static const Color heartRate = Color(0xFFE53935);
  static const Color calorie = Color(0xFFFF7043);
  static const Color sleepBar = Color(0xFF7B6EF6);
  static const Color sleepBarLight = Color(0xFFD0BCFF);
  static const Color bpReached = Color(0xFFE53935);
  static const Color bpTarget = Color(0xFFFFCDD2);
  static const List<Color> primaryGradient = [Color(0xFF9C8FFA), Color(0xFF7B6EF6)];
  static const List<Color> cardGradient = [Color(0xFF8B7EF8), Color(0xFF6B5CE7)];
  static const List<Color> dangerGradient = [Color(0xFFEF5350), Color(0xFFE53935)];
  static const List<Color> successGradient = [Color(0xFF26A69A), Color(0xFF00BFA5)];
  static const List<Color> aiGradient = [Color(0xFF9C8FFA), Color(0xFF7B6EF6)];
}

class AppTextStyles {
  static const String fontFamily = 'Poppins';
  static const TextStyle h1 = TextStyle(fontFamily: fontFamily, fontSize: 28, fontWeight: FontWeight.w700, color: AppColors.textPrimary, height: 1.3, letterSpacing: -0.5);
  static const TextStyle h2 = TextStyle(fontFamily: fontFamily, fontSize: 24, fontWeight: FontWeight.w700, color: AppColors.textPrimary, height: 1.3, letterSpacing: -0.3);
  static const TextStyle h3 = TextStyle(fontFamily: fontFamily, fontSize: 20, fontWeight: FontWeight.w600, color: AppColors.textPrimary, height: 1.4);
  static const TextStyle h4 = TextStyle(fontFamily: fontFamily, fontSize: 18, fontWeight: FontWeight.w600, color: AppColors.textPrimary, height: 1.4);
  static const TextStyle h5 = TextStyle(fontFamily: fontFamily, fontSize: 16, fontWeight: FontWeight.w600, color: AppColors.textPrimary, height: 1.4);
  static const TextStyle body1 = TextStyle(fontFamily: fontFamily, fontSize: 14, fontWeight: FontWeight.w400, color: AppColors.textPrimary, height: 1.5);
  static const TextStyle body2 = TextStyle(fontFamily: fontFamily, fontSize: 13, fontWeight: FontWeight.w400, color: AppColors.textSecondary, height: 1.5);
  static const TextStyle caption = TextStyle(fontFamily: fontFamily, fontSize: 12, fontWeight: FontWeight.w400, color: AppColors.textSecondary, height: 1.4);
  static const TextStyle label = TextStyle(fontFamily: fontFamily, fontSize: 11, fontWeight: FontWeight.w600, color: AppColors.textSecondary, letterSpacing: 0.8);
  static const TextStyle button = TextStyle(fontFamily: fontFamily, fontSize: 15, fontWeight: FontWeight.w600, color: AppColors.textOnPrimary, letterSpacing: 0.3);
  static const TextStyle vitalValue = TextStyle(fontFamily: fontFamily, fontSize: 36, fontWeight: FontWeight.w700, color: AppColors.textPrimary);
  static const TextStyle vitalUnit = TextStyle(fontFamily: fontFamily, fontSize: 14, fontWeight: FontWeight.w400, color: AppColors.textSecondary);
}

class AppTheme {
  static void applySystemUI({bool darkIcons = true}) {
    SystemChrome.setSystemUIOverlayStyle(SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: darkIcons ? Brightness.dark : Brightness.light,
      statusBarBrightness: darkIcons ? Brightness.light : Brightness.dark,
      systemNavigationBarColor: AppColors.background,
      systemNavigationBarIconBrightness: Brightness.dark,
    ));
  }

  static ThemeData get lightTheme {
    final colorScheme = ColorScheme.fromSeed(
      seedColor: AppColors.primary,
      brightness: Brightness.light,
      primary: AppColors.primary,
      onPrimary: Colors.white,
      secondary: AppColors.secondary,
      onSecondary: Colors.white,
      surface: AppColors.surface,
      onSurface: AppColors.textPrimary,
      surfaceContainerLow: AppColors.surfaceContainerLow,
      error: AppColors.error,
      onError: Colors.white,
    );

    return ThemeData(
      useMaterial3: true,
      fontFamily: AppTextStyles.fontFamily,
      colorScheme: colorScheme,
      scaffoldBackgroundColor: AppColors.background,

      // AppBar
      appBarTheme: const AppBarTheme(
        backgroundColor: AppColors.background,
        foregroundColor: AppColors.textPrimary,
        elevation: 0,
        scrolledUnderElevation: 2,
        shadowColor: Color(0x14000000),
        centerTitle: false,
        titleTextStyle: AppTextStyles.h4,
        surfaceTintColor: Colors.transparent,
        systemOverlayStyle: SystemUiOverlayStyle(
          statusBarColor: Colors.transparent,
          statusBarIconBrightness: Brightness.dark,
        ),
      ),

      // Cards
      cardTheme: CardThemeData(
        color: AppColors.surface,
        elevation: 0,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        clipBehavior: Clip.antiAlias,
      ),

      // Elevated Button
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.primary,
          foregroundColor: Colors.white,
          disabledBackgroundColor: AppColors.primary.withValues(alpha: 0.5),
          elevation: 0,
          shadowColor: Colors.transparent,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
          textStyle: AppTextStyles.button,
          animationDuration: const Duration(milliseconds: 200),
        ),
      ),

      // Outlined Button
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: AppColors.primary,
          side: const BorderSide(color: AppColors.primary, width: 1.5),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
          textStyle: const TextStyle(fontFamily: 'Poppins', fontSize: 14, fontWeight: FontWeight.w600),
        ),
      ),

      // Text Button
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: AppColors.primary,
          textStyle: const TextStyle(fontFamily: 'Poppins', fontSize: 14, fontWeight: FontWeight.w600),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
      ),

      // Input
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: AppColors.surfaceVariant,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: AppColors.border)),
        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: AppColors.border)),
        focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: AppColors.primary, width: 2)),
        errorBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: AppColors.error)),
        focusedErrorBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: AppColors.error, width: 2)),
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        hintStyle: const TextStyle(fontFamily: 'Poppins', color: AppColors.textHint, fontSize: 14),
        labelStyle: AppTextStyles.body2,
        prefixIconColor: AppColors.textHint,
        suffixIconColor: AppColors.textHint,
        errorStyle: const TextStyle(fontFamily: 'Poppins', color: AppColors.error, fontSize: 12),
      ),

      // Divider
      dividerTheme: const DividerThemeData(color: AppColors.divider, thickness: 1, space: 1),

      // Chips
      chipTheme: ChipThemeData(
        backgroundColor: AppColors.surfaceVariant,
        selectedColor: AppColors.primaryLight,
        labelStyle: AppTextStyles.caption,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        side: const BorderSide(color: Colors.transparent),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      ),

      // Bottom Navigation
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: AppColors.background,
        indicatorColor: AppColors.primaryLight,
        iconTheme: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) {
            return const IconThemeData(color: AppColors.primary, size: 24);
          }
          return const IconThemeData(color: AppColors.textHint, size: 22);
        }),
        labelTextStyle: WidgetStateProperty.resolveWith((states) {
          final base = const TextStyle(fontFamily: 'Poppins', fontSize: 11);
          if (states.contains(WidgetState.selected)) {
            return base.copyWith(fontWeight: FontWeight.w600, color: AppColors.primary);
          }
          return base.copyWith(fontWeight: FontWeight.w400, color: AppColors.textHint);
        }),
        height: 72,
        elevation: 8,
        shadowColor: const Color(0x1A7B6EF6),
        surfaceTintColor: Colors.transparent,
        labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
        indicatorShape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      ),

      // FAB
      floatingActionButtonTheme: FloatingActionButtonThemeData(
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
        elevation: 8,
        shape: const CircleBorder(),
        extendedPadding: const EdgeInsets.symmetric(horizontal: 24),
      ),

      // Switch
      switchTheme: SwitchThemeData(
        thumbColor: WidgetStateProperty.resolveWith((s) =>
          s.contains(WidgetState.selected) ? AppColors.primary : AppColors.textHint),
        trackColor: WidgetStateProperty.resolveWith((s) =>
          s.contains(WidgetState.selected) ? AppColors.primaryLight : AppColors.surfaceVariant),
        trackOutlineColor: WidgetStateProperty.all(Colors.transparent),
      ),

      // ListTile
      listTileTheme: const ListTileThemeData(
        contentPadding: EdgeInsets.symmetric(horizontal: 16, vertical: 4),
        titleTextStyle: AppTextStyles.body1,
        subtitleTextStyle: AppTextStyles.caption,
      ),

      // SnackBar
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        backgroundColor: AppColors.textPrimary,
        contentTextStyle: const TextStyle(fontFamily: 'Poppins', fontSize: 13, color: Colors.white),
      ),

      // Dialog
      dialogTheme: DialogThemeData(
        backgroundColor: AppColors.surface,
        elevation: 8,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(28)),
        titleTextStyle: AppTextStyles.h4,
        contentTextStyle: AppTextStyles.body1,
      ),

      // Bottom Sheet
      bottomSheetTheme: const BottomSheetThemeData(
        backgroundColor: AppColors.surface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(28))),
        elevation: 8,
        showDragHandle: true,
        dragHandleColor: AppColors.border,
      ),

      // Tab Bar
      tabBarTheme: const TabBarThemeData(
        labelColor: AppColors.primary,
        unselectedLabelColor: AppColors.textHint,
        labelStyle: TextStyle(fontFamily: 'Poppins', fontSize: 13, fontWeight: FontWeight.w600),
        unselectedLabelStyle: TextStyle(fontFamily: 'Poppins', fontSize: 13, fontWeight: FontWeight.w400),
        indicatorSize: TabBarIndicatorSize.tab,
        dividerColor: Colors.transparent,
      ),

      // Progress Indicator
      progressIndicatorTheme: const ProgressIndicatorThemeData(
        color: AppColors.primary,
        linearTrackColor: AppColors.primaryLight,
        circularTrackColor: AppColors.primaryLight,
      ),
    );
  }
}

class AppSpacing {
  static const double xs = 4;
  static const double sm = 8;
  static const double md = 16;
  static const double lg = 24;
  static const double xl = 32;
  static const double xxl = 48;
}

class AppRadius {
  static const double sm = 8;
  static const double md = 12;
  static const double lg = 16;
  static const double xl = 24;
  static const double xxl = 28;
  static const double full = 100;
}

/// Reusable surface container decoration
BoxDecoration get surfaceCard => BoxDecoration(
  color: AppColors.surface,
  borderRadius: BorderRadius.circular(AppRadius.xl),
  boxShadow: const [BoxShadow(color: Color(0x0A000000), blurRadius: 16, offset: Offset(0, 4))],
);
