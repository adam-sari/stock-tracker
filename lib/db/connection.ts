import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

let _db: Database.Database | null = null;

function applySchemaInline(db: Database.Database) {
  const schemaPath = path.join(process.cwd(), 'lib', 'db', 'schema.sql');
  const schema = readFileSync(schemaPath, 'utf-8');
  db.exec(schema);
}

export function getDb(): Database.Database {
  if (_db) return _db;
  const dbPath = process.env.DB_PATH ?? path.join(process.cwd(), 'db', 'stocks.db');
  mkdirSync(path.dirname(dbPath), { recursive: true });
  _db = new Database(dbPath);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  applySchemaInline(_db);
  return _db;
}

export function closeDb() {
  if (_db) {
    _db.close();
    _db = null;
  }
}
