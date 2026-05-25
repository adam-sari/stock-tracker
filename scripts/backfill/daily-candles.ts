import { getDb } from '@/lib/db/connection';
import { applySchema } from '@/lib/db/migrate';
import { backfillDailyCandles, type BarFetcher, type BarFetcherInput, type BarFetcherOutput } from '@/lib/backfill/daily-candles';

const ALPACA_DATA_URL = process.env.ALPACA_DATA_BASE_URL ?? 'https://data.alpaca.markets';
const KEY_ID = process.env.ALPACA_KEY_ID;
const SECRET = process.env.ALPACA_SECRET_KEY;

function arg(flag: string, def?: string): string {
  const i = process.argv.indexOf(flag);
  if (i === -1) { if (def !== undefined) return def; console.error(`Missing ${flag}`); process.exit(2); }
  return process.argv[i + 1];
}

const alpacaFetcher: BarFetcher = async (input: BarFetcherInput): Promise<BarFetcherOutput> => {
  if (!KEY_ID || !SECRET) throw new Error('ALPACA_KEY_ID/ALPACA_SECRET_KEY must be set');
  const params = new URLSearchParams({
    symbols: input.symbols.join(','),
    timeframe: '1Day',
    start: input.start,
    end: input.end,
    limit: '10000',
    adjustment: 'all',
  });
  if (input.pageToken) params.set('page_token', input.pageToken);
  const url = `${ALPACA_DATA_URL}/v2/stocks/bars?${params.toString()}`;
  const r = await fetch(url, { headers: { 'APCA-API-KEY-ID': KEY_ID, 'APCA-API-SECRET-KEY': SECRET } });
  if (!r.ok) throw new Error(`Alpaca HTTP ${r.status}: ${await r.text()}`);
  const data = await r.json() as { bars: Record<string, any[]>; next_page_token: string | null };
  return { bars: data.bars ?? {}, next_page_token: data.next_page_token ?? null };
};

async function main() {
  const fromDate = arg('--from');
  const toDate = arg('--to');
  const tickersArg = arg('--tickers', '');
  let tickers: string[];
  if (tickersArg) {
    tickers = tickersArg.split(',').map(t => t.trim().toUpperCase()).filter(Boolean);
  } else {
    const db = getDb(); applySchema(db);
    const rows = db.prepare(`SELECT ticker FROM sp500_membership WHERE to_date IS NULL`).all() as Array<{ ticker: string }>;
    tickers = rows.map(r => r.ticker.toUpperCase());
    if (tickers.length === 0) {
      console.error('No tickers in sp500_membership. Run scripts/backfill/sp500-membership.ts first or pass --tickers.');
      process.exit(1);
    }
  }

  const db = getDb(); applySchema(db);
  console.log(`Backfilling ${tickers.length} tickers from ${fromDate} to ${toDate}…`);

  const BATCH = 50;
  let total = 0;
  for (let i = 0; i < tickers.length; i += BATCH) {
    const batch = tickers.slice(i, i + BATCH);
    process.stdout.write(`  batch ${1 + i / BATCH}/${Math.ceil(tickers.length / BATCH)} (${batch.length} tickers)... `);
    const n = await backfillDailyCandles(batch, fromDate, toDate, alpacaFetcher);
    total += n;
    console.log(`${n} bars`);
  }
  console.log(`Done. ${total} bars upserted.`);
}

main().catch(e => { console.error(e); process.exit(1); });
