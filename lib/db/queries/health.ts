import { getDb } from '../connection';

export type ProviderHealthRow = {
  provider: string;
  status: 'ok' | 'degraded' | 'down' | 'unknown';
  last_success: number | null;
  last_error: number | null;
  last_error_msg: string | null;
  consecutive_failures: number;
};

export function recordProviderSuccess(provider: string) {
  const db = getDb();
  db.prepare(`
    INSERT INTO data_provider_health (provider, status, last_success, consecutive_failures)
    VALUES (?, 'ok', ?, 0)
    ON CONFLICT (provider) DO UPDATE SET
      status = 'ok',
      last_success = excluded.last_success,
      consecutive_failures = 0
  `).run(provider, Math.floor(Date.now() / 1000));
}

export function recordProviderFailure(provider: string, message: string) {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  db.prepare(`
    INSERT INTO data_provider_health (provider, status, last_error, last_error_msg, consecutive_failures)
    VALUES (?, 'degraded', ?, ?, 1)
    ON CONFLICT (provider) DO UPDATE SET
      status = CASE WHEN consecutive_failures + 1 >= 3 THEN 'down' ELSE 'degraded' END,
      last_error = excluded.last_error,
      last_error_msg = excluded.last_error_msg,
      consecutive_failures = consecutive_failures + 1
  `).run(provider, now, message);
}

export function getProviderHealth(): ProviderHealthRow[] {
  const db = getDb();
  return db.prepare(`SELECT * FROM data_provider_health ORDER BY provider`).all() as ProviderHealthRow[];
}
