export type Session = 'regular' | 'pre' | 'post';

export type Quote = {
  ticker: string;
  price: number;
  bid?: number;
  ask?: number;
  bidSize?: number;
  askSize?: number;
  ts: number;
  session: Session;
};

export type Bar = {
  ticker: string;
  ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  session: Session;
};

export type BarsOpts = {
  start: Date;
  end: Date;
  prepost?: boolean;
};

export type ProviderHealth = {
  status: 'ok' | 'degraded' | 'down' | 'unknown';
  message?: string;
};

export interface MarketDataProvider {
  readonly name: string;
  health(): Promise<ProviderHealth>;
  getLatestQuote(ticker: string): Promise<Quote | null>;
  getMinuteBars(ticker: string, opts: BarsOpts): Promise<Bar[]>;
  getDailyBars(ticker: string, opts: { start: Date; end: Date }): Promise<Bar[]>;
}

export class ProviderError extends Error {
  constructor(public readonly provider: string, message: string, public readonly cause?: unknown) {
    super(`[${provider}] ${message}`);
  }
}
