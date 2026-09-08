# FrameDoctor Android shell

Kotlin WebView that injects `FrameDoctorNative`:

- `Choreographer` frame times
- `PowerManager.getCurrentThermalStatus()`
- `BatteryManager` capacity + temperature
- Save markdown to **Downloads** (Office Kit can drag this)
- Super Clipboard via `ClipboardManager`
- Display refresh rate

## Build (event laptop / Android Studio)

1. Install Android Studio with JDK 17 and Android SDK 35.
2. On this repo:

```bash
cd framedoctor
npm install
npm run build:android
```

3. Open `framedoctor/android` in Android Studio → Run on the iQOO 15.
4. Unknown sources / USB debug as needed on the loaner.

Red Light: use the installed APK. It does not need the laptop.

Green Light: the laptop companion at `/#/desk` can still mirror a Chrome session on the same Wi-Fi. The APK itself is offline-first.
