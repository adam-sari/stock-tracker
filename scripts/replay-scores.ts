import { getDb } from '@/lib/db/connection';
import { applySchema } from '@/lib/db/migrate';
import { replayAllSignals } from '@/lib/backtest/replay';
import type { SignalKind } from '@/lib/computations/discovery';

function arg(flag: string, defaultVal?: string): string {
  const i = process.argv.indexOf(flag);
  if (i === -1) {
    if (defaultVal !== undefined) return defaultVal;
    console.error(`Missing required arg: ${flag}`); process.exit(2);
  }
  return process.argv[i + 1];
}

async function main() {
  const fromDate = arg('--from');
  const toDate = arg('--to');
  const signalsArg = arg('--signals', '');
  const signals = signalsArg ? (signalsArg.split(',') as SignalKind[]) : undefined;

  const db = getDb();
  applySchema(db);

  console.log(`Replaying scores ${fromDate}..${toDate}` +
    (signals ? ` (signals: ${signals.join(',')})` : ' (all signals)'));
  const t0 = Date.now();
  const result = await replayAllSignals(db, { fromDate, toDate, signals });
  const secs = ((Date.now() - t0) / 1000).toFixed(1);

  console.log(`\nRun ${result.runId} complete in ${secs}s`);
  console.log(`  Total scores written: ${result.scoresWritten}`);
  for (const [sig, n] of Object.entries(result.perSignal)) {
    console.log(`    ${sig.padEnd(10)} ${n}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
