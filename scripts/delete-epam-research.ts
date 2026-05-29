import { getDb } from '@/lib/db/connection';
process.env.DB_PATH = process.env.DB_PATH ?? 'D:/work/personal/stock-tracker/db/stocks.db';
const db = getDb();
const r = db.prepare(`DELETE FROM research_notes WHERE ticker = 'EPAM'`).run();
console.log('deleted', r.changes);
