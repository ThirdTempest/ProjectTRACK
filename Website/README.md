# ProjectTrack Web Platform

The web presentation tier of ProjectTrack provides an interactive, low-latency geospatial dashboard for monitoring DPWH civil works projects across the Province of Cebu, Philippines.

---

## Technical Stack

* **UI Framework**: [React 19](https://react.dev)
* **Build Tool**: [Vite 8](https://vite.dev)
* **Routing**: History API pathname routing (`src/app/router.js`)
* **Cartography & GIS**: [Leaflet](https://leafletjs.com) via [react-leaflet 5](https://react-leaflet.vercel.app)
* **Styling**: [Tailwind CSS 4](https://tailwindcss.com) (color palettes configured in `src/index.css`)
* **Testing**: [Vitest](https://vitest.dev) + Testing Library
* **Linting**: ESLint (Flat Configuration)

---

## Key Capabilities

* **Vector Boundary Rendering**: Renders all 53 Local Government Units (LGUs) of Cebu Province (44 municipalities and 9 cities) as styled vector polygons without requiring external raster satellite tile services.
* **Barangay Zoom Intelligence**: Dynamic polygon rendering for barangay boundaries at high zoom levels (~Zoom 12+).
* **Project Status Markers**: Teal diamonds for ongoing projects (with completion %), blue diamonds for completed.
* **Proximity Marker Clustering**: Projects that overlap on screen are clustered by a zoom-aware pixel distance (`src/features/map/cluster.js`), not just by identical coordinates. Clusters collapse to one pin with a count and a nearby-projects list, and separate again as you zoom in.
* **Light / Dark Theme**: A header sun/moon toggle switches the whole interface between light and dark, persisted to `localStorage` and defaulting to the visitor's system preference (`src/services/theme.js`). The brand wordmark renders as a tri-color "ProjectTrack" (logo-toned "Project" + green "Track").
* **"Get an App" Header Download**: Centered navigation control providing turnkey access to the standalone Android APK (via `VITE_APK_URL`) with seamless fallback to GitHub Releases, displayed prominently on desktop and inside the mobile navigation drawer.
* **Interactive Audio Easter Egg**: Lightweight audio entertainment easter egg triggered via multi-click user interaction, featuring graceful audio element management and zero performance overhead.
* **Two-Stage Resilient Geolocation**: Browser GPS engine with a rapid high-accuracy pass followed by a coarse cache-tolerant Wi-Fi/IP fallback, accompanied by actionable failure reason codes and in-place retry controls.
* **Location Intel Panel**: Per-LGU project list with statuses, budgets, and paginated full-details modal.
* **Contractor Rankings**: `/contractors` page ranking contractors by awarded budget.
* **Auth**: Email/password and OAuth sign-in via the backend (`src/services/auth.js`); session-aware header with avatar menu.
* **Field Report Verification**: Authenticated anomaly reporting from any project (`ReportAnomalyModal` in `src/features/map/CebuMap.jsx`). Attaches browser geolocation (lower-trust; re-validated server-side), enforces the backend's minimum description length (10 characters) client-side, handles sign-in (401) and the 3-per-day limit (429), and renders the backend verification verdict — status, distance from site, image-forensics result, reporter reputation, and timestamp — via `VerificationBadges`.
* **GraphRAG Chat with Memory ("ProjectTrack Watchdog")**: Floating chat assistant streaming from the backend SSE endpoint (non-streaming fallback). Answers are framed around the WHAT / WHERE / WHO / WHEN / WHY / HOW of a project from grounded facts, with no server-side vendor identifiers surfaced in the UI. Context-aware follow-ups ("tell me more about it", "what about in Cordova?") keep the prior topic.
* **Chat-Synchronized Map**: Chat answers drive the map camera - location questions fly to the LGU, while singular/superlative follow-ups ("what's the most expensive one?", "where is it located?", "most reported in Cordova?") zoom to that one project and highlight its pin. Clicking any pin highlights it too.
* **Verified Anomaly Reporting**: The report modal captures browser GPS on submit (`src/services/geolocation.js`, non-blocking — denial/timeout degrades gracefully) and sends it to the backend geofence; the project detail panel lists **all** community reports newest-first in a responsive two-column grid (one column on narrow mobile), each with its verification badge (colored diamond + "On-Site Verified" / "Unverified" / "Photo Flagged"), distance, timestamp, description, and photo — topped by an aggregate summary line (e.g. "4 reports · 3 On-Site Verified · 1 Photo Flagged") and filter chips + pagination so on-site consensus against official status is visible at a glance (`src/features/map/CebuMap.jsx`). Verification uses a violet/rose/white palette distinct from the amber/emerald/cyan project-status hues, and the **Project Map Legend** shows an interactive "Report Verification" filter — On-Site Verified, Photo Flagged, and **All Anomalies** (every project carrying any citizen report) — each rendered as a colored diamond + label pill, the same visual language as the status filter symbols.

---

## Local Development

### 1. Installation
```bash
# Navigate to Website directory
cd Website

# Install dependencies
npm install
```

### 2. Environment Configuration
Copy the sample environment file:
```bash
cp .env.example .env
```
Ensure `VITE_API_URL` points to your backend instance (default: `http://localhost:8000`).

### 3. Execution Commands
```bash
npm run dev      # Launch Vite development server (http://localhost:5173)
npm run lint     # Run ESLint validation
npm run test     # Run Vitest suite
npm run build    # Compile production bundle to dist/
npm run preview  # Locally preview production build
```

---

## Spatial Data Sources

* `public/data/cebuMunicipalities.json`: GeoJSON `FeatureCollection` covering the 53 LGUs of Cebu Province (mainland, Bantayan, Camotes, Mactan, Olango). Sourced from [geoBoundaries](https://www.geoboundaries.org) `PHL/ADM3` (gbOpen), based on NAMRIA/PSA data. Lazy-loaded at runtime to keep the initial bundle small.
* `src/data/cebuLguNames.js`: Lightweight list of the 53 LGU names used for text sections and the municipality browser grid.
* `src/services/overpass.js`: Barangay boundaries fetched from Overpass mirrors with timeout, retry, and failure cooldown.

---

## Project Structure

This package is part of the ProjectTrack open-source monorepo, licensed under the MIT License.

---

## Contributing

See the root [CONTRIBUTING.md](../CONTRIBUTING.md) for branching strategy, commit conventions, and pull request guidelines.
