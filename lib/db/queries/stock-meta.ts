import { getDb } from '../connection';

export type StockMetaRow = {
  ticker: string;
  name: string;
  description?: string;
  industry?: string;
  sector?: string;
  country?: string;
  exchange?: string;
  market_cap?: number;
  ipo_date?: string;
  weburl?: string;
  logo_url?: string;
  ceo?: string;
  employees?: number;
  shares_outstanding?: number;
};

export function upsertStockMeta(row: StockMetaRow) {
  const db = getDb();
  db.prepare(`
    INSERT INTO stock_meta (ticker, name, description, industry, sector, country, exchange, market_cap, ipo_date, weburl, logo_url, ceo, employees, shares_outstanding, refreshed_at)
    VALUES (@ticker, @name, @description, @industry, @sector, @country, @exchange, @market_cap, @ipo_date, @weburl, @logo_url, @ceo, @employees, @shares_outstanding, @refreshed_at)
    ON CONFLICT (ticker) DO UPDATE SET
      name = excluded.name,
      description = COALESCE(excluded.description, stock_meta.description),
      industry = COALESCE(excluded.industry, stock_meta.industry),
      sector = COALESCE(excluded.sector, stock_meta.sector),
      country = COALESCE(excluded.country, stock_meta.country),
      exchange = COALESCE(excluded.exchange, stock_meta.exchange),
      market_cap = COALESCE(excluded.market_cap, stock_meta.market_cap),
      ipo_date = COALESCE(excluded.ipo_date, stock_meta.ipo_date),
      weburl = COALESCE(excluded.weburl, stock_meta.weburl),
      logo_url = COALESCE(excluded.logo_url, stock_meta.logo_url),
      ceo = COALESCE(excluded.ceo, stock_meta.ceo),
      employees = COALESCE(excluded.employees, stock_meta.employees),
      shares_outstanding = COALESCE(excluded.shares_outstanding, stock_meta.shares_outstanding),
      refreshed_at = excluded.refreshed_at
  `).run({
    ticker: row.ticker.toUpperCase(),
    name: row.name,
    description: row.description ?? null,
    industry: row.industry ?? null,
    sector: row.sector ?? null,
    country: row.country ?? null,
    exchange: row.exchange ?? null,
    market_cap: row.market_cap ?? null,
    ipo_date: row.ipo_date ?? null,
    weburl: row.weburl ?? null,
    logo_url: row.logo_url ?? null,
    ceo: row.ceo ?? null,
    employees: row.employees ?? null,
    shares_outstanding: row.shares_outstanding ?? null,
    refreshed_at: Math.floor(Date.now() / 1000),
  });
}

export function getStockMeta(ticker: string): StockMetaRow | null {
  const db = getDb();
  return (db.prepare(`SELECT * FROM stock_meta WHERE ticker = ?`).get(ticker.toUpperCase()) as StockMetaRow | undefined) ?? null;
}
