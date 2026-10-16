# Foundry Mobile 0.3.2: Android scanner repair

The Pixel reported that the camera tried to open and Foundry Mobile closed.
Without a device crash trace, the exact exception cannot be established remotely.
This release repairs unsafe native camera startup and frame ownership paths found
in the 2.5.3 scanner dependency, and provides an independent photo-based pairing path.

## Install

Install the signed `Foundry-Mobile-0.3.2-Pixel8a.apk` over Foundry Mobile 0.3.1.
It uses the same application ID and release signing identity, with a higher version
code. Keep the existing app installed to retain its private data and local drafts.

Open **Connect → Scan desktop pairing code** and scan **Pair phone** on the Y70,
or **Pair mobile** in Foundry. Camera initialization and frame failures now return
errors to the application. Android Back cancels an active scan.

If the live scanner still fails, use **Photograph / import pairing QR**. Photograph
the entire code or select an existing photo. ZXing decodes the image locally in
the phone webview; the image is not uploaded or saved by Foundry. The decoded
credential goes through the same native HTTPS validation and app-private storage
as a live scan. The existing paste option remains available.

## Implementation and validation

The pinned local scanner fork retains the upstream MIT/Apache notices and the
unchanged Rust/iOS implementations. `FOUNDRY_PATCHES.md` inside the vendor folder
records the upstream crate checksum and Android changes. Frame release follows
Android's CameraX ownership contract: close only `ImageProxy`, then stop the
camera after the image processing task completes. Startup/binding failures reject
the scan instead of throwing on the main thread; stale startup callbacks are ignored.
The decoder model is bundled so first use does not require a Play Services download.

Frontend checks cover permission denial, concurrent taps, retry after native
failure and a dense pairing QR including certificate newlines. Existing host tests
and the APK workflow validate the build, release identity, camera permission and
16 KB arm64 library compatibility. None of those checks substitutes for retrying
the live scanner on the physical Pixel. If it still closes, capture an Android
crash log before further changes rather than inferring a different root cause.
