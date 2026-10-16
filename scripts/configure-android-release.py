"""Configure the generated Android host without weakening network protections."""
from pathlib import Path
import re
import xml.etree.ElementTree as ET

root=Path('src-tauri/gen/android/app/src/main')
manifest=root/'AndroidManifest.xml'
text=manifest.read_text()
text=text.replace('android:allowBackup="true"','android:allowBackup="false"')
if 'android:allowBackup=' not in text:
    text=text.replace('<application','<application android:allowBackup="false"',1)
permission='android.permission.ACCESS_LOCAL_NETWORK'
if permission not in text:
    text=re.sub(r'(<manifest\b[^>]*>)',r'\1\n    <uses-permission android:name="'+permission+'" />',text,count=1)
parsed=ET.fromstring(text)
android='{http://schemas.android.com/apk/res/android}'
assert parsed.find('application').get(android+'allowBackup')=='false'
assert any(item.get(android+'name')==permission for item in parsed.findall('uses-permission'))
manifest.write_text(text)

activities=list(root.rglob('MainActivity.kt'))
assert len(activities)==1, 'Expected exactly one generated Android main activity'
activity=activities[0]; source=activity.read_text()
if permission not in source:
    needle='super.onCreate(savedInstanceState)'
    assert source.count(needle)==1, 'Review the changed Tauri activity lifecycle before packaging'
    source=source.replace(needle,needle+'''
    // Android 17 gates direct desktop LAN connections behind Nearby devices.
    if (android.os.Build.VERSION.SDK_INT >= 37 &&
        applicationInfo.targetSdkVersion >= 37 &&
        checkSelfPermission("android.permission.ACCESS_LOCAL_NETWORK") != android.content.pm.PackageManager.PERMISSION_GRANTED) {
      requestPermissions(arrayOf("android.permission.ACCESS_LOCAL_NETWORK"), 3701)
    }
''')
    activity.write_text(source)
print('Android private backup policy and local-network permission configured.')
