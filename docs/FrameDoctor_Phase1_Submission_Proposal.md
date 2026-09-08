# Project Submission Proposal: FrameDoctor
### Sub-Millisecond 144 Hz Frame Pacing & Thermal Diagnostic Engine for iQOO 15

---

## Document Information

* **Project Title**: **FrameDoctor**
* **Hackathon**: **iQOO Hackathon 2026 · Chennai City Battle**
* **Track**: **Developer Tools & Performance Optimization**
* **Target Hardware**: **vivo / iQOO 15** (Qualcomm Snapdragon 8 Elite · Adreno 830 GPU · 144 Hz 2K AMOLED · Supercomputing Chip Q2)
* **Target Software Platform**: **OriginOS 5 / FuntouchOS (Android 15 / API Level 35)**
* **Live Interactive Prototype**: [https://framedoctor-two.vercel.app](https://framedoctor-two.vercel.app)
* **Mobile DUT View**: [https://framedoctor-two.vercel.app/#/](https://framedoctor-two.vercel.app/#/)
* **Laptop Companion Desk**: [https://framedoctor-two.vercel.app/#/desk](https://framedoctor-two.vercel.app/#/desk)
* **GitHub Repository**: [https://github.com/panshularora/FrameDoctor](https://github.com/panshularora/FrameDoctor)

---

## 1. Executive Summary

At **144 Hz**, an application rendering pipeline has a strict **6.94 millisecond** vertical synchronization (VSync) budget per frame. A minor single-frame transgression forces the Android compositor (`SurfaceFlinger`) to miss the vertical blanking interval, dropping the presentation rate to 72 FPS and inducing noticeable micro-stutter. 

Traditional developer profiling tools (such as Android Studio Profiler, Google Perfetto, and Systrace) suffer from three critical bottlenecks:
1. **Physical Cable Lock-In**: They require a tethered desktop workstation and ADB authorization, making profiling impossible on buses, in student labs, in field tests, or during offline hackathon "Red Light" phases.
2. **Thermal & Electrical Distortion**: Continuous 5V/9V VBUS charging power over USB introduces artificial electrical Joule heating ($P = I^2 R$) directly into the device chassis, invalidating native battery coulometry and triggering premature thermal throttling.
3. **The Vanity Metric Blindspot**: Standard tools summarize performance as cumulative arithmetic average frame rate ($\overline{\text{FPS}}$), which completely conceals micro-stutter and hitch clusters.

**FrameDoctor** turns the loaner **iQOO 15 itself into an autonomous, untethered performance laboratory**. Operating entirely within user-space without requiring root privileges, FrameDoctor intercepts hardware VSync timestamps via `Choreographer.FrameCallback`, captures platform thermal throttling tiers via `PowerManager.OnThermalStatusChangedListener`, monitors battery current draw via `BatteryManager`, and tracks 300 Hz touch digitizer latency. It evaluates rendering stability using the **Peak Jitter Index (PJI)**, synthesizes tailored Adreno 830 GPU code patches, and exports diagnostic dossiers directly onto developer workstations via **vivo Office Kit** drag-and-drop and Super Clipboard protocols.

---

## 2. Problem Statement & Field Analysis

### 2.1 The 6.94 ms VSync Boundary Paradox
On modern flagship devices, the rendering deadline shrinks non-linearly as refresh rates increase:

| Refresh Rate | VSync Deadline ($\Delta t_{\text{max}}$) | Frame Margin | Risk Vector |
| :---: | :---: | :---: | :--- |
| **60 Hz** | **16.67 ms** | Generous | Forgiving of occasional layout spikes and GC pauses. |
| **120 Hz** | **8.33 ms** | Tight | Draw call serialization and heavy fragment passes drop frames. |
| **144 Hz (iQOO 15)** | **6.94 ms** | **Zero Margin** | Any micro-hitch, shader overdraw, or layout reflow causes instantaneous visual stutter. |

### 2.2 Why Average FPS Lies: A Mathematical Demonstration
Consider two distinct 1-second application profiles evaluated across 144 target frames ($1000\text{ ms}$ window):

* **System A (True 144 Hz Lock)**:  
  Every frame renders at exactly $6.94\text{ ms}$.  
  $$\overline{\text{FPS}} = \frac{144}{1.0\text{ s}} = 144.0\text{ FPS}, \quad \text{Jitter} = 0.0\text{ ms} \quad \text{(Flawless)}$$
* **System B (Janky Profile with Hitch Cluster)**:  
  141 frames render in $5.0\text{ ms}$ ($705\text{ ms}$), while 3 frames freeze at $98.3\text{ ms}$ ($295\text{ ms}$).  
  $$\overline{\text{FPS}} = \frac{144}{1.0\text{ s}} = 144.0\text{ FPS}, \quad \text{Jitter} = \pm 23.4\text{ ms} \quad \text{(Severe Micro-Stutter)}$$

Both profiles report an average of **144 FPS**, yet System B freezes the screen for nearly a third of a second. FrameDoctor replaces this deceptive average with variance-sensitive operators.

---

## 3. The Proposed Solution: FrameDoctor Architecture

FrameDoctor separates concerns across two unified surfaces: the **Mobile Device Under Test (DUT)** and the **Laptop Companion Desk**, bridged by **vivo Office Kit** and a low-latency local area network (LAN) telemetry stream.

```
+-----------------------------------------------------------------------------------------------+
|                                  FRAMEDOCTOR SYSTEM TOPOLOGY                                  |
+-----------------------------------------------------------------------------------------------+
|                                                                                               |
|  [ MOBILE DEVICE UNDER TEST (iQOO 15) ]                                                       |
|  +-----------------------------------------------------------------------------------------+  |
|  | HARDWARE TELEMETRY LAYER (Native Kotlin Bridge)                                         |  |
|  |  * Choreographer.FrameCallback [Sub-ms VSync Timestamps]                               |  |
|  |  * PowerManager.OnThermalStatusChangedListener [6-Tier OS Thermal Daemon]                |  |
|  |  * BatteryManager [Current Draw, Voltage, Temperature]                                  |  |
|  |  * High-Frequency Digitizer Listener [300 Hz Touch Tracking]                           |  |
|  +--------------------------------------------+--------------------------------------------+  |
|                                               | Nanosecond Ring Buffer Stream                 |
|  +--------------------------------------------v--------------------------------------------+  |
|  | DETERMINISTIC GRAPHICS STRESS HARNESS                                                   |  |
|  |  * WebGLMesh: Instanced Icosphere Lighting Loops (Fragment Bound)                       |  |
|  |  * DOMFeed: Dynamic DOM Mutation & Composite Layer Thrash (CPU Bound)                   |  |
|  |  * TriangleMesh: 18k Unindexed Primitives (Adreno Rasterizer Bound)                     |  |
|  |  * OverdrawBomb: Real-Time Trigonometric Load Injector                                  |  |
|  +--------------------------------------------+--------------------------------------------+  |
|                                               | Discrete Frame Series                         |
|  +--------------------------------------------v--------------------------------------------+  |
|  | LOCAL DIAGNOSTIC ENGINE (Zero-Cloud Analysis Core)                                      |  |
|  |  * Startup Transient Discard Filter (Drop Initial 25 Frames)                            |  |
|  |  * Peak Jitter Index (PJI) Statistical Operator                                         |  |
|  |  * Multi-Parametric Health Scorer (0 - 100 System)                                      |  |
|  |  * Adreno ALU Vector Precision & Shader Remediation Generator                           |  |
|  +--------------------------------------------+--------------------------------------------+  |
|                                               | Serialized Dossier (Markdown / JSON)          |
|  +--------------------------------------------v--------------------------------------------+  |
|  | UNTETHERED EXPORT BUS (MediaStore Public Storage Provider)                             |  |
|  |  * FileDropHelper: Direct Ingestion to Environment.DIRECTORY_DOWNLOADS                   |  |
|  |  * Super Clipboard: System-Wide Synchronized Clipboard Buffer                            |  |
|  +--------------------------------------------+--------------------------------------------+  |
|                                               |                                               |
+-----------------------------------------------|-----------------------------------------------+
                                                | vivo Office Kit Bus
                                                | (Cross-Device Drag-and-Drop / LAN SSE Stream)
+-----------------------------------------------|-----------------------------------------------+
|                                               |                                               |
|  [ LAPTOP COMPANION DESK (DEVELOPER PC) ]     v                                               |
|  +-----------------------------------------------------------------------------------------+  |
|  | HOST TELEMETRY CONSUMER                                                                 |  |
|  |  * Live Latency Seismograph: Sub-ms Streaming Frame-Time Canvas                         |  |
|  |  * Drop Verifier: Deterministic Regex & Integrity Ingestion Parser                      |  |
|  |  * LAN Remote Co-Pilot: Bi-directional Stress Injection (Overdraw Bomb Remote Trigger) |  |
|  +-----------------------------------------------------------------------------------------+  |
|                                                                                               |
+-----------------------------------------------------------------------------------------------+
```

---

## 4. Key Innovations & Technical Core

### 4.1 Sub-Millisecond VSync Interception (`Choreographer.FrameCallback`)
To bypass browser event-loop queue latency, FrameDoctor's native Kotlin bridge hooks directly into Android's `Choreographer`. This captures nanosecond-accurate hardware presentation timestamps straight from `SurfaceFlinger`.

### 4.2 Operating System Thermal State Monitoring (`PowerManager`)
Rather than relying on noisy surface thermistors, FrameDoctor registers an active listener against Android's platform thermal daemon:
* Tiers: `NONE` $\rightarrow$ `LIGHT` $\rightarrow$ `MODERATE` $\rightarrow$ `SEVERE` $\rightarrow$ `CRITICAL` $\rightarrow$ `EMERGENCY`.
* Captures the exact second $t_{\text{throttle}}$ when the platform kernel activates Dynamic Voltage and Frequency Scaling (DVFS) clock frequency limits on the Snapdragon 8 Elite CPU/GPU clusters.

### 4.3 Startup Transient Warmup Discard Filter
During the first 25–30 frames of any session, Android applications experience unavoidable startup spikes (class loading, layout traversal, WebGL shader compilation). FrameDoctor filters out the initial 25 frames from steady-state calculations, preventing artificial skewing of $p_{95}$ latency:
$$\mathbf{F}_{\text{steady}} = [f_{25}, f_{26}, \dots, f_N] \quad (\text{for } N > 30)$$

### 4.4 Peak Jitter Index (PJI) Formulation
Frame pacing stability is quantified via the **Peak Jitter Index (PJI)**, derived as the root-mean-square deviation of steady-state frame intervals:
$$\text{PJI} = \sqrt{\frac{1}{M - 1}\sum_{i=1}^{M} (f_i - \mu_f)^2}$$
* $\text{PJI} \le 0.8\text{ ms}$: **S-Tier 144 Hz Lock** (Locked within physical hardware noise).
* $0.8\text{ ms} < \text{PJI} \le 2.0\text{ ms}$: **Flagship Stable** (Imperceptible jitter).
* $\text{PJI} > 2.0\text{ ms}$: **Unstable Jitter** (Visible micro-stutter).

### 4.5 Automated Code Remediation Engine
FrameDoctor bridges the gap between raw data and developer action. It analyzes bottleneck signatures and emits concrete, copy-pasteable patches:
* **Adreno 830 ALU Vector Optimization**: Demoting 32-bit `highp` float variables to 16-bit `mediump float` in fragment shaders doubles ALU vector throughput on Qualcomm Adreno hardware.
* **Fragment Overdraw Throttling**: Automatically emits `gl.hint(gl.FRAGMENT_SHADER_DERIVATIVE_HINT, gl.FASTEST)` and dynamic level-of-detail (LOD) downscaling rules when frame budget overruns are detected.
* **DOM Reflow Decoupling**: Automatically emits microtask read/write batching to eliminate synchronous layout thrashing.

---

## 5. The vivo Office Kit Cross-Device Workflow

A core tenet of FrameDoctor is bridging on-device testing with desktop development through vivo's native ecosystem:

```
[ Step 1: Profile on Phone ] ────► [ Step 2: One-Tap Export ] ────► [ Step 3: Drag in Office Kit ] ────► [ Step 4: Verify on Laptop Desk ]
   Run 144 Hz Stress Test           Save .md to Downloads              Drag file Phone -> PC              Instant Parse & Live Telemetry
```

1. **MediaStore Public Storage Writer (`FileDropHelper.kt`)**: Writes diagnostic reports directly into `Environment.DIRECTORY_DOWNLOADS` and `DIRECTORY_DOCUMENTS`.
2. **vivo Office Kit File Drag-and-Drop**: Because the report is in public storage, vivo Office Kit on the PC immediately discovers it. The developer simply drags the file across screens.
3. **Super Clipboard Synchronization**: One-tap "Super Clipboard" writes dense trace payloads to system clipboard, instantly synchronized across devices via vivo's encrypted wireless channel.
4. **Laptop Companion Desk (`/#/desk`)**: Ingests drops or clipboard pastes, executes regex verification, and displays the authenticated green badge:  
   `✓ vivo Office Kit Cross-Device Transfer Confirmed`.

---

## 6. Current Implementation Status & Verification

The project is fully implemented, verified, and running in production:

* **Production Web**: [https://framedoctor-two.vercel.app](https://framedoctor-two.vercel.app)
* **Codebase & Docs**: [https://github.com/panshularora/FrameDoctor](https://github.com/panshularora/FrameDoctor)
* **Native Android Source**: `android/` contains the complete Kotlin source (`MainActivity.kt`, `NativeBridge.kt`, `FileDropHelper.kt`).
* **Automated Unit Smoke Tests (`npm test`)**: Validated p95 latency, jank thresholds, thermal parsing, and mathematical calculations with 100% test pass rate.
* **Headless Visual Audit (`scripts/lab-walkthrough.mjs`)**: Verified complete end-to-end user loop across both phone and desktop viewports using headless Chrome, ensuring zero CSS overflow and exact pixel alignment.

---

## 7. Official Hackathon Rubric Alignment

| Judging Criteria | Official Weight | How FrameDoctor Dominates This Category |
| :--- | :---: | :--- |
| **End Product Quality** | **30%** | Production-ready React 19 + Kotlin Android architecture. 100% crash-proof offline fallback. Verified with automated headless Chrome E2E visual audits. |
| **Novelty + Impact** | **20%** | Solves the critical 6.94 ms micro-stutter problem for 144 Hz displays. The Device Under Test is the product itself—no external cables required. |
| **Creative Phone Use** | **15%** | Native hardware sensor fusion: `Choreographer` hardware frame timing, `PowerManager` thermal daemon status, battery draw, and 300 Hz touch digitizer sampling. |
| **Technical Depth** | **15%** | Mathematical modeling: Startup Warmup Discard filter, Peak Jitter Index (PJI), hitch cluster tracking, and automated Adreno 830 ALU shader patches. |
| **vivo Office Kit Usage** | **10%** | Native public directory storage triggers for cross-device file drag-and-drop, Super Clipboard ingestion, and verified drop badges. |
| **Demo & Pitch** | **10%** | Rehearsed 90-second live demonstration script with split-screen phone/laptop coordination and pre-cooked judge defense answers. |

---

## 8. Team Capability & 30-Hour Sprint Roadmap

* **Architecture & Mobile UI**: Complete, responsive, pixel-aligned mobile test rig (`Phone.jsx`) and laptop companion (`Desk.jsx`).
* **Systems Engineering & Android Bridge**: Native Kotlin bridge interfacing system services with zero root dependencies (`NativeBridge.kt`).
* **Offline-First Resilience**: Zero cloud reliance in the core evaluation loop; operates flawlessly in airplane mode and offline hackathon "Red Light" phases.

---
*© 2026 Team FrameDoctor · iQOO Hackathon 2026 (Chennai City Battle)*
