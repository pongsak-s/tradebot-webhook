# Codex Prompt v1 — Trade Webhook System (Production-minded)

You are generating a production-ready monorepo for a TradingView→Binance Futures trading system.
Keep it simple, durable, low-maintenance.

## Repo layout (already created)
- apps/webhook  : TradingView webhook receiver + validation + persistence + history API
- apps/executor : trade execution via Binance Futures API + portfolio mgmt + per-project P&L
- apps/ui       : mobile-friendly web UI dashboard (simple config + read-only views)
- packages/shared : shared types (signal schema, enums), utils, logger
- infra         : docker-compose (local + prod), caddy reverse proxy config

## Architecture constraints
- Two main components run on the SAME server.
- Must be easy to test locally with docker compose.
- Must keep history in a database.
- Must track profit/loss per "project" (projectId in signals).
- Must support SL/TP in the signal payload.
- Provide idempotency (avoid double execution on duplicate signals).
- Provide basic observability: structured logs, health endpoints.

## Stack (choose and implement)
- Node.js + TypeScript
- Fastify (HTTP server)
- PostgreSQL
- Prisma ORM
- Docker Compose for local/prod
- Caddy for reverse proxy / TLS (later deploy)
- No heavy message brokers; if async needed, implement in-process job queue first.

## Component 1: Webhook Receiver (apps/webhook)
Endpoints:
- POST /v1/webhook/tradingview
  - Accept JSON payload (see Signal Schema below)
  - Verify authentication using `X-Webhook-Secret` header equals env WEBHOOK_SECRET
  - Validate payload schema (zod or equivalent)
  - Persist raw request, normalized signal, and validation results to DB
  - Return 200 with {received:true, signalId, deduped:boolean}
- GET /v1/history/signals?projectId=&limit=&offset=
  - Returns list of stored signals with statuses
- GET /healthz
- GET /readyz

Also provide:
- A replay command/script to POST sample payloads to local endpoint for testing.

## Component 2: Trade Executor (apps/executor)
Responsibilities:
- Poll or subscribe to DB for new validated signals (simple polling loop is OK initially).
- Execute trades on Binance Futures (USDT-M) via official Binance API client.
- Enforce risk rules:
  - Max position size per project (env or DB config)
  - Max number of open positions per symbol
  - Reject if margin/risk constraints violated
- Support order types:
  - Market entry (default)
  - Stop-loss and take-profit attached (or separate reduce-only orders)
- Track lifecycle:
  - signal -> order(s) -> fills -> position -> close
- Persist all executions & state transitions in DB
- Expose endpoints:
  - GET /v1/projects (list + P&L summary)
  - GET /v1/projects/:projectId/pnl (time series, realized/unrealized if possible)
  - GET /healthz
  - GET /readyz

Executor mode:
- Support DRY_RUN=true to simulate trades without calling Binance.

## UI (apps/ui)
- Minimal, mobile-friendly pages:
  - Dashboard: overall P&L by project
  - Project detail: recent signals + orders + P&L
  - Config: simple env-like config viewer (read-only ok)
- Use a simple framework (e.g., Next.js) OR plain Vite + React. Choose the simplest.

## Shared types (packages/shared)
- Signal schema types, order status enums, project identifiers, validation errors, etc.

## DB schema (Prisma)
Must include at least:
- projects
- signals (raw + normalized + status)
- executions (orders, fills, state transitions)
- positions (optional but preferred)
- pnl snapshots (optional but preferred)

## Signal Schema (TradingView → Webhook)
Example payload:
{
  "projectId": "wukong-alpha",
  "strategy": "breakout-v1",
  "symbol": "BTCUSDT",
  "side": "BUY",
  "qtyType": "USDT",
  "qty": 50,
  "leverage": 5,
  "entry": { "type": "MARKET" },
  "sl": { "type": "PRICE", "price": 48000 },
  "tp": { "type": "PRICE", "price": 52000 },
  "time": "2026-02-22T14:00:00Z",
  "signalId": "tv-{{timenow}}-{{strategy.order.id}}"
}

Rules:
- signalId required for idempotency
- side: BUY/SELL
- Must allow SL/TP either as price or percent in future
- Validate numeric ranges and required fields.

## Deliverables
Generate:
1) Working code for webhook, executor, ui, shared packages
2) docker-compose.yml for local dev (Postgres + services)
3) .env.example files for each app
4) README with setup, run, test, and example TradingView alert JSON/body and header
5) Minimal tests (at least schema validation + idempotency path)
