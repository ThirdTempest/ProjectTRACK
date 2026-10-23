# 04. Comprehensive Setup and Deployment Guide

This guide provides technical instructions for configuring, deploying, and operating ProjectTrack via native local toolchains or containerized Docker environments.

---

## 1. Deployment Approaches

Choose the workflow best suited to your development environment:

* **Native Development**: Recommended for active code iteration on macOS, Linux, or Windows.
* **Docker Compose**: Recommended for reproducible evaluation, CI/CD testing, or judges wishing to avoid installing local language runtimes.

---

## 2. Approach A: Native Local Development

### 2.1 Backend Configuration

1. **Navigate to the Backend Directory**:
   ```bash
   cd backend
   ```

2. **Initialize Python Virtual Environment**:
   ```bash
   # Create virtual environment
   python -m venv venv

   # Activate virtual environment
   # Windows (PowerShell):
   .\venv\Scripts\Activate.ps1
   # Linux / macOS:
   source venv/bin/activate
   ```

3. **Install Python Dependencies**:
   ```bash
   pip install --upgrade pip
   pip install -r requirements.txt
   ```

4. **Configure Environment Variables**:
   ```bash
   cp .env.example .env
   ```
   Edit `.env` with your preferred database credentials and LLM keys:
   ```env
   # Server Settings
   HOST=0.0.0.0
   PORT=8000
   DEBUG=True

   # Neo4j Graph Database
   NEO4J_URI=neo4j+s://your-instance.databases.neo4j.io
   NEO4J_USERNAME=neo4j
   NEO4J_PASSWORD=your_password

   # LLM Configuration (Default: Groq LPU)
   LLM_BASE_URL=https://api.groq.com/openai/v1
   LLM_MODEL=qwen/qwen3.8-27b
   GROQ_API_KEY=gsk_your_groq_api_key
   LLM_MAX_TOKENS=2048
   ```

5. **Start Application Server**:
   ```bash
   python -m uvicorn backend.app:create_app --factory --reload --port 8000
   ```

---

### 2.2 Web Dashboard Configuration

1. **Navigate to Website Directory**:
   ```bash
   cd ../Website
   ```

2. **Install Node Dependencies**:
   ```bash
   npm install
   ```

3. **Set Environment Variables**:
   ```bash
   echo "VITE_API_URL=http://localhost:8000" > .env
   ```

4. **Start Development Server**:
   ```bash
   npm run dev
   ```

The dashboard will be available at `http://localhost:5173`.

---

### 2.3 Mobile Field Client Configuration (React Native with Expo)

1. **Navigate to Mobile Directory**:
   ```bash
   cd ../mobile
   ```

2. **Install Mobile Dependencies**:
   ```bash
   npm install
   ```

3. **Configure Mobile Environment**:
   ```bash
   cp .env.example .env
   ```
   Set `EXPO_PUBLIC_API_URL` to point to your backend service (e.g. `http://10.0.2.2:8000/api` for Android Emulator or your LAN IP for physical testing).

4. **Launch Expo Development Server**:
   ```bash
   npx expo start
   ```
   Scan the generated QR code with **Expo Go** on Android or iOS, or press `a` for Android Emulator / `i` for iOS Simulator.

---

## 3. Approach B: Containerized Docker Deployment

For environments with Docker and Docker Compose installed, the entire platform can be initialized via container orchestration.

### 3.1 Project Docker Compose File (`docker-compose.yml`)

Save the following configuration as `docker-compose.yml` in the project root:

```yaml
version: "3.8"

services:
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: projecttrack-backend
    ports:
      - "8000:8000"
    environment:
      - HOST=0.0.0.0
      - PORT=8000
      - NEO4J_URI=${NEO4J_URI:-bolt://neo4j:7687}
      - NEO4J_USERNAME=${NEO4J_USERNAME:-neo4j}
      - NEO4J_PASSWORD=${NEO4J_PASSWORD:-secretpassword123}
      - LLM_BASE_URL=${LLM_BASE_URL:-https://router.huggingface.co/v1}
      - LLM_MODEL=${LLM_MODEL:-XiaomiMiMo/MiMo-V2-Flash}
      - LLM_API_KEY=${LLM_API_KEY:-}
    depends_on:
      - neo4j
    networks:
      - projecttrack-network

  website:
    build:
      context: ./Website
      dockerfile: Dockerfile
    container_name: projecttrack-website
    ports:
      - "5173:80"
    depends_on:
      - backend
    networks:
      - projecttrack-network

  neo4j:
    image: neo4j:5.18-community
    container_name: projecttrack-neo4j
    ports:
      - "7474:7474" # HTTP Browser
      - "7687:7687" # Bolt Protocol
    environment:
      - NEO4J_AUTH=neo4j/secretpassword123
      - NEO4J_PLUGINS=["apoc"]
    volumes:
      - neo4j_data:/data
    networks:
      - projecttrack-network

volumes:
  neo4j_data:

networks:
  projecttrack-network:
    driver: bridge
```

### 3.2 Backend Dockerfile (`backend/Dockerfile`)

```dockerfile
FROM python:3.11-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    gcc \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["python", "-m", "uvicorn", "backend.app:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000"]
```

### 3.3 Website Dockerfile (`Website/Dockerfile`)

```dockerfile
# Build stage
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Production web server stage
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

### 3.4 Orchestrating the Stack

```bash
# Build and run all services in detached mode
docker compose up --build -d

# Check operational logs
docker compose logs -f backend

# Stop the containers
docker compose down
```

---

## 4. Provisioning the Neo4j Knowledge Graph

### Free Cloud Database (Neo4j AuraDB)
1. Register a free account at [neo4j.com/cloud/platform/aura-graph-database/](https://neo4j.com/cloud/platform/aura-graph-database/).
2. Create an **AuraDB Free** instance.
3. Download the generated credentials file containing your `NEO4J_URI` (starts with `neo4j+s://`), `NEO4J_USERNAME` (`neo4j`), and generated password.
4. Paste these values into `backend/.env`.

### Initializing Graph Schema
Connect to your Neo4j instance via Neo4j Browser or Cypher Shell and execute:

```cypher
CREATE CONSTRAINT unique_project_id IF NOT EXISTS
FOR (p:Project) REQUIRE p.id IS UNIQUE;

CREATE CONSTRAINT unique_contractor_name IF NOT EXISTS
FOR (c:Contractor) REQUIRE c.name IS UNIQUE;

CREATE FULLTEXT INDEX projectSearchIndex IF NOT EXISTS
FOR (p:Project) ON EACH [p.name, p.id, p.category];

CREATE FULLTEXT INDEX locationSearchIndex IF NOT EXISTS
FOR (l:Location) ON EACH [l.name];
```

---

## 5. Running the Data Pipeline

To populate the database with real DPWH Cebu projects:

```bash
cd backend

# Option 1: Ingest pre-scraped data from Supabase to Neo4j
python pipeline/sync_to_neo4j.py

# Option 2: Run complete scraper against DPWH public registries
python pipeline/scrape_cebu_dpwh.py
```
