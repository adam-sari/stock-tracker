import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { closeDb, getDb } from '@/lib/db/connection';
import { applySchema } from '@/lib/db/migrate';
import { createTransaction } from '@/lib/db/queries/transactions';
import { listHoldings } from '@/lib/db/queries/holdings';

const TEST_DB_DIR = path.join(process.cwd(), '.vitest-cache', 'holdings-test');
const TEST_DB_PATH = path.join(TEST_DB_DIR, 'test.db');

describe('listHoldings', () => {
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

  it('aggregates buys into a position with weighted-average cost', () => {
    createTransaction({ ticker: 'AAPL', kind: 'buy', qty: 10, price: 150, executed_at: '2026-01-01T14:30:00Z' });
    createTransaction({ ticker: 'AAPL', kind: 'buy', qty: 10, price: 200, executed_at: '2026-02-01T14:30:00Z' });

    const holdings = listHoldings();
    expect(holdings.length).toBe(1);
    expect(holdings[0].ticker).toBe('AAPL');
    expect(holdings[0].qty).toBe(20);
    expect(holdings[0].avg_cost).toBe(175);
  });

  it('subtracts sells, keeping avg cost based on remaining open lots (simple FIFO-by-quantity)', () => {
    createTransaction({ ticker: 'AAPL', kind: 'buy', qty: 10, price: 150, executed_at: '2026-01-01T14:30:00Z' });
    createTransaction({ ticker: 'AAPL', kind: 'buy', qty: 10, price: 200, executed_at: '2026-02-01T14:30:00Z' });
    createTransaction({ ticker: 'AAPL', kind: 'sell', qty: 5, price: 250, executed_at: '2026-03-01T14:30:00Z' });

    const holdings = listHoldings();
    expect(holdings.length).toBe(1);
    expect(holdings[0].qty).toBe(15);
    expect(holdings[0].avg_cost).toBeCloseTo(183.333, 2);
  });

  it('hides fully-closed positions (qty == 0)', () => {
    createTransaction({ ticker: 'AAPL', kind: 'buy', qty: 10, price: 150, executed_at: '2026-01-01T14:30:00Z' });
    createTransaction({ ticker: 'AAPL', kind: 'sell', qty: 10, price: 200, executed_at: '2026-02-01T14:30:00Z' });

    const holdings = listHoldings();
    expect(holdings.length).toBe(0);
  });

  it('groups multiple tickers separately', () => {
    createTransaction({ ticker: 'AAPL', kind: 'buy', qty: 10, price: 150, executed_at: '2026-01-01T14:30:00Z' });
    createTransaction({ ticker: 'NVDA', kind: 'buy', qty: 5, price: 400, executed_at: '2026-01-02T14:30:00Z' });

    const holdings = listHoldings();
    expect(holdings.length).toBe(2);
    expect(holdings.map(h => h.ticker).sort()).toEqual(['AAPL', 'NVDA']);
  });
});
