# Foundry Android camera fixes

Vendored from the official `tauri-plugin-barcode-scanner` 2.5.3 crate.
Crate SHA-256: `b57ad7e6ed3e8927205dade785400d9829b8208f59cfe24324fcb324f61482b2`.
Upstream MIT/Apache notices are retained. Rust and iOS behavior are unchanged.

Android changes:

- Release frames only through `ImageProxy.close()`. Never close its wrapped
  `Media.Image`; Android documents that this breaks CameraX image ownership:
  https://developer.android.com/media/camera/camerax/analyze
- Finish reading and release the frame before resolving a successful scan and
  unbinding the camera. Close frames when no scan/detector/image is available.
- Reject startup, permission, binding and frame failures through the pending
  invocation instead of throwing uncaught exceptions on Android's main thread.
- Clean up overlays and detector resources even when the camera provider never
  finishes starting. Ignore callbacks belonging to an earlier scan.
- Reject overlapping scans and let Android Back cancel the scan.
- Respect the requested barcode formats without implicitly adding QR to all scans.
- Bundle ML Kit's decoder (`com.google.mlkit:barcode-scanning:17.3.0`) so a first
  scan does not depend on Google Play Services downloading a decoder module.

The APK workflow compiles this local crate and checks every packaged arm64 ELF
for 16 KB page compatibility. Frontend regressions cover permissions, concurrent
taps, retry after native errors and local decoding of a dense pairing QR image.
Actual Pixel camera operation still requires a physical-device check.
