export type Mode = 'standard' | 'deep';

export type CitationSourceTable =
  | 'insider_txns'
  | 'fund_holdings'
  | 'congress_trades'
  | 'candles_daily'
  | 'news'
  | 'stock_meta'
  | 'backtest_scores'
  | 'trading_halts';

export type Citation = {
  position: number;
  source_table: CitationSourceTable | string;
  source_id: string;
  source_summary: string;
  source_deep_link: string;
};

export type ResearchNote = {
  id: number;
  ticker: string;
  mode: Mode;
  generated_at: number;
  model_id: string;
  prompt_version: string;
  prompt_tokens: number;
  completion_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  cost_usd_micros: number;
  markdown: string;
  html: string;
  context_hash: string;
  status: 'ok' | 'error' | 'partial';
  error_message: string | null;
  citations: Citation[];
};

export type TickerContext = {
  ticker: string;
  built_at: string;
  meta: {
    name?: string; sector?: string; industry?: string; market_cap?: number;
    description?: string; ceo?: string; employees?: number; ipo_date?: string;
    cite: string;
  } | null;
  signals_last_90d: {
    insider: Array<{ filed_at: string; primary_id: string; insiders: string[];
                      total_shares: number; cite: string }>;
    congress: Array<{ disclosed_at: string; primary_id: string; member: string;
                       kind: string; amount_low: number | null; amount_high: number | null;
                       cite: string }>;
    funds_latest_quarter: Array<{ cik: string; period_end: string; shares: number;
                                    delta_shares: number | null; cite: string }>;
    volume_spikes: Array<{ date: string; close: number; volume: number;
                            volume_ratio: number; cite: string }>;
    halts: Array<{ date: string; reason_code: string | null; cite: string }>;
  };
  price_summary: {
    latest_close: number; latest_date: string;
    high_1y: { value: number; date: string };
    low_1y: { value: number; date: string };
    drawdown_from_high_pct: number;
    returns: { '1d': number | null; '5d': number | null; '21d': number | null;
                '63d': number | null; '252d': number | null };
    cite: string;
  } | null;
  news_last_90d: Array<{ id: string; source: string; headline: string;
                          published_at: string; url: string; cite: string }>;
  backtest_summary: {
    latest_score: number;
    signals_firing: string[];
    score_30d_avg: number;
    cite: string;
  } | null;
};
