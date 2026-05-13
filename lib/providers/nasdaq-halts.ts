import { XMLParser } from 'fast-xml-parser';
import { ProviderError } from './types';

export type NasdaqHalt = {
  ticker: string;
  issueName: string;
  haltDate: string;        // YYYY-MM-DD
  haltTime: string;        // HH:MM:SS
  reasonCode: string;
  market: string;
};

export class NasdaqHaltsClient {
  private readonly url = 'https://www.nasdaqtrader.com/rss.aspx?feed=tradehalts';

  async getCurrentHalts(): Promise<NasdaqHalt[]> {
    const r = await fetch(this.url, { headers: { 'User-Agent': 'Mozilla/5.0 StockTracker/0.1' } });
    if (!r.ok) throw new ProviderError('nasdaq-halts', `HTTP ${r.status}`);
    const xml = await r.text();
    const parser = new XMLParser({ ignoreAttributes: true, removeNSPrefix: true });
    const parsed = parser.parse(xml) as { rss?: { channel?: { item?: unknown } } };
    const items = parsed.rss?.channel?.item;
    if (!items) return [];
    const arr = Array.isArray(items) ? items : [items];
    return arr.map((it: Record<string, unknown>) => {
      const haltDateRaw = String(it.HaltDate ?? '');         // "MM/DD/YYYY"
      const [mm, dd, yyyy] = haltDateRaw.split('/');
      const haltDate = (yyyy && mm && dd) ? `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}` : '';
      const haltTimeRaw = String(it.HaltTime ?? '').split('.')[0];
      return {
        ticker: String(it.IssueSymbol ?? '').toUpperCase(),
        issueName: String(it.IssueName ?? ''),
        haltDate,
        haltTime: haltTimeRaw,
        reasonCode: String(it.ReasonCode ?? ''),
        market: String(it.Market ?? ''),
      };
    });
  }
}
