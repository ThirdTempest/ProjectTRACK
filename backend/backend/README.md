# DPWH Cebu Infrastructure FastAPI Backend

High-performance, production-ready Python **FastAPI** backend for the DPWH Cebu Infrastructure Knowledge Graph, Analytics, and GraphRAG Question Answering System.

Powered by **Neo4j Aura**, **Groq LPU Engine (`qwen/qwen3.8-27b`)**, and **Multi-Tier Fallback Resilience** (`Groq -> Local Ollama qwen2.5:0.5b -> Deterministic Graph Synthesizer`).

---

## Key Features

* **Sub-20ms Graph Traversal**: Query 4,370+ DPWH civil works projects, contractors, and budgets directly from Neo4j Aura.
* **5-Layer Domain Guardrails**: Sub-millisecond pre-retrieval intent classifier that blocks code requests, generic trivia, persona overrides, and off-domain queries before touching Neo4j or the LLM.
* **Prompt-Injection Hardening**: User messages and client-supplied history are normalized (NFKC, zero-width/control-char stripping, whitespace de-flooding, length cap) and screened for common injection phrasings (instruction-override, persona/developer-mode jailbreaks, prompt exfiltration, chat-template delimiters). Instruction-override content planted in history is also rejected.
* **Multi-Tier Fallback Resilience**:
  * **Groq LPU**: Primary high-speed cloud generation at ~500+ tok/s.
  * **Local Ollama Fallback**: Lightweight `qwen2.5:0.5b` (~398 MB) offline fallback via `python cli.py --setup-local-ai`.
  * **Deterministic Graph Synthesizer**: Sub-5ms zero-token factual synthesizer ensuring zero failures on rate limits (HTTP 429).
* **Instant Cypher Mode**: Retrieve project cards, analytics, and municipality summaries in `<10ms` without waiting for LLM generation.
* **Real-Time SSE Token Streaming**: Server-Sent Events (`/api/chat/stream`) for streaming token-by-token responses to web chat interfaces.
* **Conversational Memory & Spatial Targeting**: Follow-ups remember the prior location or project; a sandboxed, whitelist-validated LLM reference resolver handles ambiguous phrasing while staying DB-locked and injection-safe. Chat answers carry map coordinates that fly to an LGU or zoom to a single project.
* **Graph Analytics**: Contractor leaderboards, project rankings, and total budget aggregations.
* **Field Report Verification**: Authenticated citizen reports (`/api/reports`) with a server-authoritative ≤150m geofence check against DPWH coordinates (Pillar 1), ELA + perceptual-hash image forensics (Pillar 2), identity gating with a 3-reports/day limit and reputation scoring (Pillar 3), and verification badging (Pillar 5). Persisted to Supabase Postgres + Storage with a lightweight Neo4j `:Report` node.
* **Asynchronous Pipeline Operations**: Background task tracking for Supabase-to-Neo4j syncing and Apify scraping, plus a **passive periodic scraper** (APScheduler) that re-scrapes DPWH/PhilGEPS on a recurring interval (default ~90 days) and re-syncs into Neo4j automatically — even when deployed — with durable last-run state in Supabase (`/api/pipeline/schedule`).
* **Resilient Health Diagnostics**: Comprehensive monitoring of Neo4j Aura and LLM availability with graceful degradation reporting.

---

## Backend Architecture

```text
backend/
├── app.py                  # FastAPI app factory, CORS, routers & lifespan
├── config.py                # Typed settings via Pydantic Settings & .env
├── setup_local_ai.py        # Permission-gated 1-command installer for local Ollama & qwen2.5:0.5b
├── requirements.txt         # FastAPI backend dependencies
├── README.md                # Documentation & API reference
├── API_JSON_EXAMPLES.md     # Copy-pasteable JSON request/response examples
├── api/                     # Modular API endpoints
│   ├── __init__.py
│   ├── router.py            # Unified API router (/api)
│   ├── health.py            # /api/health, /api/health/neo4j, /api/health/llm
│   ├── projects.py          # /api/projects/{id}, /api/projects/search, /api/projects/by-location
│   ├── analytics.py         # /api/analytics/summary, /top-contractors, /top-projects, /appropriations, /procurement
│   ├── chat.py              # /api/chat (JSON), /api/chat/stream (SSE streaming)
│   ├── reports.py           # /api/reports (POST submit), /api/reports/{project_id} (GET list)
│   └── pipeline.py          # /api/pipeline/sync, /api/pipeline/scrape, /api/pipeline/jobs
├── models/                  # Pydantic validation & response schemas
│   ├── __init__.py
│   ├── common.py            # Standard responses & health models
│   ├── project.py           # Project detail, search result, location response
│   ├── analytics.py         # Contractor leaderboard, dataset metrics
│   ├── chat.py              # Chat request/response, guardrail status
│   └── pipeline.py          # Background jobs & status tracking
├── services/                # Business logic & database adapters
│   ├── __init__.py
│   ├── neo4j_service.py     # Connection pool & Cypher queries
│   ├── guardrail_service.py # Pre-retrieval classifier & stream rail
│   ├── llm_service.py       # Multi-tier LLM execution (Groq -> Ollama -> Synthesizer)
│   ├── graph_synthesizer.py # Deterministic Graph Synthesizer (<5ms)
│   └── pipeline_service.py  # Background job execution & state tracker
└── tests/                   # Test suite (55 unit & integration tests)
    ├── __init__.py
    ├── test_api.py          # API endpoints & guardrails tests (33 tests)
    └── test_fallback.py     # Fallback resilience & synthesizer tests (5 tests)
    └── test_auth.py          # Supabase auth endpoint tests (12 tests)
```

---

## Quickstart

### 1. Install Dependencies

From the repository root or `backend/` directory:

```bash
pip install -r backend/requirements.txt
```

### 2. Configure Environment Variables

The backend automatically reads from your `.env` file in the project root or backend directory:

```env
# Neo4j Database (required)
NEO4J_URI="neo4j+s://your-instance.databases.neo4j.io"
NEO4J_USERNAME="neo4j"
NEO4J_PASSWORD="your-password"

# Groq LPU Configuration (Fast API / Free Tier: https://console.groq.com/keys)
LLM_BASE_URL="https://api.groq.com/openai/v1"
LLM_MODEL="qwen/qwen3.8-27b"
GROQ_API_KEY="gsk_your_groq_api_key"
LLM_MAX_TOKENS=2048

# Supabase (required for authentication AND field reports)
SUPABASE_URL="https://your-project.supabase.co"
SUPABASE_SERVICE_KEY="your_service_role_key"     # server-only; writes reports + storage
SUPABASE_ANON_KEY="your_anon_public_key"         # required for /api/auth (GoTrue)
SUPABASE_REPORT_BUCKET="report-photos"           # optional; defaults to report-photos
# SUPABASE_JWT_SECRET="your_jwt_secret"          # optional; local JWT verification

# Session cookie behavior (set SECURE=true in production over HTTPS)
FRONTEND_URL="http://localhost:5173"
AUTH_COOKIE_NAME="pt_session"
AUTH_COOKIE_SECURE="false"
AUTH_COOKIE_SAMESITE="lax"

# Apify (optional: only needed when running the scraper)
APIFY_TOKEN="your_apify_api_token"

# Passive periodic scraper (APScheduler) — keeps the deployed graph fresh by
# re-scraping DPWH/PhilGEPS on a recurring interval and syncing into Neo4j.
# Durable last-run state lives in Supabase (apply migration 0003). Disabled by
# default; enable in production.
PASSIVE_SCRAPE_ENABLED="false"
PASSIVE_SCRAPE_INTERVAL_DAYS="90"      # ~3 months
PASSIVE_SCRAPE_MAX_ITEMS="500"
PASSIVE_SCRAPE_SYNC_AFTER="true"       # run Supabase→Neo4j sync after each scrape
PASSIVE_SCRAPE_RUN_ON_STARTUP="false"  # if overdue at boot, run ~1 min after startup
PASSIVE_SCRAPE_JOB_NAME="passive_scrape"
```

> **Note**: Supabase is **no longer optional** — `SUPABASE_URL` + `SUPABASE_ANON_KEY`
> back the `/api/auth` login flow, and `SUPABASE_URL` + `SUPABASE_SERVICE_KEY`
> back the `/api/reports` field-report subsystem (Postgres + the `report-photos`
> Storage bucket). Apply the migrations in `supabase/migrations/` first
> (see `supabase/README.md`). Only `APIFY_TOKEN` remains optional.

### 3. Run the Backend Server

Start the development server with auto-reload:

```bash
# Option A: Using the convenience runner
python run.py

# Option B: Using Uvicorn directly
python -m uvicorn backend.app:create_app --factory --reload --host 0.0.0.0 --port 8000
```

Once running:
* **Interactive Swagger UI**: [http://localhost:8000/docs](http://localhost:8000/docs)
* **ReDoc Documentation**: [http://localhost:8000/redoc](http://localhost:8000/redoc)
* **API Root**: [http://localhost:8000/](http://localhost:8000/)

---

## Running Tests

Run the full automated test suite (55 unit & integration tests):

```bash
python -m unittest discover -s backend/tests -p "test_*.py"
```

The test suite validates:
- **Pre-retrieval guardrails**: Blocking off-topic prompts in `<0.1ms`.
- **Infrastructure domain queries**: Accurate project extraction and routing.
- **Project lookups**: Exact project ID retrieval and 404 handling.
- **Analytics & rankings**: Top contractor budget aggregation and project rankings.
- **SSE Streaming**: Token streaming with fallback.
- **Fallback resilience**: Groq 429 rate limit automatic cascade to Instant Graph Synthesizer.
- **Installer safety**: Permission gating `[y/N]` prompt in `setup_local_ai`.
- **System health**: Multi-service diagnostics across Neo4j and LLM endpoints.

---

## API Reference and Endpoints

### Health and Diagnostics

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Comprehensive system health across Neo4j and LLM |
| `GET` | `/api/health/neo4j` | Neo4j Aura ping and latency (ms) |
| `GET` | `/api/health/llm` | LLM model status, latency, and fallback state |

---

### Projects

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/projects/{project_id}` | Look up DPWH project by ID (e.g. `24HH0043`) |
| `GET` | `/api/projects/search?q=...` | Full-text search across projects, contractors, locations |
| `GET` | `/api/projects/by-location?location=...` | Aggregate projects, total count & budget for a municipality |

> Location matching is exact and canonicalized: `Cebu City`, `City of Bogo`/`Bogo City`, and hyphenated names like `Lapu-Lapu City` resolve to a single LGU without cross-LGU leakage.

---

### Analytics

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/analytics/summary` | Overall dataset metrics (total projects, total budget, contractors) |
| `GET` | `/api/analytics/top-contractors?limit=10` | Ranked contractors by cumulative awarded budget |
| `GET` | `/api/analytics/top-projects?limit=10` | Most expensive DPWH infrastructure projects in Cebu |
| `GET` | `/api/analytics/appropriations?limit=50` | GAA appropriation totals per DPWH Cebu district office |
| `GET` | `/api/analytics/procurement?contractor=&limit=50` | PhilGEPS procurement awards linked to Cebu contractors |

---

### Chat and GraphRAG QA

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/chat` | Grounded GraphRAG conversational QA (Standard JSON) |
| `POST` | `/api/chat/stream` | Real-time Server-Sent Events (SSE) token streaming |

#### Request Payload:
```json
{
  "message": "Any flood control projects in Bogo?",
  "history": [],
  "mode": "ai"
}
```

* `mode="ai"`: Graph retrieval + Groq / Local Ollama / Deterministic Synthesizer.
* `mode="instant"`: Instant Cypher lookup (`<10ms`, zero AI latency).

---

### Authentication (Supabase-backed)

Backend-managed Supabase (GoTrue) auth. The server exchanges credentials/OAuth
tokens with Supabase and stores the session in an **HTTP-only cookie**, so the
browser never handles raw tokens. The web client calls these with
`fetch(..., { credentials: 'include' })` (see `Website/src/services/auth.js`).

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET`  | `/api/auth/oauth/{provider}?redirect=...` | OAuth authorize URL for `google`, `github`, `facebook`, ... |
| `POST` | `/api/auth/callback` | Persist `{ access_token, refresh_token }` from an OAuth redirect into the session cookie |
| `GET`  | `/api/auth/session` | Current user (`{ user }` or `{ user: null }`); auto-refreshes an expired token |
| `POST` | `/api/auth/signin` | Email/password sign-in; opens the session cookie |
| `POST` | `/api/auth/signup` | Email/password registration (honors Supabase email-confirmation) |
| `POST` | `/api/auth/resend` | Re-send the confirmation e-mail; surfaces Supabase's delivery error |
| `POST` | `/api/auth/signout` | Revoke the session and clear the cookie |

**Setup:** add `SUPABASE_ANON_KEY` (and keep `SUPABASE_URL`) to the backend
`.env`, and set `FRONTEND_URL` to your web origin so credentialed cookies and
the default OAuth redirect work. For a cross-site frontend over HTTPS, set
`AUTH_COOKIE_SECURE=true` and `AUTH_COOKIE_SAMESITE=none`.

The `redirect` query on `/api/auth/oauth/{provider}` and the `redirect` field on
`/api/auth/signup` are validated against `FRONTEND_URL` + `CORS_ORIGINS` (plus
local dev origins), so a bad origin fails loudly instead of silently bouncing
users elsewhere. Every origin you serve the web app from must **also** be in
Supabase Dashboard → Authentication → URL Configuration → **Redirect URLs**,
otherwise Supabase silently redirects back to the project Site URL:

    http://localhost:5173/**            # local dev (Vite)
    https://your-frontend-domain.com/** # production

Registration e-mails are sent by Supabase, so configure a custom SMTP provider
under Authentication → Email: the built-in mailer only delivers to the
organization's team members (2 per hour), so external addresses never receive
the confirmation link.

**Protecting a route (for teammates):**
```python
from fastapi import Depends
from backend.api.auth import get_current_user

@router.get("/private")
async def private(user = Depends(get_current_user)):
    return {"you_are": user.email}
```

---

### Pipeline Administration

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/pipeline/sync` | Trigger Supabase to Neo4j Aura sync in background task |
| `POST` | `/api/pipeline/scrape` | Trigger Apify DPWH portal web scraper in background task |
| `GET` | `/api/pipeline/jobs` | List recent background jobs |
| `GET` | `/api/pipeline/jobs/{job_id}` | Check status and logs of a specific background task |
| `GET` | `/api/pipeline/schedule` | Passive scraper state: enabled, interval, last/next run |
| `POST` | `/api/pipeline/schedule/run-now` | Force a passive scrape+sync cycle immediately (bypasses the interval guard) |

---

## License

MIT License. Designed for DPWH civil engineering data transparency and infrastructure analytics.
