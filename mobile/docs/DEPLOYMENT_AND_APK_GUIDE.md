# ProjectTRACK Mobile — Deployment & Standalone APK Guide

> **Comprehensive production deployment, one-click APK generation, and field audit setup manual.**

---

## 1. Executive Summary

The ProjectTRACK Mobile Client is an offline-capable, geofenced field auditing application engineered with React Native and Expo (SDK 52). It turns citizens and civil engineering watchdogs into verified field verifiers for DPWH civil works projects across the 53 Local Government Units (LGUs) of Cebu Province.

This guide provides exhaustive documentation for:
- Compiling a standalone, downloadable `.apk` file ready for installation on any physical Android device.
- One-click building via cloud Expo Application Services (EAS) or local offline Gradle toolchains.
- One-click installation via Android Debug Bridge (ADB) or direct download QR code.
- Keystore signing and Play Store (`.aab`) production release standards.

---

## 2. APK vs AAB: Choosing the Right Format

| Format | File Extension | Use Case | Distribution Method |
| :--- | :--- | :--- | :--- |
| **Standalone APK** | `.apk` | Internal testing, QA audit teams, direct sideloading, offline distribution. | Direct download link, USB ADB, QR code, Google Drive, WhatsApp/Telegram. |
| **Android App Bundle** | `.aab` | Google Play Store production release. Google optimizes binaries per device ABI (arm64-v8a, armeabi-v7a). | Google Play Console internal / alpha / production tracks. |

---

## 3. One-Click APK Compilation

ProjectTRACK provides automated turnkey scripts in `mobile/scripts/`:

### Option A: Cloud EAS Build (Recommended — Zero Local SDK Required)
* **Who it is for**: Anyone without Android Studio or Java JDK installed.
* **How it works**: Compiles the native binary in Expo's secure cloud infrastructure.
* **Output**: A permanent, public `.apk` download URL and a terminal QR code.

**On Windows (One Click):**
Double-click `scripts\build-apk.bat` in File Explorer, or run in terminal:
```bash
npm run build:apk:cloud
```

**On macOS / Linux:**
```bash
./scripts/build-apk.sh --cloud
# or
npm run build:apk:cloud
```

---

### Option B: Local Native Build (Offline Mode)
* **Who it is for**: Developers with Android Studio, Android SDK (API 34/35), and JDK 17 installed locally.
* **How it works**: Runs `npx expo prebuild` to generate the `android/` directory and executes `./gradlew assembleRelease`.
* **Output**: Saves `projecttrack.apk` directly into `mobile/dist/`.

**Commands:**
```bash
npm run build:apk:local
```

---

## 4. One-Click APK Installation on Devices

### Method 1: Instant USB / Wi-Fi ADB Installation (One Click)
If your phone is connected to your PC with **USB Debugging** enabled:
1. Double-click `scripts\install-apk.bat` (Windows) or run `./scripts/install-apk.sh` (macOS/Linux).
2. The script detects your phone via `adb`, replaces any older version with `adb install -r dist/projecttrack.apk`, and automatically launches the app on your screen!

### Method 2: Sideloading via Direct Download (No PC Connection Needed)
1. Complete the Cloud Build (`npm run build:apk:cloud`).
2. Point your Android phone camera at the QR code displayed in the terminal (or open the provided URL).
3. Tap **Download Anyway** if prompted by Chrome or Samsung Internet.
4. Open the downloaded `.apk` file and tap **Install**.
   *(If prompted: tap **Settings** -> **Allow from this source** to enable sideloading).*

---

## 5. Physical Device Networking Setup

Android 9+ (API level 28+) strictly forbids unencrypted HTTP cleartext traffic by default unless explicitly configured. ProjectTRACK mobile already configures `usesCleartextTraffic: true` in `app.json`.

However, on physical Android phones, **`10.0.2.2` and `localhost` do not work** (they refer to the phone itself):

### Setting Up Wi-Fi LAN Testing:
1. Find your computer's local Wi-Fi IP address:
   - Windows: Run `ipconfig` (look for *IPv4 Address*, e.g., `192.168.1.120`).
   - macOS/Linux: Run `ifconfig` or `ip a` (e.g., `192.168.1.120`).
2. Start the FastAPI backend listening on all interfaces (`0.0.0.0`):
   ```bash
   cd backend
   python -m uvicorn backend.app:create_app --factory --host 0.0.0.0 --port 8000
   ```
3. In `mobile/.env`, set:
   ```env
   EXPO_PUBLIC_API_URL=http://192.168.1.120:8000/api
   ```
4. Build the APK. Both your phone and your development machine must be on the same Wi-Fi network.

### Setting Up Production Cloud Testing:
Set `EXPO_PUBLIC_API_URL` to your live HTTPS production endpoint. For EAS
cloud builds this is wired in `eas.json` (NOT `mobile/.env`, which only applies
to local `expo start`). The deployed backend URL format is:
```env
EXPO_PUBLIC_API_URL=https://<your-backend-domain>/api
```

---

## 5a. Required Configuration for a Working APK (Auth + Backend)

A standalone APK runs on a real device with **no connection to your dev
machine**, so several settings must be correct for login and data to work.
The repo already ships the code/config below; the **dashboard/deploy items are
the ones you must set yourself**.

### Already configured in the repo
- **Backend URL** — `eas.json` `preview` (APK) and `production` profiles configure
  `EXPO_PUBLIC_API_URL`.
- **HTTPS only** — `app.json` sets `android.usesCleartextTraffic: false`
  (the APK talks to the backend over HTTPS; no cleartext needed).
- **OAuth deep link** — `app.json` registers an Android intent filter for
  `projecttrack://auth/callback`, so Google sign-in reopens the installed app.
- **Native session persistence** — the backend returns Supabase tokens in the
  response body (`tokens`) and also accepts an `Authorization: Bearer` header;
  the app stores tokens in the OS keystore (`expo-secure-store`,
  `src/services/tokenStore.ts`) and sends them on every authenticated request.
  This is required because a React Native / APK client cannot rely on the
  browser's HTTP-only cookie the way the web app does.

### Dashboard & deploy steps you MUST do
1. **Supabase → Authentication → URL Configuration → Redirect URLs** — add:
   ```
   projecttrack://**
   exp://**
   ```
   (`projecttrack://**` is for the APK; `exp://**` is for Expo Go dev.)
   Leave the **Site URL** as your deployed website — do not change it. Without
   the redirect entry Supabase falls back to the Site URL and login bounces to
   the website instead of the app.
2. **Google Cloud Console → OAuth client → Authorized redirect URIs** — must
   contain the Supabase callback (not the app's):
   ```
   https://<your-supabase-ref>.supabase.co/auth/v1/callback
   ```
3. **Cloud Backend environment** — for the web app's cross-site
   cookie, set:
   ```
   AUTH_COOKIE_SECURE=true
   AUTH_COOKIE_SAMESITE=none
   FRONTEND_URL=https://<your-frontend-domain>
   ```
   (The APK uses token headers, not the cookie, so these only affect the web
   client — but they must be set for the website to stay logged in.)
   Redeploy the backend from the latest branch so the token/`MOBILE_APP_SCHEMES`
   changes are live.
4. **Release keystore SHA-256** (production signing) — add the fingerprint to
   Supabase (see §7) so `projecttrack://` deep links are trusted on signed APKs.

### Quick verification
- Open `https://<your-backend-domain>/api/health` in a browser — it
  should return JSON (backend is up).
- Install the APK, tap **Continue with Google**, authenticate → you should land
  **back in the app** (not the website), and the session should survive an app
  restart.

---

## 6. Hardware Permissions & Field Verification Tuning

The application enforces ground-truth physical verification before citizen reports can be accepted.

### 1. Location Permission (`ACCESS_FINE_LOCATION`)
- The app requires high-accuracy GPS hardware fixes.
- When prompted on Android, verifiers must select **"While using the app"** and enable **"Precise"** location (not approximate).
- If inside the ≤150m geofence radius of the project's official coordinates, the camera shutter turns teal/active.

### 2. Live Camera Permission (`CAMERA`)
- Field photo evidence must be captured directly through the live camera lens.
- Gallery selection is intentionally omitted to prevent pre-recorded or tampered image uploads.
- Captured photos are run through client-side downsampling and server-side Error Level Analysis (ELA) and perceptual hashing (pHash) upon submission.

---

## 7. Custom Release Keystores & Signing

EAS handles cryptographic keystore generation automatically in cloud builds. If you need to manage your own release signing key for Google Play Store compliance:

### Generating a Production Keystore:
```bash
keytool -genkeypair -v -storetype PKCS12 -keystore projecttrack-release.keystore \
  -alias projecttrack -keyalg RSA -keysize 2048 -validity 10000
```

### Retrieving the SHA-256 Fingerprint (for Supabase & Google OAuth):
```bash
keytool -list -v -keystore projecttrack-release.keystore -alias projecttrack
```
Copy the **SHA256 Fingerprint** into your Supabase Dashboard (`Authentication -> URL Configuration -> Android Client ID`) to enable Google Sign-In and OAuth deep links (`projecttrack://`).

---

## 8. Production Readiness Checklist

Before publishing an official release:

- [x] **Branded App Icons**: Verified `mobile/assets/icon.png` (512×512) and `adaptive-icon.png` are present.
- [x] **Splash Screen**: Configured with `#1f3d3c` background matching the application theme.
- [x] **Manifest Versioning**: `app.json` has `versionCode` incremented for every release.
- [x] **Safe MapLibre Integration**: `@maplibre/maplibre-react-native` plugin registered in `app.json` with fallback to `CebuVectorMap` SVG renderer.
- [x] **Input Sanitization**: Client-side XSS and injection stripping in `sanitizer.ts` validated on all text inputs.
- [x] **Production API Target**: `EXPO_PUBLIC_API_URL` pointed to secure HTTPS production gateway.
- [x] **Zero Mock GPS**: `ENABLE_MOCK_GPS=false` confirmed in `.env`.
