# Foundry Mobile · Pixel 8a

Foundry Mobile 0.3.1 adds a native Android companion for this Python Foundry Core.
The ForgeKeeper source is in `dbrewer212/ForgeKeeper`, branch
`codex/mobile-core-spool-scanner`. Its Android build workflow produces an arm64
release APK, source commit and SHA-256 checksum. The delivered APK is then aligned,
signed locally with the persistent Foundry Mobile Release key and verified.

## Install and pair

1. Copy the APK to your Pixel 8a, open it and allow that file source to install
   the application when Android asks. The new Foundry icon launches **Foundry Mobile**.
   This release uses `com.fenrirforgeworks.foundrymobile`; your old Forgekeeper
   installation and the earlier `.debug` APK keep their private data in those apps. Export/import your old
   workspace using its existing backup tools if you want to migrate it.
2. Run the updated portable desktop `Foundry.exe` with its entire companion folder.
   Keep desktop and phone on the same trusted LAN or configured private overlay.
3. Desktop: **Bastion → Connect Pixel / Mobile Foundry**. Confirm the workstation's
   reachable IPv4 address. The desktop opens HTTPS port 8765 while it is running.
   If Windows asks, allow this application on your private network. No router port
   forwarding is needed. No firewall or overlay settings are changed by this build.
4. Phone: **Connect → Scan desktop pairing code**. Grant camera permission when
   requested. Scan the QR on your own desktop. Refresh should show Connected.

The QR carries the public desktop certificate and a scoped 30-day device credential.
Keep it private. Certificate verification stays enabled. The phone stores credentials
in its Android app-private directory; APK backup is disabled. This version does not
add biometric or Android Keystore encryption. Revoke devices in the desktop Core
client controls; forgetting a connection on the phone removes the local credential
but does not revoke it. Stop the link from Bastion or close the desktop to stop
serving mobile requests. Desktop workers and printer telemetry still require their
normal configuration.

## Receive filament

1. Tap **Scan** and scan a retail barcode. A previously confirmed product fills the
   review form from the phone's remembered catalog or connected Core materials.
2. For an unfamiliar product, open **Materials → Photograph label** and photograph
   the brand, material, color, diameter and net filament weight together. The phone
   resizes the image and sends it through the paired HTTPS connection. Windows
   reads it in memory using its English OCR language pack; no cloud service or
   retained photo is used. Unknown brands or unreadable fields require a clearer
   photo or correction. Barcode numbers alone do not provide a universal catalog.
3. Confirm the suggestions. A sealed spool uses the label's **nominal** quantity;
   a used spool can have an optional estimated weight or **unknown** remainder.
   Recognition does not measure filament left on a used spool.
4. Save the draft, then tap **Send to desktop**. Drafts survive offline use and app
   restart. Each physical spool has a new ID; retries reuse the receipt ID and
   cannot duplicate its inventory entry. There is no automatic background upload.
5. Show the new spool's QR label from Desktop spools. This identifies that physical
   spool for subsequent scans. It does not automatically consume inventory or change
   production assignments.

The phone also shows registered projects, retained assets, fleet observations,
production checks, persistent alerts and reviewed Core proposals. Full geometry
editing and actual printer execution remain in their existing desktop/native paths.
Conversational AI, push notifications, biometrics and automatic label printing are
not connected in this build. The legacy workspace and its Foundry Link/Bastion UI
are retained as a separate mode; they use their original pairing protocol.

## Validation and limits

Desktop regressions include concurrent receipt retries, transactional rejection,
verified HTTPS, scopes, revocation and real Windows OCR. Mobile checks include
TypeScript compilation, parser tests, existing regression tests and 61 inherited
integration invariants. A browser preview checks phone layout and local drafts.
The APK must still be commissioned on the physical Pixel for camera focus,
permission prompts, OEM WebView photo capture and your actual private network.

The preserved Tailwind 3 development toolchain has inherited npm advisories.
No forced framework migration or content-security policy relaxation is included.
The release signing identity stays in the access-restricted `.private-signing`
folder in the Foundry Engine workspace. Keep it privately backed up: future
updates need that same identity and a higher version code. The release APK installs
separately from the previous development APK. See `MOBILE_RELEASE_INSTALL.md` for
the complete release installation steps.
