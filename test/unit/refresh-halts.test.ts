import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { closeDb, getDb } from '@/lib/db/connection';
import { applySchema } from '@/lib/db/migrate';
import { listRecentHalts } from '@/lib/db/queries/halts';
import { refreshHaltsOnce } from '@/lib/jobs/refresh-halts';
import { NasdaqHaltsClient } from '@/lib/providers/nasdaq-halts';

const TEST_DB_DIR = path.join(process.cwd(), '.vitest-cache', 'refresh-halts');
const TEST_DB_PATH = path.join(TEST_DB_DIR, 'test.db');

describe('refreshHaltsOnce', () => {
  beforeEach(() => {
    closeDb();
    if (existsSync(TEST_DB_DIR)) rmSync(TEST_DB_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DB_DIR, { recursive: true });
    process.env.DB_PATH = TEST_DB_PATH;
    applySchema(getDb());
  });
  afterAll(() => { closeDb(); rmSync(TEST_DB_DIR, { recursive: true, force: true }); });

  it('mirrors NASDAQ halts feed into trading_halts', async () => {
    const client = new NasdaqHaltsClient();
    vi.spyOn(client, 'getCurrentHalts').mockResolvedValue([
      { ticker: 'ASRT', issueName: 'Assertio', haltDate: '2026-05-13', haltTime: '07:55:00', reasonCode: 'LUDP', market: 'NASDAQ' },
      { ticker: 'FOO', issueName: 'Foo', haltDate: '2026-05-13', haltTime: '09:30:00', reasonCode: 'T1', market: 'NYSE' },
    ]);
    await refreshHaltsOnce(client);
    const halts = listRecentHalts(0);
    expect(halts.length).toBe(2);
    expect(halts.find(h => h.ticker === 'ASRT')!.reason_code).toBe('LUDP');
  });
});
