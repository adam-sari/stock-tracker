import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { TickerContext, Mode } from './types';

export function hashContext(ctx: TickerContext): string {
  // Exclude `built_at` so identical underlying signals hash identically across calls.
  // Without this the 24h cache TTL never hits because every call gets a fresh timestamp.
  const { built_at: _ignored, ...stable } = ctx;
  return createHash('sha256').update(JSON.stringify(stable)).digest('hex');
}

const NINETY_DAYS = 90 * 86400;
const VOLUME_SPIKE_RATIO = 2.0;

export function buildTickerContext(ticker: string, db: Database.Database, _mode: Mode): TickerContext {
  const t = ticker.toUpperCase();
  const now = Math.floor(Date.now() / 1000);
  const since = now - NINETY_DAYS;

  const metaRow = db.prepare(`SELECT name, sector, industry, market_cap, description, ceo, employees, ipo_date
    FROM stock_meta WHERE ticker = ?`).get(t) as any;
  const meta: TickerContext['meta'] = metaRow
    ? { name: metaRow.name, sector: metaRow.sector, industry: metaRow.industry,
        market_cap: metaRow.market_cap, description: metaRow.description, ceo: metaRow.ceo,
        employees: metaRow.employees, ipo_date: metaRow.ipo_date, cite: `stock_meta:${t}` }
    : null;

  const insiderRows = db.prepare(`SELECT id, insider_name, shares, filed_at
    FROM insider_txns WHERE ticker = ? AND filed_at >= ? AND code = 'P' AND is_derivative = 0
    ORDER BY filed_at DESC`).all(t, since) as Array<any>;
  const insiderByDay = new Map<string, { ids: string[]; names: Set<string>; totalShares: number; date: string }>();
  for (const r of insiderRows) {
    const day = new Date(Number(r.filed_at) * 1000).toISOString().slice(0,10);
    const e = insiderByDay.get(day) ?? { ids: [], names: new Set(), totalShares: 0, date: day };
    e.ids.push(r.id);
    e.names.add(r.insider_name);
    e.totalShares += Number(r.shares);
    insiderByDay.set(day, e);
  }
  const insider = Array.from(insiderByDay.values()).map(e => ({
    filed_at: e.date,
    primary_id: e.ids[0],
    insiders: Array.from(e.names),
    total_shares: e.totalShares,
    cite: `insider_txns:${e.ids[0]}`,
  }));

  const congRows = db.prepare(`SELECT id, member, kind, txn_date, amount_low, amount_high, disclosed_at
    FROM congress_trades WHERE ticker = ? AND disclosed_at >= ?
    ORDER BY disclosed_at DESC LIMIT 50`).all(t, since) as Array<any>;
  const congress = congRows.map(r => ({
    disclosed_at: new Date(Number(r.disclosed_at) * 1000).toISOString().slice(0,10),
    primary_id: r.id, member: r.member, kind: r.kind,
    amount_low: r.amount_low, amount_high: r.amount_high,
    cite: `congress_trades:${r.id}`,
  }));

  const latestPeriod = (db.prepare(`SELECT MAX(period_end) AS p FROM fund_holdings WHERE ticker = ?`).get(t) as any)?.p;
  const fundsLatest = !latestPeriod ? [] : (db.prepare(`SELECT cik, shares, delta_shares, period_end, filing_accession
    FROM fund_holdings WHERE ticker = ? AND period_end = ?`).all(t, latestPeriod) as Array<any>).map(r => ({
      cik: r.cik, period_end: r.period_end, shares: Number(r.shares),
      delta_shares: r.delta_shares !== null ? Number(r.delta_shares) : null,
      cite: `fund_holdings:${r.filing_accession}|${t}`,
    }));

  const candleRows = db.prepare(`SELECT date, open, close, volume FROM candles_daily
    WHERE ticker = ? ORDER BY date DESC LIMIT 260`).all(t) as Array<any>;
  let priceSummary: TickerContext['price_summary'] = null;
  const volumeSpikes: TickerContext['signals_last_90d']['volume_spikes'] = [];
  if (candleRows.length > 0) {
    const sorted = [...candleRows].reverse();
    const closes = sorted.map(c => Number(c.close));
    const dates = sorted.map(c => c.date as string);
    const high = Math.max(...closes);
    const low = Math.min(...closes);
    const highIdx = closes.indexOf(high);
    const lowIdx = closes.indexOf(low);
    const latestClose = closes[closes.length - 1];
    const latestDate = dates[dates.length - 1];
    const ret = (back: number): number | null => {
      const i = closes.length - 1 - back;
      if (i < 0) return null;
      return (latestClose / closes[i]) - 1;
    };
    priceSummary = {
      latest_close: latestClose, latest_date: latestDate,
      high_1y: { value: high, date: dates[highIdx] },
      low_1y: { value: low, date: dates[lowIdx] },
      drawdown_from_high_pct: ((latestClose - high) / high) * 100,
      returns: { '1d': ret(1), '5d': ret(5), '21d': ret(21), '63d': ret(63), '252d': ret(252) },
      cite: `candles_daily:${t}|${latestDate}`,
    };
    const cutoffMs = (now - NINETY_DAYS) * 1000;
    for (let i = 30; i < sorted.length; i++) {
      const baseline = sorted.slice(i - 30, i).reduce((s, c) => s + Number(c.volume), 0) / 30;
      if (baseline <= 0) continue;
      const ratio = Number(sorted[i].volume) / baseline;
      if (ratio < VOLUME_SPIKE_RATIO) continue;
      const d = sorted[i].date as string;
      if (new Date(d).getTime() < cutoffMs) continue;
      volumeSpikes.push({
        date: d, close: Number(sorted[i].close), volume: Number(sorted[i].volume),
        volume_ratio: ratio, cite: `candles_daily:${t}|${d}`,
      });
    }
  }

  const haltRows = db.prepare(`SELECT id, halt_date, reason_code FROM trading_halts
    WHERE ticker = ? AND fetched_at >= ? ORDER BY halt_date DESC`).all(t, since) as Array<any>;
  const halts = haltRows.map(r => ({
    date: r.halt_date, reason_code: r.reason_code, cite: `trading_halts:${r.id}`,
  }));

  const newsRows = db.prepare(`SELECT id, source, headline, url, published_at FROM news
    WHERE ticker = ? AND published_at >= ? ORDER BY published_at DESC LIMIT 25`).all(t, since) as Array<any>;
  const news = newsRows.map(r => ({
    id: r.id, source: r.source, headline: r.headline, url: r.url,
    published_at: new Date(Number(r.published_at) * 1000).toISOString().slice(0,10),
    cite: `news:${r.id}`,
  }));

  const btRow = db.prepare(`SELECT date, score FROM backtest_scores WHERE ticker = ?
    ORDER BY date DESC LIMIT 1`).get(t) as any;
  const btAvg = db.prepare(`SELECT AVG(score) AS s FROM backtest_scores WHERE ticker = ?
    AND date >= date('now','-30 day')`).get(t) as any;
  const btFiring = !btRow ? [] : (db.prepare(`SELECT DISTINCT signal_kind FROM backtest_scores WHERE ticker = ?
    AND date = ? AND score > 0`).all(t, btRow.date) as Array<{ signal_kind: string }>);
  const backtest = !btRow ? null : {
    latest_score: Number(btRow.score),
    signals_firing: btFiring.map(r => r.signal_kind),
    score_30d_avg: Number(btAvg?.s ?? 0),
    cite: `backtest_scores:${btRow.date}|${t}|composite`,
  };

  return {
    ticker: t, built_at: new Date(now * 1000).toISOString(),
    meta,
    signals_last_90d: { insider, congress, funds_latest_quarter: fundsLatest,
                         volume_spikes: volumeSpikes, halts },
    price_summary: priceSummary,
    news_last_90d: news,
    backtest_summary: backtest,
  };
}
