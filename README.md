# Penny Pilot

[![CI](https://github.com/NitikasriJeyanAchary0109/PennyPilot/actions/workflows/ci.yml/badge.svg)](https://github.com/NitikasriJeyanAchary0109/PennyPilot/actions/workflows/ci.yml)
[![Coverage](https://img.shields.io/badge/Coverage-Report-blue.svg)](docs/evidence/phase1b/coverage.txt)

Penny Pilot is an automated micro-savings and financial literacy assistant designed for college students, with a companion dashboard for educators/advisors. It automates savings through transaction round-ups and uses a local AI model (Llama3) to explain financial decisions in plain language.

---

## Production Cloud Deployment (Docker Compose)

To host Penny Pilot in production with automatic HTTPS (SSL) via Let's Encrypt, follow these steps:

### 1. Provision a Cloud Virtual Machine
Ollama running Llama 3 requires a minimum of **8GB RAM** (preferably 16GB) and 2+ vCPUs to perform inference with reasonable latency.
- Select a cloud provider (e.g., AWS EC2 `t3.large`, DigitalOcean Basic Droplet with 8GB RAM, or GCP Compute Engine).
- Provision the VM running **Ubuntu 22.04 LTS** or a similar Linux distribution.
- Ensure ports **80** (HTTP) and **443** (HTTPS) are open in your VM's security group/firewall.

### 2. Configure Your Domain / Subdomain
Caddy requires a valid domain name to automatically issue SSL certificates.
- If you do not have a custom domain, register a free subdomain at [DuckDNS](https://www.duckdns.org) or a similar dynamic DNS provider.
- Point your domain's **A Record** to the public IP address of your cloud VM.

### 3. Setup Environment Variables
Connect to your VM via SSH. Clone the repository and create a `.env` file (copied from `.env.example`) in the project root folder.
```bash
cp .env.example .env
```
Update the production variables inside `.env`:
- Set `DATABASE_URL` to `postgresql://postgres:password123@db:5432/sparechange`.
- Set `OLLAMA_URL` to `http://ollama:11434/api/generate`.
- Update `JWT_SECRET` to a strong, secure, unique password.
- Provide your production Google Client OAuth keys: `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
- Set `ENVIRONMENT` to `production`.

Also edit your [Caddyfile](./Caddyfile) on the VM and replace `yourapp.duckdns.org` with your actual domain name.

### 4. Build and Start the Containers
Run Docker Compose in detached mode to compile the multi-stage FastAPI container and spin up Caddy, PostgreSQL, and Ollama:
```bash
docker compose up --build -d
```

### 5. Pull Llama3 inside Ollama
Since Ollama initializes as a fresh container, you must download the `llama3` weights inside it:
```bash
# Execute pull command inside the running container
docker exec -it ollama_ai ollama pull llama3
```

### 6. Verify Deployed Status
Once running, Caddy automatically acquires and configures the Let's Encrypt SSL handshake.
- Open your browser and visit: `https://yourdomain.duckdns.org/api/health` to confirm the API is online and the database connection is healthy.
- Visit: `https://yourdomain.duckdns.org/docs` to see FastAPI's live Swagger interactive documentation.

### 7. Point Mobile Expo Clients to Production
On your development machine, configure your frontend project to point at the deployed production URL:
```bash
# inside /frontend/.env or environment configurations
EXPO_PUBLIC_API_URL=https://yourdomain.duckdns.org/api
```
Run `npx expo start` to test the mobile application end-to-end on physical phones communicating directly with your cloud deployment!

---

## Local Development Mode (Developer Fallback)

To run active code changes locally without provisioning a remote VM, you can run a minimized stack:

### 1. Database & Backend Local Boot
1. Run PostgreSQL locally via Docker Compose (using only the `db` service) or run standard postgres:
   ```bash
   docker compose up -d db
   ```
2. Navigate to `/backend` and activate your virtual environment:
   ```bash
   source venv/bin/activate
   pip install -r requirements.txt
   ```
3. Set your local `.env` variables:
   ```
   DATABASE_URL=postgresql://postgres:password123@localhost:5432/sparechange
   OLLAMA_URL=http://localhost:11434/api/generate
   JWT_SECRET=dev_secret_key
   ENVIRONMENT=development
   ```
4. Start FastAPI reload server:
   ```bash
   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```

### 2. Local AI Setup
1. Download and start [Ollama](https://ollama.com) on your local computer.
2. Run model pulling:
   ```bash
   ollama pull llama3
   ```

### 3. Frontend Expo Launch
1. Configure `frontend/.env`:
   ```
   EXPO_PUBLIC_API_URL=http://<YOUR_LAPTOP_LOCAL_IP>:8000/api
   ```
2. Launch Metro bundler:
   ```bash
   npm run start
   ```
