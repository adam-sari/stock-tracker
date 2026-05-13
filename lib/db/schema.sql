-- Stock Tracker schema — Foundation (Plan 1)
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  applied_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('buy', 'sell')),
  qty REAL NOT NULL CHECK (qty > 0),
  price REAL NOT NULL CHECK (price >= 0),
  fees REAL NOT NULL DEFAULT 0 CHECK (fees >= 0),
  executed_at TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_transactions_ticker_executed
  ON transactions (ticker, executed_at);

CREATE TABLE IF NOT EXISTS watchlist (
  ticker TEXT PRIMARY KEY,
  added_at INTEGER NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'discovery')),
  note TEXT
);

CREATE TABLE IF NOT EXISTS tags (
  ticker TEXT NOT NULL,
  tag TEXT NOT NULL,
  added_at INTEGER NOT NULL,
  PRIMARY KEY (ticker, tag)
);

CREATE INDEX IF NOT EXISTS ix_tags_tag ON tags (tag);

CREATE TABLE IF NOT EXISTS candles_1m (
  ticker TEXT NOT NULL,
  ts INTEGER NOT NULL,
  open REAL NOT NULL,
  high REAL NOT NULL,
  low REAL NOT NULL,
  close REAL NOT NULL,
  volume REAL NOT NULL,
  session TEXT NOT NULL CHECK (session IN ('regular', 'pre', 'post')),
  source TEXT NOT NULL,
  PRIMARY KEY (ticker, ts)
);

CREATE TABLE IF NOT EXISTS candles_daily (
  ticker TEXT NOT NULL,
  date TEXT NOT NULL,
  open REAL NOT NULL,
  high REAL NOT NULL,
  low REAL NOT NULL,
  close REAL NOT NULL,
  volume REAL NOT NULL,
  source TEXT NOT NULL,
  PRIMARY KEY (ticker, date)
);

CREATE TABLE IF NOT EXISTS quotes_latest (
  ticker TEXT PRIMARY KEY,
  price REAL NOT NULL,
  bid REAL,
  ask REAL,
  bid_size INTEGER,
  ask_size INTEGER,
  session TEXT NOT NULL,
  ts INTEGER NOT NULL,
  source TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stock_meta (
  ticker TEXT PRIMARY KEY,
  name TEXT,
  description TEXT,
  industry TEXT,
  sector TEXT,
  country TEXT,
  exchange TEXT,
  market_cap REAL,
  ipo_date TEXT,
  weburl TEXT,
  logo_url TEXT,
  ceo TEXT,
  employees INTEGER,
  shares_outstanding REAL,
  former_tickers TEXT,
  refreshed_at INTEGER
);

CREATE TABLE IF NOT EXISTS data_provider_health (
  provider TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('ok', 'degraded', 'down', 'unknown')),
  last_success INTEGER,
  last_error INTEGER,
  last_error_msg TEXT,
  consecutive_failures INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS job_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  status TEXT NOT NULL CHECK (status IN ('running', 'ok', 'error', 'partial')),
  detail TEXT
);

CREATE INDEX IF NOT EXISTS ix_job_runs_job_started ON job_runs (job, started_at DESC);

INSERT OR IGNORE INTO schema_version (version) VALUES (1);
