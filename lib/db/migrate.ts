import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type Database from 'better-sqlite3';
import { getDb } from './connection';

export function applySchema(db: Database.Database = getDb()) {
  const schemaPath = path.join(process.cwd(), 'lib', 'db', 'schema.sql');
  const schema = readFileSync(schemaPath, 'utf-8');
  db.exec(schema);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  applySchema();
  console.log('Schema applied.');
}
