import { ProviderChain } from './chain';
import { AlpacaProvider } from './alpaca';
import { YahooProvider } from './yahoo';
import { StooqProvider } from './stooq';
import { FinnhubClient } from './finnhub';
import { FmpClient } from './fmp';
import { ApewisdomClient } from './apewisdom';
import { NasdaqHaltsClient } from './nasdaq-halts';
import { loadEnv } from '../env';

let _quoteChain: ProviderChain | null = null;
let _minuteBarsChain: ProviderChain | null = null;
let _dailyBarsChain: ProviderChain | null = null;
let _finnhub: FinnhubClient | null = null;
let _fmp: FmpClient | null = null;
let _apewisdom: ApewisdomClient | null = null;
let _nasdaqHalts: NasdaqHaltsClient | null = null;

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

export function finnhubClient(): FinnhubClient {
  if (_finnhub) return _finnhub;
  _finnhub = new FinnhubClient({ apiKey: loadEnv().FINNHUB_API_KEY });
  return _finnhub;
}
export function fmpClient(): FmpClient {
  if (_fmp) return _fmp;
  _fmp = new FmpClient({ apiKey: loadEnv().FMP_API_KEY });
  return _fmp;
}
export function apewisdomClient(): ApewisdomClient {
  if (_apewisdom) return _apewisdom;
  _apewisdom = new ApewisdomClient();
  return _apewisdom;
}
export function nasdaqHaltsClient(): NasdaqHaltsClient {
  if (_nasdaqHalts) return _nasdaqHalts;
  _nasdaqHalts = new NasdaqHaltsClient();
  return _nasdaqHalts;
}

export function resetChains() {
  _quoteChain = null;
  _minuteBarsChain = null;
  _dailyBarsChain = null;
  _finnhub = null;
  _fmp = null;
  _apewisdom = null;
  _nasdaqHalts = null;
}
