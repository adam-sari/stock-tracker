#!/usr/bin/env tsx
/**
 * Live probe script — hits each provider with the current env keys and
 * prints a structured report. Intended for development; not used by the app.
 *
 * Run: npm run probe
 */
import { config } from 'dotenv';
import path from 'node:path';
import { AlpacaProvider } from '@/lib/providers/alpaca';
import { YahooProvider } from '@/lib/providers/yahoo';
import { StooqProvider } from '@/lib/providers/stooq';

config({ path: path.resolve(process.cwd(), '.env.local') });

function fmt(obj: unknown): string {
  return JSON.stringify(obj, null, 2).slice(0, 400);
}

async function probeProvider(name: string, p: { name: string; getLatestQuote: (t: string) => Promise<unknown>; health: () => Promise<unknown> }) {
  console.log(`\n=== ${name} ===`);
  try {
    const h = await p.health();
    console.log('  health:', fmt(h));
  } catch (e) {
    console.log('  health error:', (e as Error).message);
  }
  try {
    const q = await p.getLatestQuote('AAPL');
    console.log('  AAPL quote:', fmt(q));
  } catch (e) {
    console.log('  AAPL quote error:', (e as Error).message);
  }
}

async function main() {
  const { ALPACA_KEY_ID, ALPACA_SECRET_KEY, ALPACA_BASE_URL, ALPACA_DATA_BASE_URL } = process.env;
  if (!ALPACA_KEY_ID || !ALPACA_SECRET_KEY) {
    console.error('Missing Alpaca keys. Populate .env.local first.');
    process.exit(1);
  }
  await probeProvider('Alpaca', new AlpacaProvider({
    keyId: ALPACA_KEY_ID, secret: ALPACA_SECRET_KEY,
    baseUrl: ALPACA_BASE_URL, dataBaseUrl: ALPACA_DATA_BASE_URL,
  }));
  await probeProvider('Yahoo', new YahooProvider());
  await probeProvider('Stooq', new StooqProvider());
}

main().catch(e => { console.error(e); process.exit(1); });
