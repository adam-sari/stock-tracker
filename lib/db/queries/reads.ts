import { getDb } from '../connection';
import type { NewsRow } from './news';
import type { InsiderTxnRow, InsiderSentimentMonthRow } from './insider';
import type { CongressTradeRow } from './congress';
import type { TradingHaltRow } from './halts';
import type { CorporateActionRow } from './corporate-actions';
import type { FdaCalendarRow } from './fda-calendar';
import type { DodContract } from './dod-contracts';
import type { ArkTradeRow } from './ark-trades';
import type { EdgarAlert } from './edgar-alerts';
import { latestHiringSnapshot, hiringTrend } from './hiring';
export type { HiringSnapshot, HiringTrend } from './hiring';

export function listNewsForTicker(ticker: string, limit = 50): NewsRow[] {
  return getDb().prepare(`SELECT * FROM news WHERE ticker = ? ORDER BY published_at DESC LIMIT ?`)
    .all(ticker.toUpperCase(), limit) as NewsRow[];
}

export function listInsidersForTicker(ticker: string, limit = 100): InsiderTxnRow[] {
  return getDb().prepare(`SELECT * FROM insider_txns WHERE ticker = ? ORDER BY txn_date DESC, filed_at DESC LIMIT ?`)
    .all(ticker.toUpperCase(), limit) as InsiderTxnRow[];
}

export function listInsiderSentimentForTicker(ticker: string, limit = 24): InsiderSentimentMonthRow[] {
  return getDb().prepare(`SELECT * FROM insider_sentiment_monthly WHERE ticker = ? ORDER BY year DESC, month DESC LIMIT ?`)
    .all(ticker.toUpperCase(), limit) as InsiderSentimentMonthRow[];
}

export type FundHoldingRow = {
  filing_accession: string;
  cik: string;
  fund_name?: string;
  ticker: string;
  shares: number;
  value_usd: number;
  period_end: string;
  filed_at: number;
  delta_shares: number | null;
  delta_pct: number | null;
};

export function listFundsForTicker(ticker: string, limit = 50): FundHoldingRow[] {
  return getDb().prepare(`
    SELECT fh.*, f.name AS fund_name FROM fund_holdings fh
    LEFT JOIN funds f ON f.cik = fh.cik
    WHERE fh.ticker = ?
    ORDER BY fh.period_end DESC, fh.value_usd DESC
    LIMIT ?
  `).all(ticker.toUpperCase(), limit) as FundHoldingRow[];
}

export function listCongressForTicker(ticker: string, limit = 100): CongressTradeRow[] {
  return getDb().prepare(`SELECT * FROM congress_trades WHERE ticker = ? ORDER BY txn_date DESC, disclosed_at DESC LIMIT ?`)
    .all(ticker.toUpperCase(), limit) as CongressTradeRow[];
}

export type SentimentSnapshotRow = {
  ticker: string;
  ts: number;
  source: string;
  rank: number | null;
  mentions: number;
  upvotes: number | null;
  mentions_24h_ago: number | null;
};

export function listSentimentForTicker(ticker: string, limit = 60): SentimentSnapshotRow[] {
  return getDb().prepare(`SELECT * FROM sentiment_snapshots WHERE ticker = ? ORDER BY ts DESC LIMIT ?`)
    .all(ticker.toUpperCase(), limit) as SentimentSnapshotRow[];
}

export function listHaltsForTicker(ticker: string, limit = 50): TradingHaltRow[] {
  return getDb().prepare(`SELECT * FROM trading_halts WHERE ticker = ? ORDER BY halt_date DESC, halt_time DESC LIMIT ?`)
    .all(ticker.toUpperCase(), limit) as TradingHaltRow[];
}

export type EarningsRow = {
  ticker: string;
  earnings_date: string;
  hour: string | null;
  eps_estimate: number | null;
  eps_actual: number | null;
  revenue_estimate: number | null;
  revenue_actual: number | null;
  quarter: number | null;
  fiscal_year: number | null;
  num_estimates: number | null;
  source: string;
};

export function listEarningsForTicker(ticker: string, limit = 12): EarningsRow[] {
  return getDb().prepare(`SELECT * FROM earnings_calendar WHERE ticker = ? ORDER BY earnings_date DESC LIMIT ?`)
    .all(ticker.toUpperCase(), limit) as EarningsRow[];
}

export type RecommendationRow = {
  ticker: string;
  period: string;
  strong_buy: number;
  buy: number;
  hold: number;
  sell: number;
  strong_sell: number;
};

export function listRecommendationsForTicker(ticker: string, limit = 12): RecommendationRow[] {
  return getDb().prepare(`SELECT * FROM analyst_recommendations WHERE ticker = ? ORDER BY period DESC LIMIT ?`)
    .all(ticker.toUpperCase(), limit) as RecommendationRow[];
}

export function listCorporateActionsForTicker(ticker: string, limit = 50): CorporateActionRow[] {
  return getDb().prepare(`SELECT * FROM corporate_actions WHERE ticker = ? ORDER BY ex_date DESC LIMIT ?`)
    .all(ticker.toUpperCase(), limit) as CorporateActionRow[];
}

export function latestFdaForTicker(ticker: string): FdaCalendarRow | null {
  const row = getDb()
    .prepare(`SELECT * FROM fda_calendar WHERE ticker = ? ORDER BY event_date ASC LIMIT 1`)
    .get(ticker.toUpperCase());
  return (row as FdaCalendarRow | undefined) ?? null;
}

export function latestDodForTicker(ticker: string): DodContract | null {
  const row = getDb()
    .prepare(`SELECT * FROM dod_contracts WHERE ticker = ? ORDER BY action_date DESC LIMIT 1`)
    .get(ticker.toUpperCase());
  return (row as DodContract | undefined) ?? null;
}

export function latestArkForTicker(ticker: string): ArkTradeRow | null {
  const row = getDb()
    .prepare(`SELECT * FROM ark_trades WHERE ticker = ? ORDER BY ts DESC LIMIT 1`)
    .get(ticker.toUpperCase());
  return (row as ArkTradeRow | undefined) ?? null;
}

export function latestEdgarAlertForTicker(ticker: string): EdgarAlert | null {
  const row = getDb()
    .prepare(`SELECT * FROM edgar_alerts WHERE ticker = ? ORDER BY filing_date DESC LIMIT 1`)
    .get(ticker.toUpperCase());
  return (row as EdgarAlert | undefined) ?? null;
}

/** Latest hiring snapshot for a ticker (pass-through for convenience). */
export function latestHiringForTicker(ticker: string) {
  return latestHiringSnapshot(ticker);
}

/** Hiring trend (latest vs ~7-day-prior open-job count). */
export function hiringTrendForTicker(ticker: string) {
  return hiringTrend(ticker);
}

export type WikiTrend = {
  recent7Avg: number;
  prior7Avg: number;
  deltaPct: number;
};

export function wikiPageviewsTrend(ticker: string): WikiTrend | null {
  const rows = getDb()
    .prepare(`SELECT views FROM wiki_pageviews WHERE ticker = ? ORDER BY date DESC LIMIT 14`)
    .all(ticker.toUpperCase()) as { views: number }[];
  if (rows.length < 7) return null;
  const recent = rows.slice(0, 7);
  const prior = rows.slice(7, 14);
  if (prior.length < 7) return null;
  const recent7Avg = recent.reduce((s, r) => s + r.views, 0) / 7;
  const prior7Avg = prior.reduce((s, r) => s + r.views, 0) / 7;
  const deltaPct = prior7Avg === 0 ? 0 : ((recent7Avg - prior7Avg) / prior7Avg) * 100;
  return { recent7Avg, prior7Avg, deltaPct };
}
