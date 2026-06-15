# Eka Drug Crawler

Production-grade autonomous crawler that discovers and stores all medicine records from the Eka Care drug search API using recursive prefix expansion.

---

## Architecture

```
┌────────────────────────────────────────────────────────────┐
│                    FastAPI Admin API :8080                   │
│  /health  /stats  /drugs  /prefixes  /crawl/start  /export  │
└───────────────────────┬────────────────────────────────────┘
                        │
         ┌──────────────▼──────────────┐
         │       Redis (Queue)          │
         │  crawler:prefix_queue        │
         │  crawler:processed_prefixes  │
         │  crawler:live_stats          │
         └──────────────┬──────────────┘
                        │  BRPOP
         ┌──────────────▼──────────────┐
         │    N Async Workers           │
         │  ┌──────────────────────┐   │
         │  │  CrawlEngine         │   │
         │  │  Phase 1: a-z 0-9   │   │
         │  │  Phase 2: expand if  │   │
         │  │  results == limit    │   │
         │  └──────────┬───────────┘   │
         └─────────────┼───────────────┘
                       │
         ┌─────────────▼───────────────┐
         │     PostgreSQL (phr_db)      │
         │  drugs          (main data)  │
         │  crawl_prefixes (progress)   │
         │  crawl_stats    (metrics)    │
         └─────────────────────────────┘
```

### Crawling Algorithm

**Phase 1** — Seed 36 single-character prefixes (`a`–`z`, `0`–`9`) into Redis queue.

**Phase 2** — For each prefix:
- Fetch all pages from API
- If `result_count == API_LIMIT (8)` → expand to 36 children (`prefix + a-z0-9`)
- If `result_count < API_LIMIT` → it's a leaf, store results, mark done
- Repeat recursively up to `CRAWLER_MAX_DEPTH` (default: 6)

---

## Quick Start

### 1. Prerequisites

- Python 3.12+
- Redis (or `docker-compose up redis`)
- PostgreSQL (`phr_db` — existing Infer DB)

### 2. Setup

```bash
cd drug-crawler
python -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env — set DATABASE_URL, EKA_COOKIES, EKA_CID, EKA_DOCID
```

### 3. Run migrations

```bash
# Creates drugs, crawl_prefixes, crawl_stats tables in phr_db
alembic upgrade head
```

### 4. Start the API server

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8080 --reload
```

### 5. Start the crawler

**Option A — via API:**
```bash
curl -X POST http://localhost:8080/api/v1/crawl/start \
  -H "Content-Type: application/json" \
  -d '{"resume": true, "reset": false}'
```

**Option B — worker process:**
```bash
python -m app.workers.tasks
# With multiple workers:
python -m app.workers.tasks --worker-id 0 &
python -m app.workers.tasks --worker-id 1 &
python -m app.workers.tasks --worker-id 2 &
```

### 6. With Docker

```bash
docker-compose up --scale worker=4
```

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | — | PostgreSQL async URL (`postgresql+asyncpg://...`) |
| `DATABASE_SYNC_URL` | — | Sync URL for Alembic (`postgresql+psycopg2://...`) |
| `REDIS_URL` | `redis://localhost:6379/1` | Redis connection |
| `EKA_CID` | — | Clinic ID for API |
| `EKA_DOCID` | — | Doctor ID for API |
| `EKA_COOKIES` | — | JSON array of cookie strings for rotation |
| `EKA_HEADERS` | `{}` | Extra request headers (JSON object) |
| `CRAWLER_CONCURRENCY` | `10` | Concurrent prefix workers |
| `CRAWLER_MAX_DEPTH` | `6` | Max prefix expansion depth |
| `CRAWLER_RETRY_MAX` | `4` | Max retries per request |
| `CRAWLER_API_LIMIT` | `8` | API result limit (expansion threshold) |

### Cookie Format

```bash
# Single cookie:
EKA_COOKIES='session=abc123; auth=token; _ga=GA1.1.xxx'

# Multiple (rotation pool):
EKA_COOKIES='["session=abc123; auth=aaa", "session=def456; auth=bbb"]'
```

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/health` | Service health check |
| `GET` | `/api/v1/stats` | Crawl progress and metrics |
| `GET` | `/api/v1/drugs` | Paginated drug list |
| `GET` | `/api/v1/search?q=para` | Search drugs by name |
| `GET` | `/api/v1/prefixes` | Crawl prefix progress |
| `POST` | `/api/v1/crawl/start` | Start/resume crawl |
| `POST` | `/api/v1/crawl/stop` | Stop crawl |
| `GET` | `/api/v1/export/csv` | Download CSV |
| `GET` | `/api/v1/export/json` | Download JSON |
| `GET` | `/api/v1/export/excel` | Download Excel |

---

## Running Tests

```bash
pytest app/tests/ -v
```

---

## Crash Recovery

The crawler is designed to survive crashes:

- **Redis queue** (`crawler:prefix_queue`) persists processed/pending prefixes
- **Redis set** (`crawler:processed_prefixes`) tracks what's done — never re-processed
- **PostgreSQL** `crawl_prefixes` table mirrors prefix state for full audit
- On restart: `resume=true` (default) — picks up exactly where it left off
- Prefixes with `status=failed` and `attempts < 3` are automatically re-queued

---

## Monitoring

The `/api/v1/stats` endpoint returns:

```json
{
  "running": true,
  "queue_size": 1420,
  "live": {
    "processed_prefixes": "2140",
    "requests_sent": "3600",
    "new_drugs": "48250",
    "rpm": "42.0"
  },
  "db": {
    "total_drugs": 48250,
    "total_prefixes": 3560,
    "done_prefixes": 2140,
    "requests_per_minute": 42.0
  }
}
```
