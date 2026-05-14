/**
 * Tests for lib/providers/index.ts — singleton factory functions.
 * Each factory must return the same instance on repeated calls,
 * and resetChains() must clear all instances.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resetEnvCache } from '@/lib/env';
import {
  quoteChain,
  minuteBarsChain,
  dailyBarsChain,
  finnhubClient,
  fmpClient,
  apewisdomClient,
  nasdaqHaltsClient,
  resetChains,
} from '@/lib/providers/index';

// Provide the env vars required by loadEnv()
const REQUIRED_ENV: Record<string, string> = {
  ALPACA_KEY_ID: 'test-key-id',
  ALPACA_SECRET_KEY: 'test-secret',
  FINNHUB_API_KEY: 'test-fh',
  FMP_API_KEY: 'test-fmp',
};

describe('lib/providers singleton factories', () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    // Save and set env vars
    for (const key of Object.keys(REQUIRED_ENV)) {
      savedEnv[key] = process.env[key];
      process.env[key] = REQUIRED_ENV[key];
    }
    // Reset env cache so loadEnv() picks up the test vars
    resetEnvCache();
    // Reset provider singletons
    resetChains();
  });

  afterEach(() => {
    // Restore env and clear state
    for (const [key, val] of Object.entries(savedEnv)) {
      if (val === undefined) delete process.env[key];
      else process.env[key] = val;
    }
    resetEnvCache();
    resetChains();
  });

  describe('quoteChain()', () => {
    it('returns a ProviderChain instance', () => {
      const chain = quoteChain();
      expect(chain).toBeTruthy();
      expect(typeof chain.getLatestQuote).toBe('function');
    });

    it('returns the same instance on repeated calls (singleton)', () => {
      const a = quoteChain();
      const b = quoteChain();
      expect(a).toBe(b);
    });
  });

  describe('minuteBarsChain()', () => {
    it('returns a ProviderChain instance', () => {
      const chain = minuteBarsChain();
      expect(chain).toBeTruthy();
      expect(typeof chain.getMinuteBars).toBe('function');
    });

    it('returns the same instance on repeated calls (singleton)', () => {
      const a = minuteBarsChain();
      const b = minuteBarsChain();
      expect(a).toBe(b);
    });
  });

  describe('dailyBarsChain()', () => {
    it('returns a ProviderChain instance', () => {
      const chain = dailyBarsChain();
      expect(chain).toBeTruthy();
    });

    it('returns the same instance on repeated calls (singleton)', () => {
      const a = dailyBarsChain();
      const b = dailyBarsChain();
      expect(a).toBe(b);
    });
  });

  describe('finnhubClient()', () => {
    it('returns a FinnhubClient instance', () => {
      const client = finnhubClient();
      expect(client).toBeTruthy();
      expect(typeof client.getQuote).toBe('function');
    });

    it('returns the same instance on repeated calls (singleton)', () => {
      const a = finnhubClient();
      const b = finnhubClient();
      expect(a).toBe(b);
    });
  });

  describe('fmpClient()', () => {
    it('returns an FmpClient instance', () => {
      const client = fmpClient();
      expect(client).toBeTruthy();
    });

    it('returns the same instance on repeated calls (singleton)', () => {
      const a = fmpClient();
      const b = fmpClient();
      expect(a).toBe(b);
    });
  });

  describe('apewisdomClient()', () => {
    it('returns an ApewisdomClient instance', () => {
      const client = apewisdomClient();
      expect(client).toBeTruthy();
    });

    it('returns the same instance on repeated calls (singleton)', () => {
      const a = apewisdomClient();
      const b = apewisdomClient();
      expect(a).toBe(b);
    });
  });

  describe('nasdaqHaltsClient()', () => {
    it('returns a NasdaqHaltsClient instance', () => {
      const client = nasdaqHaltsClient();
      expect(client).toBeTruthy();
    });

    it('returns the same instance on repeated calls (singleton)', () => {
      const a = nasdaqHaltsClient();
      const b = nasdaqHaltsClient();
      expect(a).toBe(b);
    });
  });

  describe('resetChains()', () => {
    it('forces new instances to be created after reset', () => {
      const beforeReset = quoteChain();
      resetChains();
      const afterReset = quoteChain();
      // A new object is created after reset
      expect(afterReset).not.toBe(beforeReset);
    });

    it('resets all factory singletons independently', () => {
      const qBefore = quoteChain();
      const mBefore = minuteBarsChain();
      const dBefore = dailyBarsChain();
      const fhBefore = finnhubClient();
      const fmpBefore = fmpClient();
      const apeBefore = apewisdomClient();
      const haltsBefore = nasdaqHaltsClient();

      resetChains();

      expect(quoteChain()).not.toBe(qBefore);
      expect(minuteBarsChain()).not.toBe(mBefore);
      expect(dailyBarsChain()).not.toBe(dBefore);
      expect(finnhubClient()).not.toBe(fhBefore);
      expect(fmpClient()).not.toBe(fmpBefore);
      expect(apewisdomClient()).not.toBe(apeBefore);
      expect(nasdaqHaltsClient()).not.toBe(haltsBefore);
    });
  });
});
