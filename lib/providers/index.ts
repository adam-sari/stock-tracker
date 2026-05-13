import { ProviderChain } from './chain';
import { AlpacaProvider } from './alpaca';
import { YahooProvider } from './yahoo';
import { StooqProvider } from './stooq';
import { loadEnv } from '../env';

let _quoteChain: ProviderChain | null = null;
let _minuteBarsChain: ProviderChain | null = null;
let _dailyBarsChain: ProviderChain | null = null;

export function quoteChain(): ProviderChain {
  if (_quoteChain) return _quoteChain;
  const env = loadEnv();
  _quoteChain = new ProviderChain([
    new AlpacaProvider({ keyId: env.ALPACA_KEY_ID, secret: env.ALPACA_SECRET_KEY, baseUrl: env.ALPACA_BASE_URL, dataBaseUrl: env.ALPACA_DATA_BASE_URL }),
    new YahooProvider(),
  ]);
  return _quoteChain;
}

export function minuteBarsChain(): ProviderChain {
  if (_minuteBarsChain) return _minuteBarsChain;
  const env = loadEnv();
  _minuteBarsChain = new ProviderChain([
    new AlpacaProvider({ keyId: env.ALPACA_KEY_ID, secret: env.ALPACA_SECRET_KEY, baseUrl: env.ALPACA_BASE_URL, dataBaseUrl: env.ALPACA_DATA_BASE_URL }),
    new YahooProvider(),
  ]);
  return _minuteBarsChain;
}

export function dailyBarsChain(): ProviderChain {
  if (_dailyBarsChain) return _dailyBarsChain;
  const env = loadEnv();
  _dailyBarsChain = new ProviderChain([
    new YahooProvider(),
    new StooqProvider(),
    new AlpacaProvider({ keyId: env.ALPACA_KEY_ID, secret: env.ALPACA_SECRET_KEY, baseUrl: env.ALPACA_BASE_URL, dataBaseUrl: env.ALPACA_DATA_BASE_URL }),
  ]);
  return _dailyBarsChain;
}

export function resetChains() {
  _quoteChain = null;
  _minuteBarsChain = null;
  _dailyBarsChain = null;
}
