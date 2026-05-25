import { getDb } from '@/lib/db/connection';
import { applySchema } from '@/lib/db/migrate';
import { backfillCongressTrades } from '@/lib/backfill/congress';
import { FmpClient } from '@/lib/providers/fmp';
import { CapitolTradesClient } from '@/lib/providers/capitoltrades';

function arg(flag: string, def?: string): string {
  const i = process.argv.indexOf(flag);
  if (i === -1) { if (def !== undefined) return def; console.error(`Missing ${flag}`); process.exit(2); }
  return process.argv[i + 1];
}

async function main() {
  const fromDate = arg('--from');
  const toDate = arg('--to');
  const fmpKey = process.env.FMP_API_KEY;
  if (!fmpKey) { console.error('FMP_API_KEY env var required.'); process.exit(2); }

  const db = getDb(); applySchema(db);
  const fmp = new FmpClient({ apiKey: fmpKey });
  const ct = new CapitolTradesClient();
  console.log(`Backfilling congress trades ${fromDate}..${toDate}…`);
  const r = await backfillCongressTrades(fmp, ct, { fromDate, toDate });
  console.log(`Done. inserted=${r.inserted} senate=${r.senate} house=${r.house}${r.warnings.length ? ' warnings: ' + r.warnings.join(' ') : ''}`);
}

main().catch(e => { console.error(e); process.exit(1); });
