# Foundry Mobile 0.3.1 · full APK installation

This is a complete, signed **release APK** for the Pixel 8a (Android arm64),
with the Foundry icon and the Core-connected mobile workspace. It does not
require Android Studio, Java, a development server, split APKs or a separate
installer on the phone. The app runs locally; pairing with your desktop enables
Core data, label recognition and receipt submission.

1. Copy `Foundry-Mobile-0.3.1-Pixel8a.apk` to the phone's Downloads folder, using
   USB file transfer or your normal private file-transfer method.
2. Open the APK from Files. If Android asks, permit **Files** to install apps
   from that source, return to the installation screen, and tap **Install**.
3. Open **Foundry Mobile** using the Foundry forge icon.
4. Start the updated desktop companion. Desktop: **Bastion → Connect Pixel /
   Mobile Foundry**. Phone: **Connect → Scan desktop pairing code**. Keep both
   devices on your trusted LAN or configured private overlay. Grant camera
   permission when the scanner asks. On Android 17, also allow the Nearby devices /
   local-network permission requested at startup. If you denied it, enable it in
   Android Settings → Apps → Foundry Mobile → Permissions, then retry pairing.
5. Tap **Scan** for a product barcode. For unfamiliar products, use
   **Materials → Photograph label**, confirm the detected details, save the
   spool draft and send it to the desktop.

The release application ID is `com.fenrirforgeworks.foundrymobile`. It installs
alongside the previous development APK (`.debug`) and the old Forgekeeper app;
their app-private data is separate. Pair the release app again. Use the old
app's existing backup/import tools to migrate legacy workspace data if needed.
No automatic migration from another installed application is performed.

This APK is signed with the persistent **Foundry Mobile Release** identity.
Future APK updates must use this same key and a higher version code. The
private key and local password stay in the access-restricted `.private-signing`
folder in the Foundry Engine workspace, outside Git and delivery archives.
Keep a private backup of that folder to preserve future update signing.

See `MOBILE_FOUNDRY.md` for the complete scanning workflow, scope and limitations.
Physical camera behavior and your private network still need verification on
the Pixel. Label recognition uses the paired Windows desktop; the APK does not
measure remaining filament or include a universal product catalog.
