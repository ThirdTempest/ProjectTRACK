# ProjectTRACK Mobile Client

> Geofenced Field Auditor for DPWH Infrastructure Verification across Cebu Province

[![Expo SDK](https://img.shields.io/badge/Expo-SDK%2052-000020.svg?logo=expo)](https://expo.dev)
[![React Native](https://img.shields.io/badge/React%20Native-0.76-61DAFB.svg?logo=react)](https://reactnative.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-3178C6.svg?logo=typescript)](https://typescriptlang.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](../LICENSE)

---

## Overview

The mobile client is the companion app for on-the-ground infrastructure monitoring. It enables field auditors and citizen volunteers to verify DPWH project progress with GPS-locked photo evidence, live backend data, and a conversational assistant — all synced to the ProjectTRACK backend.

All data is live (no mock data). The UI renders explicit loading, empty, and error states when the backend is unreachable.

---

## Android APK Download

The latest stable APK is attached to the GitHub Release:

**[Download ProjectTRACK.apk from GitHub Releases](https://github.com/kaids77/ProjectTRACK/releases/latest)**

### Installation

1. Open the release page on your Android device and tap **ProjectTRACK.apk** to download.
2. Open the downloaded file from your notification bar or Downloads folder.
3. Tap **Install**. If prompted, enable "Install from unknown sources" for your browser under Settings > Security.
4. The app connects to the deployed backend automatically.

**Minimum Android version:** Android 8.0 (API 26)

---

## Capabilities

| Feature | Description |
| :--- | :--- |
| **GPS-Aware Field Audits** | Geofenced photo capture using `expo-location` and `expo-camera`, requiring physical proximity (150 m) to project coordinates before evidence can be submitted. The shutter stays locked until a live hardware GPS fix is inside the geofence. |
| **Server-Authoritative Verification** | Submissions are re-validated server-side: the backend recomputes the Haversine distance against the project's DPWH coordinates and runs ELA + perceptual-hash image forensics before trusting a report. |
| **Verification Badging** | Each submitted report surfaces its verdict — status, distance from site, forensics result, and reporter reputation — using the same schema as the web client. |
| **Offline-First Architecture** | An in-memory outbox queues audits captured offline; `api.syncPendingAudits()` POSTs them to the backend when connectivity returns, marking each synced on success. |
| **Conversational Field Assistant** | On-device access to the GraphRAG chat via SSE streaming for contextual project queries. |
| **Dual-Tier Vector GIS & Barangay Mapping** | SVG vector cartography and cross-platform MapLibre GIS covering all 53 Cebu LGUs with live project markers and contractor overlays. Seamlessly transitions from municipal boundaries to granular barangay-level vector polygons (`src/assets/cebuBarangays.json`) at high zoom (~Zoom 12+), featuring touch selection, boundary highlights, and zoom-aware label rendering. |
| **Live Backend Data** | All project, pin, contractor, summary, and chat data is fetched live from the backend. No bundled mock dataset. Loading, empty, and error (retry) states are shown when the backend is unreachable. |
| **Brand Logo with Dark-Mode Support** | The ProjectTRACK logo is bundled as the app icon, splash screen, and in-app header mark. The `Logo` component swaps to a white variant on dark surfaces so it remains visible in both light and dark contexts. |
| **Native Session Persistence** | Session tokens are stored in the OS keystore via `expo-secure-store` and sent as `Authorization: Bearer` headers on every authenticated request. A React Native APK cannot rely on browser HTTP-only cookies, so token-based auth is used on native while the web client continues to use the cookie. |
| **Google OAuth via Deep Link** | Sign-in via Google returns to the app through the `projecttrack://` deep link scheme. `expo-linking` resolves the correct callback URL for each runtime: `exp://` in Expo Go, `projecttrack://` in standalone builds. |
| **44-Point Touch Targets** | All interactive controls meet the 44 pt minimum touch-target standard (iOS HIG / Material Design). |
| **Client-Side Input Sanitization** | `sanitizer.ts` strips Cypher/SQL injection vectors, script tags, control codes, and null bytes before user inputs reach the network. |
| **Spatial Coordinate Normalization** | `geoUtils.ts` enforces geographic bounding constraints across Cebu Province (mainland, Bantayan, Camotes) and rejects cross-strait coordinate anomalies (Bohol and Negros). |
| **Hardware-Accelerated MapLibre GIS** | Interactive vector GIS layer featuring selected municipality boundary fills, golden pin selection rings, red anomaly hotspot beacons, and cold-start retry resilience. |
| **Build Alignment via Build Properties** | Configured via `expo-build-properties` to lock Kotlin 1.9.25 (Android `versionCode: 9`), ensuring seamless Gradle compilation with Jetpack Compose Compiler 1.5.15 and Expo SDK 52. |

---

## Prerequisites

| Tool | Version | Verification |
| :--- | :--- | :--- |
| Node.js | 18+ (LTS recommended) | `node -v` |
| npm | 9+ | `npm -v` |
| Expo CLI | Latest | `npx expo --version` |
| EAS CLI | 12+ (for APK builds) | `eas --version` |
| Android Studio or Xcode | For emulator / simulator | — |

---

## Quick Start

```bash
# Install dependencies
cd mobile
npm install

# Start the Expo development server
npm run dev
```

---

## Environment Configuration

Copy the environment template and adjust as needed:

```bash
cp .env.example .env
```

| Variable | Default | Description |
| :--- | :--- | :--- |
| `EXPO_PUBLIC_API_URL` | `http://10.0.2.2:8000/api` | Backend gateway. Auto-selects per platform (Android emulator `10.0.2.2`, web current host, iOS `localhost`). Override with a LAN IP or deployed HTTPS URL for physical-device or production use. |
| `EXPO_PUBLIC_OAUTH_REDIRECT` | (auto) | Optional: pin the exact OAuth callback URL if your Supabase redirect allow-list requires an exact match rather than a wildcard. |
| `GEOFENCE_RADIUS_METERS` | `150` | Required proximity to project coordinates for photo capture. The backend re-validates this server-side. |
| `MAX_OFFLINE_QUEUE_ITEMS` | `500` | Maximum queued observations before forced sync. |
| `ENABLE_MOCK_GPS` | `false` | Set `true` only for emulator testing. |

> The backend CORS policy allows local and LAN origins (localhost, 127.0.0.1, 192.168.x.x, 10.x.x.x) plus `FRONTEND_URL`, so pointing `EXPO_PUBLIC_API_URL` at your machine's LAN IP works for on-device testing without backend changes.

After editing `.env`, restart Expo with a clean cache:

```bash
npx expo start -c
```

---

## Cross-Origin Networking (Physical Device)

When testing on a physical phone via Expo Go, the app must reach the backend over your LAN. The default emulator address (`10.0.2.2`) does not work on a real device.

1. Find your development machine's LAN IP:
   ```powershell
   Get-NetIPAddress -AddressFamily IPv4
   ```
2. Start the backend bound to all interfaces:
   ```bash
   python -m uvicorn backend.app:create_app --factory --reload --host 0.0.0.0 --port 8000
   ```
3. Set in `mobile/.env`:
   ```env
   EXPO_PUBLIC_API_URL=http://192.168.x.x:8000/api
   ```
4. Restart Expo: `npx expo start -c`

---

## Available Scripts

| Command | Description |
| :--- | :--- |
| `npm run dev` | Start Expo development server |
| `npm run android` | Launch on Android emulator |
| `npm run ios` | Launch on iOS simulator |
| `npm run web` | Launch in browser (Expo web) |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Run TypeScript type checking (`tsc --noEmit`) |
| `npm run test` | Run Jest test suite (29 suites, 199 tests) |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run audit` | Allowlist-aware `npm audit` gate |
| `npm run build:apk:cloud` | Build standalone APK via EAS cloud |

---

## Building the APK (EAS Cloud — Recommended)

No Android Studio or Java JDK required. EAS builds in the cloud.

```bash
# One-time setup
eas login
eas project:init   # links the project and writes projectId to app.json

# Build the APK
eas build --platform android --profile preview
```

The build targets the production backend API (configured in `eas.json`). When the build finishes, EAS prints a download URL. Attach the APK to the GitHub Release so the website's "Get an App" button can download it directly.

**Latest build:** EAS build `484fb092-bcff-46e2-9fd7-5487d948bfca`, version 1.0.0 (versionCode 9).

---

## Project Structure

```text
mobile/
├── App.tsx                  # Root component and navigation
├── src/
│   ├── core/                # Types, geo utilities (Haversine, coordinate math, viewBox zoom)
│   ├── data/                # Static UI content only (FAQ entries) — no mock data
│   ├── services/
│   │   ├── api.ts           # Live backend REST client
│   │   ├── tokenStore.ts    # Native session persistence via expo-secure-store
│   │   ├── outbox.ts        # Offline-first audit queue
│   │   ├── location.ts      # GPS utilities
│   │   └── haptics.ts       # Haptic feedback
│   ├── ui/
│   │   ├── components/      # Reusable UI (BottomTabBar, MapHeader, Logo, CebuVectorMap, etc.)
│   │   ├── screens/         # HomeScreen, MapScreen, ContractorRankingScreen, Auth
│   │   └── theme.ts         # Shared sizing tokens (MIN_TOUCH = 44)
│   └── assets/              # GeoJSON boundaries (cebuMunicipalities.json, cebuBarangays.json), logo variants
├── __tests__/               # Jest test suite (29 suites, 199 tests)
├── app.json                 # Expo SDK 52 configuration
├── eas.json                 # EAS Build profiles (preview APK, production AAB)
├── tsconfig.json            # TypeScript configuration
├── babel.config.js          # Babel configuration
├── eslint.config.js         # ESLint flat config
└── jest.config.js           # Jest configuration
```

---

## Backend Integration

The mobile client communicates with the ProjectTRACK FastAPI backend. All authenticated requests send an `Authorization: Bearer <access_token>` header alongside `credentials: 'include'` so both web-cookie and native-token auth paths work.

| Endpoint | Usage |
| :--- | :--- |
| `GET /api/projects/map` | Geocoded pins for map visualization |
| `GET /api/projects/by-location` | Projects for a selected municipality |
| `GET /api/projects/search` | Full-text project search |
| `GET /api/analytics/summary` | Province-wide statistics |
| `GET /api/analytics/top-contractors` | Contractor leaderboard |
| `GET /api/analytics/top-projects` | Highest-budget projects |
| `POST /api/auth/signin` | Email/password sign-in |
| `POST /api/auth/signup` | Account registration |
| `GET /api/auth/session` | Session restoration (returns refreshed tokens if needed) |
| `GET /api/auth/oauth/{provider}` | OAuth authorize URL |
| `POST /api/auth/callback` | Complete OAuth login |
| `POST /api/auth/signout` | Sign out |
| `POST /api/reports` | Submit geofenced field report (multipart) |
| `GET /api/reports/{id}` | Fetch a project's reports with verification badges |
| `POST /api/chat` | GraphRAG assistant |
| `GET /api/health` | Backend connectivity check |

---

## Supabase Configuration (Required for OAuth)

For Google sign-in to return to the app rather than the deployed website, the following redirect URLs must be registered in Supabase > Authentication > URL Configuration > Redirect URLs:

```
projecttrack://**
exp://**
```

`projecttrack://**` covers standalone APK builds. `exp://**` covers Expo Go development.

---

## Testing

```bash
npm run test            # Run all 29 suites (199 tests)
npm run test:coverage   # Coverage report (80% branch/line/function threshold)
```

---

## Security and Dependency Audit

The CI Security Audit workflow runs `npm run audit` for this package. The Expo SDK 52 / React Native 0.76 build toolchain introduces transitive advisories whose only npm remediation is a breaking SDK downgrade. Known toolchain advisory IDs are documented in `mobile/.npm-audit-allow.json`. The gate still fails on any new high/critical advisory outside that allowlist.

---

## Deployment Guide

For production keystore signing, Google Play Store publishing, and the full EAS build pipeline, see:

[Deployment and APK Guide](docs/DEPLOYMENT_AND_APK_GUIDE.md)

---

## Contributing

See the root [CONTRIBUTING.md](../CONTRIBUTING.md) for branching strategy, commit conventions, and pull request guidelines.
