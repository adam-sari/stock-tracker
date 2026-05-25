import { getDb } from '@/lib/db/connection';
import { applySchema } from '@/lib/db/migrate';
import { parseSp500Pages, type MembershipRow } from '@/lib/backfill/sp500-membership';

const WIKI_URL = 'https://en.wikipedia.org/wiki/List_of_S%26P_500_companies';

async function fetchPage(): Promise<string> {
  const r = await fetch(WIKI_URL, { headers: { 'User-Agent': 'stock-tracker backfill/1.0' } });
  if (!r.ok) throw new Error(`Wikipedia fetch failed: HTTP ${r.status}`);
  return r.text();
}

function upsertMembership(rows: MembershipRow[]): number {
  const db = getDb();
  const stmt = db.prepare(
    `INSERT INTO sp500_membership (ticker, from_date, to_date) VALUES (?, ?, ?)
     ON CONFLICT(ticker, from_date) DO UPDATE SET to_date = excluded.to_date`
  );
  let n = 0;
  const tx = db.transaction(() => { for (const r of rows) { stmt.run(r.ticker, r.from_date, r.to_date); n++; } });
  tx();
  return n;
}

async function main() {
  const db = getDb();
  applySchema(db);
  console.log('Fetching Wikipedia S&P 500 page…');
  const html = await fetchPage();
  // The Wikipedia page has both tables (constituents + changes); pass the same HTML
  // twice so each extractor finds its own table by id.
  const rows = parseSp500Pages(html, html);
  const n = upsertMembership(rows);
  console.log(`Upserted ${n} membership rows (${rows.filter(r => !r.to_date).length} current, ${rows.filter(r => r.to_date).length} historical).`);
}

main().catch(e => { console.error(e); process.exit(1); });
