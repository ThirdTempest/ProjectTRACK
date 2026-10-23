# 01. Getting Started Guide

This technical guide provides step-by-step instructions for hackathon judges, technical evaluators, and developers to deploy, configure, and inspect the ProjectTrack platform locally.

---

## Quick Navigation

1. [Prerequisites](#1-prerequisites)
2. [Monorepo Structure](#2-monorepo-structure)
3. [Step-by-Step Local Setup](#3-step-by-step-local-setup)
   - [Step 3.1: Clone and Checkout `development`](#step-31-clone-and-checkout-development)
   - [Step 3.2: Configure Environment Variables](#step-32-configure-environment-variables)
   - [Step 3.3: Launch the Backend Services](#step-33-launch-the-backend-services)
   - [Step 3.4: Launch the Web Platform](#step-34-launch-the-web-platform)
4. [3-Minute Guided Tour for Hackathon Judges](#4-3-minute-guided-tour-for-hackathon-judges)
5. [Verification and Health Checks](#5-verification-and-health-checks)
6. [Troubleshooting and Common Issues](#6-troubleshooting-and-common-issues)
7. [Next Documentation Modules](#7-next-documentation-modules)

---

## 1. Prerequisites

Verify that the following runtimes and toolchains are available on your development workstation:

| Component | Minimum Required | Recommended | Verification Command |
| :--- | :--- | :--- | :--- |
| **Node.js** | `v18.0.0` | `v20.x` or `v22.x` (LTS) | `node -v` |
| **npm** | `v9.0.0` | `v10.x` | `npm -v` |
| **Python** | `3.10` | `3.11` or `3.12` | `python --version` |
| **Git** | `2.30+` | Latest | `git --version` |
| **Neo4j DB** *(Optional for local demo)* | Free AuraDB Cloud or Local Bolt | AuraDB Free Instance | See [Neo4j Setup](#step-32-configure-environment-variables) |

> [!NOTE]
> The web application includes built-in mock fallbacks and local GeoJSON datasets. The geospatial map features can be tested immediately even prior to configuring a live Neo4j database instance.

---

## 2. Monorepo Structure

ProjectTrack is structured as a modular civic tech repository:

```text
ProjectTrack/
├── README.md                      # Primary project overview and pitch
├── docs/                          # Technical documentation hub
│   ├── 01-getting-started.md      # Getting started guide (Current Document)
│   ├── 02-architecture.md         # Data pipeline, GraphRAG & entity relationships
│   ├── 03-tech-stack.md           # Architectural justifications
│   ├── 04-setup-guide.md          # Comprehensive setup and deployment
│   ├── 05-api-reference.md        # REST and SSE endpoint specifications
│   ├── 06-roadmap.md              # Development priorities and milestones
│   └── 07-security.md             # Security architecture and threat defense
├── Website/                       # React 19 + Leaflet GIS Web Application
├── mobile/                        # React Native Expo Geofenced Mobile Client
└── backend/                       # FastAPI, Neo4j GraphRAG, and Scraping Pipeline
```

---

## 3. Step-by-Step Local Setup

### Step 3.1: Clone and Checkout `development`

Ensure you are working on the active development branch:

```bash
git clone https://github.com/kaids77/ProjectTRACK.git
cd ProjectTRACK
git checkout development
```

---

### Step 3.2: Configure Environment Variables

#### A. Backend Configuration
Copy the template environment configuration file inside `backend/`:

```bash
# Windows (PowerShell)
cd backend
Copy-Item .env.example .env

# Linux / macOS
cd backend
cp .env.example .env
```

Open `.env` in an editor and review the parameters:

```env
# 1. Neo4j Aura Graph Database (Free AuraDB cloud instance or local bolt)
NEO4J_URI="neo4j+s://your-instance.databases.neo4j.io"
NEO4J_USERNAME="neo4j"
NEO4J_PASSWORD="your_neo4j_password_here"

# 2. LLM Configuration (Configurable - pick ONE provider)
#
# Option A: Groq LPU (default in code, requires free key from console.groq.com)
LLM_BASE_URL="https://api.groq.com/openai/v1"
LLM_MODEL="qwen/qwen3.8-27b"
LLM_API_KEY="gsk_your_groq_api_key_here"
#
# Option B: Hugging Face Free Inference Router (zero-cost, good for evaluation)
# LLM_BASE_URL="https://router.huggingface.co/v1"
# LLM_MODEL="XiaomiMiMo/MiMo-V2-Flash"
# LLM_API_KEY="hf_your_free_huggingface_token_here"
#
LLM_MAX_TOKENS=2048

# 3. Supabase & Apify (Optional: required only for running new data scrapers)
SUPABASE_URL="https://your-project.supabase.co"
SUPABASE_SERVICE_KEY="your_supabase_service_key"
APIFY_TOKEN="your_apify_token"
```

> [!TIP]
> If live Neo4j credentials are not provided at launch, the backend initializes in degraded mock mode. Health endpoints remain active, and database-dependent queries will return clear guidance.

#### B. Website Configuration
Ensure the frontend environment references the backend service address:

```bash
cd ../Website
echo "VITE_API_URL=http://localhost:8000" > .env
```

---

### Step 3.3: Launch the Backend Services

From the project root:

```bash
cd backend

# 1. Create a Python virtual environment
python -m venv venv

# 2. Activate virtual environment
# Windows (PowerShell):
.\venv\Scripts\Activate.ps1
# Linux / macOS:
source venv/bin/activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Start FastAPI server with live reload
python -m uvicorn backend.app:create_app --factory --reload --port 8000
```

Expected terminal output:
```text
INFO: Starting DPWH Cebu Knowledge Graph API v1.0.0
INFO: Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
```

Documentation endpoints:
* **Interactive Swagger UI:** [http://localhost:8000/docs](http://localhost:8000/docs)
* **ReDoc Specification:** [http://localhost:8000/redoc](http://localhost:8000/redoc)

---

### Step 3.4: Launch the Web Platform

In a separate terminal session:

```bash
cd Website

# 1. Install frontend dependencies
npm install

# 2. Start Vite development server
npm run dev
```

Expected output:
```text
  VITE v8.3.0  ready in 240 ms

  ->  Local:   http://localhost:5173/
  ->  Network: use --host to expose
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 4. 3-Minute Guided Tour for Hackathon Judges

To evaluate the core capabilities of ProjectTrack efficiently, follow this sequence:

### 1. Interactive Cebu Infrastructure Map (`http://localhost:5173`)
* **53 LGU Vector Boundaries**: Examine the vector polygon rendering of Cebu Province (44 municipalities and 9 cities) without heavy satellite raster tile latency.
* **Project Status Markers**: Select map markers across Metro Cebu or northern municipalities (such as Bogo City) to inspect project scopes, allocated budgets, designated contractors, and progress metrics.
* **Report Verification Filter**: Use the legend's On-Site Verified, Photo Flagged, and **All Anomalies** chips (the last shows every project carrying any citizen report) to filter the map by report tone.
* **Light / Dark Theme**: Toggle the sun/moon control in the header; the choice is persisted and defaults to your system preference. The brand wordmark renders as a tri-color "ProjectTrack".
* **"ProjectTrack Watchdog" Assistant**: Ask the floating assistant about any LGU or project; answers are framed around the project's WHAT / WHERE / WHO / WHEN / WHY / HOW from grounded data.
* **Administrative Zoom Threshold**: Zoom past level 12 to observe barangay-level administrative boundaries and spatial project distribution.

### 2. GraphRAG Assistant (`POST /api/chat`)
Navigate to the interactive Swagger UI at `http://localhost:8000/docs` under the Chat endpoints and submit:

```json
{
  "message": "Which contractor has the largest budget in northern Cebu flood control?",
  "mode": "ai"
}
```
* **Execution Flow**: The query executes a sub-20ms Cypher graph traversal, collects factual project records from Neo4j, evaluates 5-layer domain guardrails against off-topic prompting, and formats a grounded response (organized as WHAT / WHERE / WHO / WHEN / WHY / HOW) using the server-configured LLM provider. "Most reported" rankings are computed from the citizen field-report store so the chat agrees with the map legend.

### 3. Low-Latency Instant Lookups (`mode: "instant"`)
Submit a specific DPWH project identifier (e.g. `24HH0043`):
```json
{
  "message": "24HH0043",
  "mode": "instant"
}
```
* This operation bypasses LLM inference entirely, retrieving the exact structured record directly from the graph index in less than 10ms.

### 4. Contractor and Expenditure Analytics
Execute `GET /api/analytics/top-contractors?limit=5` to review aggregated public procurement figures, project counts, and entity associations.

---

## 5. Verification and Health Checks

Execute the following commands to confirm service integrity:

### Backend Health Endpoint
```bash
curl http://localhost:8000/api/health
```
Expected payload:
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "database": "connected",
  "timestamp": "2026-10-15T12:00:00Z"
}
```

### Frontend Build Verification
```bash
cd Website
npm run build
```
The application should complete bundling into the `dist/` directory with zero build errors.

---

## 6. Troubleshooting and Common Issues

### Port Conflicts (8000 or 5173)
* If port 8000 is occupied, run the backend with `--port 8080` and adjust `VITE_API_URL=http://localhost:8080` in `Website/.env`.
* If port 5173 is occupied, specify `--port 3000` during `npm run dev`.

### Running Without Live Neo4j Credentials
* The frontend includes fallback fixtures (`src/data/mockApi.js`, `src/assets/cebuMunicipalities.json`), allowing full UI evaluation even if graph credentials have not been configured.

### PowerShell Script Execution Policy
* If virtual environment activation fails on Windows, execute:
  ```powershell
  Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
  ```
  Then reactivate the environment.

---

## 7. Next Documentation Modules

Continue exploring the technical architecture and implementation details:

* [**02. Architecture & Pipelines**](02-architecture.md) — Knowledge graph schema, scraper architecture, and guardrail pipelines.
* [**03. Tech Stack Justification**](03-tech-stack.md) — Rationale for choosing FastAPI, React 19, Leaflet, and Neo4j.
* [**04. Comprehensive Setup Guide**](04-setup-guide.md) — Production database provisioning, environment variables, and Docker deployment.
* [**05. API Reference**](05-api-reference.md) — Comprehensive REST specifications and schema references.
* [**06. Development Roadmap**](06-roadmap.md) — Implementation schedule and technical backlog.
* [**07. Security Architecture**](07-security.md) — Defense-in-depth model, threat modeling, digital forensics, and citizen privacy.
