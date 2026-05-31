# AI Arbitrage Engine

Ecommerce-first arbitrage terminal built with a Vite React dashboard, Express API, Anakin Wire ingestion, DeepSeek/NVIDIA NIM appraisal, and SQLite persistence.

## Quick Start

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5173`.

Create `.env` from `.env.example`, add live Anakin Wire and NVIDIA NIM credentials, then start the app. The dashboard disables `Run scan` until required live configuration is present.

```bash
curl -X POST http://127.0.0.1:8787/api/scans
```

## Live Configuration

Create `.env` from `.env.example`, then set:

```bash
ANAKIN_API_KEY=...
ANAKIN_WIRE_BASE_URL=https://api.anakin.io/v1/wire
ANAKIN_ACTION_ID=...
ANAKIN_SEARCH_PARAMS_JSON={"query":"used camera","limit":20}
NVIDIA_NIM_API_KEY=...
NVIDIA_NIM_BASE_URL=https://integrate.api.nvidia.com/v1
DEEPSEEK_MODEL=deepseek-ai/deepseek-v4-pro
```

The server posts to Anakin Wire, polls the returned job, normalizes listings, sends them to NVIDIA NIM, parses a strict JSON array, and persists profitable opportunities to SQLite.

Use `GET /api/wire/search?q=amazon` to search Wire actions and find the exact `action_id` for your first target. The current Wire API uses `/v1/wire/task`, `/v1/wire/jobs/{id}`, and `/v1/wire/search`.

The app intentionally has no runtime mock mode. Tests use injected services and fetch stubs so the production path stays live-only without spending API credits.

## API

- `POST /api/scans`
- `GET /api/wire/search?q=...`
- `GET /api/scans/latest`
- `GET /api/opportunities`
- `GET /api/opportunities/:id`
- `GET /api/health`

## Verification

```bash
npm test
npm run build
```
