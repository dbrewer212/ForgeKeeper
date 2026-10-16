"""Configure the generated Android host without weakening network protections."""
from pathlib import Path
import re
import shutil
import xml.etree.ElementTree as ET

root=Path('src-tauri/gen/android/app/src/main')
icons=Path('src-tauri/icons/android')
assert (icons/'mipmap-xxxhdpi/ic_launcher.png').is_file(), 'Foundry launcher artwork is missing'
shutil.copytree(icons,root/'res',dirs_exist_ok=True)
for theme in [root/'res/values/themes.xml',root/'res/values-night/themes.xml']:
    if not theme.exists(): continue
    tree=ET.parse(theme)
    for style in tree.getroot().findall('style'):
        colors={'android:windowBackground':'#15191F','colorPrimary':'#E8874E',
                'colorOnPrimary':'#15191F','colorSurface':'#20262E','colorOnSurface':'#EEE9DF',
                'android:statusBarColor':'#15191F','android:navigationBarColor':'#15191F',
                'android:windowLightStatusBar':'false'}
        for name,value in colors.items():
            item=next((item for item in style.findall('item') if item.get('name')==name),None)
            if item is None: item=ET.SubElement(style,'item',{'name':name})
            item.text=value
    tree.write(theme,encoding='utf-8',xml_declaration=True)
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
print('Foundry Android launcher/theme, private backup policy and local-network permission configured.')
