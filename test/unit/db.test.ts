import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { getDb, closeDb } from '@/lib/db/connection';
import { applySchema } from '@/lib/db/migrate';

const TEST_DB_DIR = path.join(process.cwd(), '.vitest-cache', 'db-test');
const TEST_DB_PATH = path.join(TEST_DB_DIR, 'test.db');

describe('db connection + migrate', () => {
  beforeAll(() => {
    if (existsSync(TEST_DB_DIR)) rmSync(TEST_DB_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DB_DIR, { recursive: true });
  });

  afterAll(() => {
    closeDb();
    rmSync(TEST_DB_DIR, { recursive: true, force: true });
  });

  it('applies the schema and reports the latest version', () => {
    process.env.DB_PATH = TEST_DB_PATH;
    const db = getDb();
    applySchema(db);
    const row = db.prepare('SELECT MAX(version) AS version FROM schema_version').get() as { version: number };
    expect(row.version).toBe(8);
  });

  it('enables WAL mode', () => {
    const db = getDb();
    const row = db.prepare('PRAGMA journal_mode').get() as { journal_mode: string };
    expect(row.journal_mode.toLowerCase()).toBe('wal');
  });

  it('enforces transactions.kind check constraint', () => {
    const db = getDb();
    expect(() =>
      db.prepare(`INSERT INTO transactions (ticker, kind, qty, price, executed_at) VALUES ('AAPL', 'invalid', 1, 1, '2026-01-01T00:00:00Z')`).run()
    ).toThrow();
  });
});
