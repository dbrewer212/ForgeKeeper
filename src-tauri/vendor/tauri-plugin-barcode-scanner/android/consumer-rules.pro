# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile
# Looked up through reflection by the torch plugin.
-keep class app.tauri.barcodescanner.BarcodeScannerPlugin {
    public static androidx.camera.core.Camera getActiveCamera();
}

# ML Kit discovers these registrars by manifest name and invokes their public
# no-argument constructors reflectively. R8 full mode otherwise removes those
# constructors: physical Pixel release logs show NoSuchMethodException followed
# by BarcodeScanning.getClient() failing with a NullPointerException.
-keep class com.google.mlkit.common.internal.CommonComponentRegistrar { public <init>(); }
-keep class com.google.mlkit.vision.barcode.internal.BarcodeRegistrar { public <init>(); }
-keep class com.google.mlkit.vision.common.internal.VisionCommonRegistrar { public <init>(); }
