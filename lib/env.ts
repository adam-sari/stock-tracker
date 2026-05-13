import { z } from 'zod';

const envSchema = z.object({
  ALPACA_KEY_ID: z.string().min(1, 'ALPACA_KEY_ID is required'),
  ALPACA_SECRET_KEY: z.string().min(1, 'ALPACA_SECRET_KEY is required'),
  ALPACA_BASE_URL: z.string().url().default('https://paper-api.alpaca.markets/v2'),
  ALPACA_DATA_BASE_URL: z.string().url().default('https://data.alpaca.markets'),
  FINNHUB_API_KEY: z.string().min(1, 'FINNHUB_API_KEY is required'),
  FMP_API_KEY: z.string().min(1, 'FMP_API_KEY is required'),
  DB_PATH: z.string().default('./db/stocks.db'),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function loadEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const messages = parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment:\n${messages}`);
  }
  cached = parsed.data;
  return cached;
}

export function resetEnvCache() {
  cached = null;
}
