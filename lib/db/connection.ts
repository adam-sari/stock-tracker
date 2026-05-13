import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  const dbPath = process.env.DB_PATH ?? path.join(process.cwd(), 'db', 'stocks.db');
  mkdirSync(path.dirname(dbPath), { recursive: true });
  _db = new Database(dbPath);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  return _db;
}

export function closeDb() {
  if (_db) {
    _db.close();
    _db = null;
  }
}
