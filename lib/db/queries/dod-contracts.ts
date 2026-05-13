import { getDb } from '../connection';

export type DodContract = {
  id: number;
  ticker: string;
  recipient_name: string;
  description: string;
  award_amount: number;
  action_date: string;
  agency: string;
  fetched_at: number;
};

/**
 * Upsert a DOD contract row. Deduplication key: (ticker, action_date, recipient_name, award_amount).
 */
export function upsertDodContract(row: Omit<DodContract, 'id'>) {
  const db = getDb();
  db.prepare(`
    INSERT INTO dod_contracts (ticker, recipient_name, description, award_amount, action_date, agency, fetched_at)
    VALUES (@ticker, @recipient_name, @description, @award_amount, @action_date, @agency, @fetched_at)
    ON CONFLICT (ticker, action_date, recipient_name, award_amount) DO UPDATE SET
      description = excluded.description,
      agency = excluded.agency,
      fetched_at = excluded.fetched_at
  `).run({ ...row, ticker: row.ticker.toUpperCase() });
}

/** List recent DOD contracts, optionally filtered by ticker. */
export function listDodContracts(opts: { ticker?: string; limit?: number } = {}): DodContract[] {
  const db = getDb();
  const limit = opts.limit ?? 50;
  if (opts.ticker) {
    return db.prepare(`
      SELECT * FROM dod_contracts WHERE ticker = ? ORDER BY action_date DESC LIMIT ?
    `).all(opts.ticker.toUpperCase(), limit) as DodContract[];
  }
  return db.prepare(`
    SELECT * FROM dod_contracts ORDER BY action_date DESC LIMIT ?
  `).all(limit) as DodContract[];
}
