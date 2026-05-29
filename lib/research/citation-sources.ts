import type Database from 'better-sqlite3';

export type ResolvedCitation = {
  summary: string;
  deepLink: string;
};

function notFound(table: string, id: string): ResolvedCitation {
  return { summary: `Source not found (${table}:${id})`, deepLink: '#' };
}

function unknown(table: string, id: string): ResolvedCitation {
  return { summary: `Unknown source: ${table}:${id}`, deepLink: '#' };
}

export function resolveCitationSource(
  db: Database.Database, table: string, id: string,
): ResolvedCitation {
  switch (table) {
    case 'insider_txns': {
      const r = db.prepare(`SELECT ticker, insider_name, insider_role, shares, price, txn_date
        FROM insider_txns WHERE id = ?`).get(id) as any;
      if (!r) return notFound(table, id);
      const role = r.insider_role ? ` (${r.insider_role})` : '';
      const price = r.price ? ` at $${Number(r.price).toFixed(2)}` : '';
      return {
        summary: `${r.insider_name}${role} bought ${Number(r.shares)} sh${price} on ${r.txn_date}`,
        deepLink: `/stock/${r.ticker}?tab=insiders&highlight=${encodeURIComponent(id)}`,
      };
    }
    case 'fund_holdings': {
      const [acc, ticker] = id.split('|');
      if (!acc || !ticker) return notFound(table, id);
      const r = db.prepare(`SELECT fh.shares, fh.period_end, f.name AS fund_name
        FROM fund_holdings fh JOIN funds f ON f.cik = fh.cik
        WHERE fh.filing_accession = ? AND fh.ticker = ?`).get(acc, ticker) as any;
      if (!r) return notFound(table, id);
      return {
        summary: `${r.fund_name} held ${Number(r.shares).toLocaleString()} sh as of ${r.period_end}`,
        deepLink: `/stock/${ticker}?tab=funds&accession=${encodeURIComponent(acc)}`,
      };
    }
    case 'congress_trades': {
      const r = db.prepare(`SELECT ticker, member, kind, txn_date, amount_low, amount_high
        FROM congress_trades WHERE id = ?`).get(id) as any;
      if (!r) return notFound(table, id);
      const range = (r.amount_low && r.amount_high)
        ? ` ($${r.amount_low.toLocaleString()}-$${r.amount_high.toLocaleString()})` : '';
      return {
        summary: `${r.member} ${r.kind}${range} on ${r.txn_date}`,
        deepLink: `/stock/${r.ticker}?tab=congress&highlight=${encodeURIComponent(id)}`,
      };
    }
    case 'candles_daily': {
      const [ticker, date] = id.split('|');
      if (!ticker || !date) return notFound(table, id);
      const r = db.prepare(`SELECT close, volume FROM candles_daily WHERE ticker = ? AND date = ?`).get(ticker, date) as any;
      if (!r) return notFound(table, id);
      const volM = (Number(r.volume) / 1e6).toFixed(2);
      return {
        summary: `Close $${Number(r.close).toFixed(2)}, vol ${volM}M on ${date}`,
        deepLink: `/stock/${ticker}?tab=activity&date=${encodeURIComponent(date)}`,
      };
    }
    case 'news': {
      const r = db.prepare(`SELECT source, headline, url, published_at FROM news WHERE id = ?`).get(id) as any;
      if (!r) return notFound(table, id);
      const d = new Date(Number(r.published_at) * 1000).toISOString().slice(0, 10);
      return {
        summary: `${r.source}: ${r.headline} (${d})`,
        deepLink: r.url || '#',
      };
    }
    case 'stock_meta': {
      const r = db.prepare(`SELECT name, sector, market_cap FROM stock_meta WHERE ticker = ?`).get(id) as any;
      if (!r) return notFound(table, id);
      const sector = r.sector ? ` — ${r.sector}` : '';
      const cap = r.market_cap ? `, $${(r.market_cap / 1e9).toFixed(1)}B market cap` : '';
      return {
        summary: `${r.name}${sector}${cap}`,
        deepLink: `/stock/${id}?tab=about`,
      };
    }
    case 'backtest_scores': {
      const [date, ticker, kind] = id.split('|');
      if (!date || !ticker || !kind) return notFound(table, id);
      const r = db.prepare(`SELECT score FROM backtest_scores
        WHERE date = ? AND ticker = ? AND signal_kind = ?`).get(date, ticker, kind) as any;
      if (!r) return notFound(table, id);
      return {
        summary: `${kind} score ${Number(r.score)} on ${date}`,
        deepLink: `/stock/${ticker}?tab=backtest`,
      };
    }
    case 'trading_halts': {
      const r = db.prepare(`SELECT ticker, halt_date, halt_time, reason_code FROM trading_halts WHERE id = ?`).get(id) as any;
      if (!r) return notFound(table, id);
      return {
        summary: `${r.reason_code ?? 'Halt'} at ${r.halt_time} on ${r.halt_date}`,
        deepLink: `/stock/${r.ticker}?tab=activity&date=${encodeURIComponent(r.halt_date)}`,
      };
    }
    case 'web_search': {
      return { summary: `Web search: ${id}`, deepLink: '#' };
    }
    default: return unknown(table, id);
  }
}
