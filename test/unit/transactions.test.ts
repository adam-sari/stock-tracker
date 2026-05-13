import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { closeDb, getDb } from '@/lib/db/connection';
import { applySchema } from '@/lib/db/migrate';
import { createTransaction, listTransactions, deleteTransaction } from '@/lib/db/queries/transactions';

const TEST_DB_DIR = path.join(process.cwd(), '.vitest-cache', 'txn-test');
const TEST_DB_PATH = path.join(TEST_DB_DIR, 'test.db');

describe('transactions queries', () => {
  beforeEach(() => {
    closeDb();
    if (existsSync(TEST_DB_DIR)) rmSync(TEST_DB_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DB_DIR, { recursive: true });
    process.env.DB_PATH = TEST_DB_PATH;
    applySchema(getDb());
  });

  afterAll(() => {
    closeDb();
    rmSync(TEST_DB_DIR, { recursive: true, force: true });
  });

  it('creates and lists transactions', () => {
    const t1 = createTransaction({ ticker: 'AAPL', kind: 'buy', qty: 10, price: 150, executed_at: '2026-01-15T14:30:00Z' });
    const t2 = createTransaction({ ticker: 'NVDA', kind: 'buy', qty: 5, price: 400, executed_at: '2026-02-01T14:30:00Z' });

    expect(t1.id).toBeGreaterThan(0);
    expect(t2.id).toBeGreaterThan(t1.id);

    const list = listTransactions();
    expect(list.length).toBe(2);
    expect(list[0].ticker).toBe('NVDA');
    expect(list[1].ticker).toBe('AAPL');
  });

  it('filters listTransactions by ticker', () => {
    createTransaction({ ticker: 'AAPL', kind: 'buy', qty: 10, price: 150, executed_at: '2026-01-15T14:30:00Z' });
    createTransaction({ ticker: 'NVDA', kind: 'buy', qty: 5, price: 400, executed_at: '2026-02-01T14:30:00Z' });

    const list = listTransactions({ ticker: 'AAPL' });
    expect(list.length).toBe(1);
    expect(list[0].ticker).toBe('AAPL');
  });

  it('deletes a transaction by id', () => {
    const t = createTransaction({ ticker: 'AAPL', kind: 'buy', qty: 10, price: 150, executed_at: '2026-01-15T14:30:00Z' });
    const ok = deleteTransaction(t.id);
    expect(ok).toBe(true);
    expect(listTransactions().length).toBe(0);
  });

  it('uppercases ticker on insert', () => {
    const t = createTransaction({ ticker: 'aapl', kind: 'buy', qty: 10, price: 150, executed_at: '2026-01-15T14:30:00Z' });
    expect(t.ticker).toBe('AAPL');
  });

  it('rejects qty <= 0 via DB check', () => {
    expect(() =>
      createTransaction({ ticker: 'AAPL', kind: 'buy', qty: 0, price: 150, executed_at: '2026-01-15T14:30:00Z' })
    ).toThrow();
  });
});
