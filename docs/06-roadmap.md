# 06. Development Roadmap and Scalability Vision

This document details the phased release schedule, active engineering priorities, and long-term architectural scalability roadmap for the ProjectTrack platform.

---

## 1. Release Timeline Overview

```mermaid
timeline
    title ProjectTrack Engineering Milestones
    Phase 1 (Current) : Core Knowledge Graph (4,370+ projects) : 53 LGU Vector Map : 5-Layer Domain Guardrails : FastAPI REST Gateway
    Phase 2 (Near-Term) : 2x Zoom Barangay Boundary Layer : Google & Facebook OAuth : People Initiative Portal : Enhanced Mobile Offline Sync
    Phase 3 (Medium-Term) : Automated Daily Scrapers (PhilGEPS & DPWH) : Image Forensics ELA Pipeline : Multi-District Collusion Detection
    Phase 4 (Long-Term) : Region 7 & 8 Expansion : Decentralized Audit Anchoring : Real-Time Citizen Budget Alerts
```

---

## 2. Active Development Priorities

### 2.1 Implemented & Stabilized Milestones

#### 2x Zoom Barangay Boundary and Density Layer
* **Objective**: Enable dynamic vector layer switching to display constituent barangays across Cebu when zooming beyond level 12.
* **Technical Implementation**: Optimized GeoJSON simplification and dynamic Overpass caching in `Website/src/features/map` and pre-bundled `cebuBarangays.json` in mobile client.
* **Status**: Completed.

#### GraphRAG Grounding and Secure Endpoints
* **Objective**: Parametric Cypher query extraction, 5-layer domain guardrails, and SSE token streaming on `/api/chat` and `/api/chat/stream`.
* **Technical Implementation**: High-speed intent gating (<0.1ms), prompt-injection normalization, grounded WHAT/WHERE/WHO/WHEN/WHY/HOW answer framing, and spatial map synchronization.
* **Status**: Completed.

#### Citizen Authentication (OAuth 2.0 / GoTrue)
* **Objective**: Allow community monitors and local watchdogs to establish verified accounts via Google OAuth and email/password.
* **Technical Implementation**: Backend-managed GoTrue auth under `/api/auth` with HTTP-only session cookies on web and native token store via `expo-secure-store` on mobile.
* **Status**: Completed.

#### Field Anomaly Reporting & Verification Badging
* **Objective**: Authenticated field reporting module for citizens to report stalled, abandoned, or defective projects with photo evidence.
* **Technical Implementation**: Server-side ≤150m geofence verification, ELA and pHash forensics, 3-per-day rate limits, reputation scoring, and badging across web and mobile.
* **Status**: Completed.

---

### 2.2 Next Phase Priorities

#### Unified District and Municipal Pin Interaction
* **Objective**: Standardize click interactions across administrative levels. Clicking a municipal boundary or district engineering office (DEO) triggers a slide-out panel detailing all concurrent projects, total allocated budget, and contractor distribution.
* **Status**: Scheduled.

---

## 3. Future Scalability and Architectural Vision

### 3.1 Scaling Knowledge Graph Ingestion
As project volume expands from Cebu Province (4,370+ records) to Region 7 (Central Visayas: Bohol, Negros Oriental, Siquijor) and nationwide DPWH registries (100,000+ records), the data pipeline will transition from batch scripts to distributed event-driven ingestion:

```mermaid
flowchart LR
    Scraper["Apify / Playwright Scraper"] --> Kafka["Event Bus (Kafka / Redis Streams)"]
    Kafka --> Normalizer["Worker Pool (Pydantic Normalization)"]
    Normalizer --> Neo4jCluster[("Neo4j Aura Enterprise Cluster")]
    Normalizer --> S3["Object Lake (PDF Audits & Raw JSON)"]
```

### 3.2 Advanced Anti-Collusion Graph Analytics
Leverage Neo4j Graph Data Science (GDS) algorithms to compute:
* **Contractor Centrality & Clustering**: Detect circular joint-venture bidding patterns where specific contractors repeatedly bid in paired configurations across districts.
* **Variance Anomalies**: Flag projects with statistically significant completion time variances or repeat budget augmentations exceeding the 10% statutory threshold.

### 3.3 Cryptographic Audit Trail
To protect civic reports against retrospective tampering or censorship:
* Generate an immutable SHA-256 Merkle root of verified on-site field audits every 24 hours.
* Anchor the Merkle root onto an open public ledger or timestamp authority, guaranteeing historical immutability for investigative journalists and public watchdogs.

### 3.4 Mobile Application Rollout
* Complete the production build of the React Native Expo client using EAS (Expo Application Services) with `expo-camera`, `expo-location` hardware hooks, and `expo-task-manager` for resilient offline background synchronization.
