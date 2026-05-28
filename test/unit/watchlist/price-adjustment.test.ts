import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { getDb } from '@/lib/db/connection';
import { makeTestDb } from '@/test/helpers/test-db';
import { priceAdjustmentFactor } from '@/lib/watchlist/price-adjustment';

const testDb = makeTestDb('price-adjustment');

describe('priceAdjustmentFactor', () => {
  beforeEach(testDb.reset);
  afterAll(testDb.teardown);

  it('returns 1.0 when no splits in the window', () => {
    const f = priceAdjustmentFactor(getDb(), 'AAPL', '2024-01-02', '2024-12-31');
    expect(f).toBeCloseTo(1.0, 9);
  });

  it('returns the split ratio for a 2-for-1 inside the window', () => {
    getDb().prepare(
      `INSERT INTO corporate_actions (id, ticker, kind, ex_date, amount, source) VALUES ('aapl-2to1', 'AAPL', 'split', '2024-06-15', 2.0, 'test')`
    ).run();
    const f = priceAdjustmentFactor(getDb(), 'AAPL', '2024-01-02', '2024-12-31');
    expect(f).toBeCloseTo(1 / 2.0, 9);
  });

  it('compounds multiple splits in the window', () => {
    getDb().prepare(
      `INSERT INTO corporate_actions (id, ticker, kind, ex_date, amount, source) VALUES ('nvda-4to1', 'NVDA', 'split', '2024-06-10', 4.0, 'test')`
    ).run();
    getDb().prepare(
      `INSERT INTO corporate_actions (id, ticker, kind, ex_date, amount, source) VALUES ('nvda-10to1', 'NVDA', 'split', '2024-09-10', 10.0, 'test')`
    ).run();
    const f = priceAdjustmentFactor(getDb(), 'NVDA', '2024-01-01', '2024-12-31');
    expect(f).toBeCloseTo(1 / (4.0 * 10.0), 9);
  });

  it('ignores splits with ex_date OUTSIDE the (from, to] window', () => {
    getDb().prepare(
      `INSERT INTO corporate_actions (id, ticker, kind, ex_date, amount, source) VALUES ('before', 'X', 'split', '2023-12-31', 2.0, 'test')`
    ).run();
    getDb().prepare(
      `INSERT INTO corporate_actions (id, ticker, kind, ex_date, amount, source) VALUES ('after',  'X', 'split', '2025-01-01', 2.0, 'test')`
    ).run();
    const f = priceAdjustmentFactor(getDb(), 'X', '2024-01-01', '2024-12-31');
    expect(f).toBeCloseTo(1.0, 9);
  });

  it('ignores non-split corporate actions', () => {
    getDb().prepare(
      `INSERT INTO corporate_actions (id, ticker, kind, ex_date, amount, source) VALUES ('div', 'X', 'dividend', '2024-06-15', 0.50, 'test')`
    ).run();
    const f = priceAdjustmentFactor(getDb(), 'X', '2024-01-01', '2024-12-31');
    expect(f).toBeCloseTo(1.0, 9);
  });
});
