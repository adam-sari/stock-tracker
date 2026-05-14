import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { closeDb, getDb } from '@/lib/db/connection';
import { applySchema } from '@/lib/db/migrate';
import { DELETE } from '@/app/api/transactions/[id]/route';

const TEST_DB_DIR = path.join(process.cwd(), '.vitest-cache', 'api-txn-delete');
const TEST_DB_PATH = path.join(TEST_DB_DIR, 'test.db');

function req(url: string, init: RequestInit = {}) {
  return new Request(url, init);
}

describe('DELETE /api/transactions/[id]', () => {
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

  it('returns 204 when deleting an existing transaction', async () => {
    const db = getDb();
    const inserted = db
      .prepare(`INSERT INTO transactions (ticker, kind, qty, price, executed_at) VALUES ('AAPL', 'buy', 10, 150, 1735732200)`)
      .run();
    const id = String(inserted.lastInsertRowid);
    const res = await DELETE(
      req(`http://localhost/api/transactions/${id}`, { method: 'DELETE' }),
      { params: Promise.resolve({ id }) },
    );
    expect(res.status).toBe(204);
    // Verify it's actually deleted
    const row = db.prepare(`SELECT * FROM transactions WHERE id = ?`).get(Number(id));
    expect(row).toBeUndefined();
  });

  it('returns 404 when transaction does not exist', async () => {
    const res = await DELETE(
      req('http://localhost/api/transactions/99999', { method: 'DELETE' }),
      { params: Promise.resolve({ id: '99999' }) },
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it('returns 400 for a non-integer id', async () => {
    const res = await DELETE(
      req('http://localhost/api/transactions/abc', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'abc' }) },
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('invalid');
  });

  it('returns 400 for a float id', async () => {
    const res = await DELETE(
      req('http://localhost/api/transactions/1.5', { method: 'DELETE' }),
      { params: Promise.resolve({ id: '1.5' }) },
    );
    expect(res.status).toBe(400);
  });
});
