# Sidecar

Python process that handles SEC EDGAR ingestion (Form 4, 13F-HR) via `edgartools`.
Shares SQLite with the Next.js process — writes only.

## Run

```bash
cd sidecar
uv sync           # install deps
uv run python -m sidecar
```

In Plan 1 this exits cleanly after verifying the DB connection. Plan 2 wires actual jobs.
