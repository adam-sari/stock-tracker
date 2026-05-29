import { getDb } from '@/lib/db/connection';
import { buildTickerContext } from '@/lib/research/context-builder';

process.env.DB_PATH = process.env.DB_PATH ?? 'D:/work/personal/stock-tracker/db/stocks.db';
const ctx = buildTickerContext('EPAM', getDb(), 'standard');
console.log(JSON.stringify(ctx, null, 2));
