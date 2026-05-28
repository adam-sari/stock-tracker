#!/usr/bin/env tsx
import { applySchema } from '@/lib/db/migrate';
import { getDb, closeDb } from '@/lib/db/connection';
import { computeRealizedReturns, DEFAULT_HORIZONS } from '@/lib/jobs/compute-realized-returns';

async function main() {
  applySchema();
  const t0 = Date.now();
  const result = computeRealizedReturns(getDb(), [...DEFAULT_HORIZONS]);
  console.log(
    `computed=${result.computed} refilled=${result.refilled} pending=${result.pending} ` +
    `no_entry=${result.no_entry} delisted=${result.delisted} ms=${Date.now() - t0}`
  );
  closeDb();
}
main().catch(e => { console.error(e); process.exit(1); });
