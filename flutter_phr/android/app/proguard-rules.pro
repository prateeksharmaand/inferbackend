# Flutter engine and generated plugin registrant
-keep class io.flutter.** { *; }
-keep class io.flutter.plugins.** { *; }
-keep class io.flutter.plugin.** { *; }
-dontwarn io.flutter.**

# App code
-keep class com.infer.care.** { *; }

# Keep source/line info for debug crash traces
-keepattributes SourceFile,LineNumberTable,*Annotation*,Signature,InnerClasses,Exceptions

# Suppress warnings from transitive deps (library consumer rules handle the rest)
-dontwarn **
