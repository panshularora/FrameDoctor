# FrameDoctor

On-device performance doctor for the **iQOO 15**. The phone is the device under test. We record frame time, thermals and battery on **this process**, write the report on-device, then you drag the file through **vivo Office Kit**.

Track: Developer Tools · Chennai 12–13 Sep 2026 · demo on the phone.

## What is real

| Signal | APK (loaner) | Chrome / PWA |
|---|---|---|
| Frames | `Choreographer` | `requestAnimationFrame` |
| Thermal | `PowerManager` | Estimated from frame load — labeled |
| Battery | `BatteryManager` | `navigator.getBattery` if the browser allows it |
| Explainer | On-device template | Same |
| Office Kit | File in Downloads + clipboard | Download + clipboard, then drag in Office Kit |
| Cloud | Optional SpaceXAI rewrite, labeled | Same, never called “NPU” |

We do not profile other apps. We do not invent competitor fps or skin temperature.

## Run (laptop lab)

```bash
cd framedoctor
npm install
npm test
npm run dev
```

- Phone: http://localhost:5173
- Desk: http://localhost:5173/#/desk
- API: http://localhost:8787/api/health

Copy `.env.example` to `.env` and set `XAI_API_KEY` only if you want a Green Light prose rewrite. Without a key the on-device report still ships.

## APK

```bash
npm run build:android
```

Then open `android/` in Android Studio (JDK 17). See `android/README.md`.

## Loop

1. Start a workload (WebGL mesh, raymarch, DOM feed, GPU triangles).
2. Watch FPS / frame ms / thermal **source**. Hit **Overdraw bomb** if the 15 is too clean.
3. Stop → on-device card → Save `.md` to Downloads.
4. Office Kit: drag file phone → PC, paste Super Clipboard on the desk.

## Pitch

See `PITCH.md`. Ninety seconds. Phone in hand. Laptop already paired.

## Stack

React + Vite (phone + desk) · Express (optional LAN) · SQLite · GSAP · Kotlin WebView shell · SpaceXAI optional.
