import type Database from 'better-sqlite3';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { closeDb, getDb } from '@/lib/db/connection';
import { applySchema } from '@/lib/db/migrate';

export type TestDb = {
  /** Close, delete, recreate, apply schema. Call from `beforeEach`. Returns the fresh handle. */
  reset: () => Database.Database;
  /** Close + delete the test DB directory. Call from `afterAll`. */
  teardown: () => void;
  /** Absolute path of the test DB file. */
  readonly path: string;
};

export function makeTestDb(name: string): TestDb {
  const dir = path.join(process.cwd(), '.vitest-cache', name);
  const file = path.join(dir, 'test.db');

  const reset = (): Database.Database => {
    closeDb();
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    process.env.DB_PATH = file;
    applySchema(getDb());
    return getDb();
  };

  const teardown = (): void => {
    closeDb();
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  };

  return { reset, teardown, path: file };
}
