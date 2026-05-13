import { ProviderError } from './types';

export type NasdaqEarning = {
  ticker: string;
  name: string;
  date: string;            // YYYY-MM-DD
  hour: 'bmo' | 'amc' | 'dmh' | '';
  epsForecast: number | null;
  numEstimates: number | null;
  marketCap: number | null;
};

function parseMoney(s: string | undefined | null): number | null {
  if (!s) return null;
  const cleaned = s.replace(/\$/g, '').replace(/,/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parseHour(t: string): 'bmo' | 'amc' | 'dmh' | '' {
  if (t.includes('after')) return 'amc';
  if (t.includes('pre')) return 'bmo';
  if (t.includes('during')) return 'dmh';
  return '';
}

export class NasdaqCalendarClient {
  async getEarningsByDate(date: Date): Promise<NasdaqEarning[]> {
    const iso = date.toISOString().slice(0, 10);
    const url = `https://api.nasdaq.com/api/calendar/earnings?date=${iso}`;
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 StockTracker/0.1' } });
    if (!r.ok) throw new ProviderError('nasdaq-calendar', `HTTP ${r.status}`);
    const body = await r.json() as { data?: { rows?: Array<Record<string, string>> | null } };
    const rows = body.data?.rows ?? [];
    if (!rows) return [];
    return rows.map(row => ({
      ticker: String(row.symbol ?? '').toUpperCase(),
      name: String(row.name ?? ''),
      date: iso,
      hour: parseHour(String(row.time ?? '')),
      epsForecast: parseMoney(row.epsForecast),
      numEstimates: row.noOfEsts ? Number(row.noOfEsts) : null,
      marketCap: parseMoney(row.marketCap),
    }));
  }
}
