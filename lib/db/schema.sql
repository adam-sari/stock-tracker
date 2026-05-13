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

-- Plan 2 (data ingestion) — 2026-05-13

CREATE TABLE IF NOT EXISTS news (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  headline TEXT NOT NULL,
  url TEXT NOT NULL,
  source TEXT NOT NULL,
  published_at INTEGER NOT NULL,
  fetched_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_news_ticker_published ON news (ticker, published_at DESC);

CREATE TABLE IF NOT EXISTS insider_txns (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  insider_name TEXT NOT NULL,
  insider_role TEXT,
  code TEXT NOT NULL,
  is_derivative INTEGER NOT NULL DEFAULT 0,
  shares REAL NOT NULL,
  price REAL,
  value REAL,
  txn_date TEXT NOT NULL,
  filed_at INTEGER NOT NULL,
  filing_url TEXT,
  source TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_insider_txns_ticker_txn ON insider_txns (ticker, txn_date DESC);
CREATE INDEX IF NOT EXISTS ix_insider_txns_code_txn ON insider_txns (code, txn_date DESC);

CREATE TABLE IF NOT EXISTS insider_sentiment_monthly (
  ticker TEXT NOT NULL,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  net_change INTEGER NOT NULL,
  mspr REAL NOT NULL,
  PRIMARY KEY (ticker, year, month)
);

CREATE TABLE IF NOT EXISTS funds (
  cik TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  is_curated INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS fund_holdings (
  filing_accession TEXT NOT NULL,
  cik TEXT NOT NULL,
  ticker TEXT NOT NULL,
  shares REAL NOT NULL,
  value_usd REAL NOT NULL,
  period_end TEXT NOT NULL,
  filed_at INTEGER NOT NULL,
  delta_shares REAL,
  delta_pct REAL,
  PRIMARY KEY (filing_accession, ticker)
);
CREATE INDEX IF NOT EXISTS ix_fund_holdings_ticker_period ON fund_holdings (ticker, period_end DESC);
CREATE INDEX IF NOT EXISTS ix_fund_holdings_cik_period ON fund_holdings (cik, period_end DESC);

CREATE TABLE IF NOT EXISTS congress_trades (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  chamber TEXT NOT NULL CHECK (chamber IN ('house', 'senate')),
  member TEXT NOT NULL,
  district TEXT,
  party TEXT,
  kind TEXT NOT NULL,
  amount_low REAL,
  amount_high REAL,
  txn_date TEXT NOT NULL,
  disclosed_at INTEGER NOT NULL,
  ptr_url TEXT NOT NULL,
  source TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_congress_trades_ticker_txn ON congress_trades (ticker, txn_date DESC);
CREATE INDEX IF NOT EXISTS ix_congress_trades_member_txn ON congress_trades (member, txn_date DESC);

CREATE TABLE IF NOT EXISTS sentiment_snapshots (
  ticker TEXT NOT NULL,
  ts INTEGER NOT NULL,
  source TEXT NOT NULL,
  rank INTEGER,
  mentions INTEGER NOT NULL,
  upvotes INTEGER,
  mentions_24h_ago INTEGER,
  PRIMARY KEY (ticker, ts, source)
);
CREATE INDEX IF NOT EXISTS ix_sentiment_snapshots_ts ON sentiment_snapshots (ts DESC);

CREATE TABLE IF NOT EXISTS trading_halts (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  halt_date TEXT NOT NULL,
  halt_time TEXT NOT NULL,
  reason_code TEXT,
  market TEXT,
  resumed_at INTEGER,
  fetched_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_trading_halts_ticker_date ON trading_halts (ticker, halt_date DESC);

CREATE TABLE IF NOT EXISTS corporate_actions (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('split', 'dividend', 'spinoff', 'rename')),
  ex_date TEXT NOT NULL,
  payment_date TEXT,
  amount REAL,
  details_json TEXT,
  source TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_corporate_actions_ticker_ex ON corporate_actions (ticker, ex_date DESC);

CREATE TABLE IF NOT EXISTS earnings_calendar (
  ticker TEXT NOT NULL,
  earnings_date TEXT NOT NULL,
  hour TEXT,
  eps_estimate REAL,
  eps_actual REAL,
  revenue_estimate REAL,
  revenue_actual REAL,
  quarter INTEGER,
  fiscal_year INTEGER,
  num_estimates INTEGER,
  source TEXT NOT NULL,
  PRIMARY KEY (ticker, earnings_date)
);

CREATE TABLE IF NOT EXISTS analyst_recommendations (
  ticker TEXT NOT NULL,
  period TEXT NOT NULL,
  strong_buy INTEGER NOT NULL DEFAULT 0,
  buy INTEGER NOT NULL DEFAULT 0,
  hold INTEGER NOT NULL DEFAULT 0,
  sell INTEGER NOT NULL DEFAULT 0,
  strong_sell INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (ticker, period)
);

CREATE TABLE IF NOT EXISTS cusip_ticker_map (
  cusip TEXT PRIMARY KEY,
  ticker TEXT,
  name TEXT,
  resolved_at INTEGER NOT NULL,
  source TEXT NOT NULL
);

INSERT OR IGNORE INTO schema_version (version) VALUES (2);

-- Plan 4 (discovery feed) — 2026-05-14

CREATE TABLE IF NOT EXISTS discovery_scores (
  ticker TEXT PRIMARY KEY,
  score REAL NOT NULL,
  signals_json TEXT NOT NULL,
  computed_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_discovery_scores_score ON discovery_scores (score DESC);

INSERT OR IGNORE INTO schema_version (version) VALUES (4);

-- Plan 5 (Wikipedia pageviews) — 2026-05-14

CREATE TABLE IF NOT EXISTS wiki_pageviews (
  ticker TEXT NOT NULL,
  date TEXT NOT NULL,
  views INTEGER NOT NULL,
  PRIMARY KEY (ticker, date)
);
CREATE INDEX IF NOT EXISTS ix_wiki_pageviews_ticker_date ON wiki_pageviews (ticker, date DESC);

INSERT OR IGNORE INTO schema_version (version) VALUES (5);

-- Plan 6 (SEC EDGAR full-text alerts) — 2026-05-14

CREATE TABLE IF NOT EXISTS edgar_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker TEXT NOT NULL,
  phrase TEXT NOT NULL,
  filing_url TEXT NOT NULL,
  filing_date TEXT NOT NULL,
  snippet TEXT NOT NULL DEFAULT '',
  fetched_at INTEGER NOT NULL,
  UNIQUE (ticker, phrase, filing_url)
);
CREATE INDEX IF NOT EXISTS ix_edgar_alerts_ticker_date ON edgar_alerts (ticker, filing_date DESC);
CREATE INDEX IF NOT EXISTS ix_edgar_alerts_phrase ON edgar_alerts (phrase);

INSERT OR IGNORE INTO schema_version (version) VALUES (6);

-- Plan 7 (DOD contract awards via USAspending) — 2026-05-14

CREATE TABLE IF NOT EXISTS dod_contracts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker TEXT NOT NULL,
  recipient_name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  award_amount REAL NOT NULL DEFAULT 0,
  action_date TEXT NOT NULL,
  agency TEXT NOT NULL DEFAULT '',
  fetched_at INTEGER NOT NULL,
  UNIQUE (ticker, action_date, recipient_name, award_amount)
);
CREATE INDEX IF NOT EXISTS ix_dod_contracts_ticker_date ON dod_contracts (ticker, action_date DESC);

INSERT OR IGNORE INTO schema_version (version) VALUES (7);

-- Plan 8 (FDA committee calendar via Finnhub) — 2026-05-14

CREATE TABLE IF NOT EXISTS fda_calendar (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker TEXT NOT NULL,
  company_name TEXT NOT NULL DEFAULT '',
  committee TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  event_date TEXT NOT NULL,
  fetched_at INTEGER NOT NULL,
  UNIQUE (ticker, event_date, committee)
);
CREATE INDEX IF NOT EXISTS ix_fda_calendar_ticker_date ON fda_calendar (ticker, event_date DESC);
CREATE INDEX IF NOT EXISTS ix_fda_calendar_event_date ON fda_calendar (event_date);

INSERT OR IGNORE INTO schema_version (version) VALUES (8);
