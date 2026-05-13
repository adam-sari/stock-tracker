# Stock Tracker

Personal local-only portfolio tracker for US equities. Real-time prices via Alpaca (free, IEX feed), historical via Yahoo. Designed to be extended with SEC EDGAR + news + sentiment ingestion in later phases.

See [`docs/superpowers/specs/2026-05-13-stock-tracker-design.md`](docs/superpowers/specs/2026-05-13-stock-tracker-design.md) for the design and [`docs/superpowers/plans/`](docs/superpowers/plans/) for implementation plans.

## Quickstart

```bash
# 1. Install
nvm use && npm install
cd sidecar && uv sync && cd ..

# 2. Configure
cp .env.local.example .env.local
# Fill in: ALPACA_KEY_ID, ALPACA_SECRET_KEY, FINNHUB_API_KEY, FMP_API_KEY
# Sources:
#   Alpaca:  https://alpaca.markets    → Paper Trading account → View API keys
#   Finnhub: https://finnhub.io        → Get free API key
#   FMP:     https://financialmodelingprep.com → Sign Up → Free tier

# 3. Initialize DB
npm run db:init

# 4. Start everything
npm run start:all
# Opens http://localhost:3000
```

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Next.js dev server only |
| `npm run start:all` | Next.js + Python sidecar |
| `npm test` | vitest unit tests |
| `npm run test:e2e` | Playwright end-to-end tests |
| `npm run typecheck` | strict TS check |
| `npm run db:init` | apply schema to `db/stocks.db` (idempotent) |
| `npm run probe` | live probe of provider endpoints |

## Architecture

Two processes, one SQLite file:
- **Next.js (Node)** — UI, API, background jobs, live data plane
- **Python sidecar** — SEC EDGAR ingestion via `edgartools` (active in Plan 2)
- **SQLite (WAL mode)** — shared state, single source of truth

## License

Personal use; no public license.
