import type Database from 'better-sqlite3';

/** Convert YYYY-MM-DD as-of date into the epoch second at 23:59:59 UTC of that day. */
export function asOfEpoch(date: string): number {
  return Math.floor(new Date(`${date}T23:59:59Z`).getTime() / 1000);
}

/** Convert YYYY-MM-DD to the epoch second at 00:00:00 UTC of (date - lookbackDays). */
export function lookbackEpoch(date: string, lookbackDays: number): number {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - lookbackDays);
  return Math.floor(d.getTime() / 1000);
}
