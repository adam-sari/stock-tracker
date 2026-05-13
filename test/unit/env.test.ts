import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadEnv, resetEnvCache } from '@/lib/env';

describe('loadEnv', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.ALPACA_KEY_ID;
    delete process.env.ALPACA_SECRET_KEY;
    delete process.env.FINNHUB_API_KEY;
    delete process.env.FMP_API_KEY;
    resetEnvCache();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns validated env when all required keys set', () => {
    process.env.ALPACA_KEY_ID = 'PKXXX';
    process.env.ALPACA_SECRET_KEY = 'secret';
    process.env.FINNHUB_API_KEY = 'fhkey';
    process.env.FMP_API_KEY = 'fmpkey';

    const env = loadEnv();

    expect(env.ALPACA_KEY_ID).toBe('PKXXX');
    expect(env.ALPACA_DATA_BASE_URL).toBe('https://data.alpaca.markets');
  });

  it('throws if FINNHUB_API_KEY is missing', () => {
    process.env.ALPACA_KEY_ID = 'PKXXX';
    process.env.ALPACA_SECRET_KEY = 'secret';
    process.env.FMP_API_KEY = 'fmp';
    expect(() => loadEnv()).toThrow(/FINNHUB_API_KEY/);
  });

  it('throws if FMP_API_KEY is missing', () => {
    process.env.ALPACA_KEY_ID = 'PKXXX';
    process.env.ALPACA_SECRET_KEY = 'secret';
    process.env.FINNHUB_API_KEY = 'fh';
    expect(() => loadEnv()).toThrow(/FMP_API_KEY/);
  });
});
