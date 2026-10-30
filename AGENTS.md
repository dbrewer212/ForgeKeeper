# Foundry installer delivery

Application changes include delivery of a verified installer for each affected
platform without waiting for a separate release request. Shared Core/Link API,
pairing, trust, authentication, persistence and synchronization changes require
compatible Windows and Android releases. A platform-only change requires that
platform's installer; retain the other verified installer in Latest.

The release authority and scripts are in dbrewer212/Foundry-Engine:
- Windows: scripts/build_windows.ps1; increment installer/windows-version.txt
  for changed Windows releases.
- Android: build the release APK from the reviewed mobile source, increase its
  version name/code for changed releases, and use scripts/sign_mobile_release.ps1
  from Foundry-Engine with the existing private signing identity.
- Publish verified installers to Installers/Latest/Foundry-Setup.exe and
  Installers/Latest/Foundry-Mobile.apk using the standard scripts. Preserve
  immutable Installers/Archive versions, releases.json and SHA256SUMS.txt.
- Preserve Core data, phone pairings, projects and the Android application ID.
  Never expose credentials, replace the existing signing identity, weaken TLS,
  or disable authentication to obtain a build.

Report source commit, versions, hashes, build/test evidence and delivery paths.
Unsigned CI APKs are build inputs, not signed releases. CI upload does not mean
publication to the user's workstation. Leave delivery pending and identify the
precise blocker if Windows execution or signing is unavailable. Never claim a
Pixel, printer or workstation test that was not performed. Documentation-only
changes do not require app version bumps or rebuilt installers.
