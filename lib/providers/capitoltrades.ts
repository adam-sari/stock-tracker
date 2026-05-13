/**
 * Minimal client for the Capitol Trades BFF API.
 * Used as a fallback when FMP's congressional endpoints fail.
 * The endpoint is publicly accessible but occasionally returns 503s.
 */

const BASE_URL = 'https://bff.capitoltrades.com';

export type CapitolTradeItem = {
  ticker: string;
  chamber: 'house' | 'senate';
  member: string;
  kind: string;
  amountLow: number;
  amountHigh: number;
  txnDate: string;
  disclosedAt: string;
};

type RawTrade = Record<string, unknown>;

function parseChamber(raw: unknown): 'house' | 'senate' {
  const s = String(raw ?? '').toLowerCase();
  return s.includes('senate') ? 'senate' : 'house';
}

function parseAmount(low: unknown, high: unknown): { amountLow: number; amountHigh: number } {
  return {
    amountLow: low != null && low !== '' ? Number(low) : 0,
    amountHigh: high != null && high !== '' ? Number(high) : 0,
  };
}

export function parseCapitolTradesResponse(json: unknown): CapitolTradeItem[] {
  if (typeof json !== 'object' || json === null) return [];
  const data = (json as Record<string, unknown>).data;
  if (!Array.isArray(data)) return [];
  const results: CapitolTradeItem[] = [];
  for (const raw of data as RawTrade[]) {
    const ticker = String(raw.ticker ?? '').toUpperCase().trim();
    if (!ticker) continue;
    const { amountLow, amountHigh } = parseAmount(raw.amountMin ?? raw.amount_min, raw.amountMax ?? raw.amount_max);
    const memberName = [raw.firstName ?? raw.first_name, raw.lastName ?? raw.last_name]
      .filter(Boolean).join(' ').trim() || String(raw.member ?? raw.politician ?? '');
    results.push({
      ticker,
      chamber: parseChamber(raw.chamber),
      member: memberName,
      kind: String(raw.txType ?? raw.type ?? raw.kind ?? ''),
      amountLow,
      amountHigh,
      txnDate: String(raw.txDate ?? raw.txn_date ?? raw.transactionDate ?? ''),
      disclosedAt: String(raw.disclosureDate ?? raw.disclosed_at ?? ''),
    });
  }
  return results;
}

export class CapitolTradesClient {
  constructor(private baseUrl = BASE_URL) {}

  async getRecentTrades(limit = 200): Promise<CapitolTradeItem[]> {
    const url = `${this.baseUrl}/trades?pageSize=${limit}&page=1`;
    const r = await fetch(url, {
      headers: { Accept: 'application/json' },
    });
    const contentType = r.headers.get('content-type') ?? '';
    if (!r.ok || !contentType.includes('application/json')) {
      const body = await r.text().catch(() => '');
      // If we get HTML back (503 page, etc), throw so caller can handle gracefully
      throw new Error(`CapitolTrades HTTP ${r.status}: ${body.slice(0, 120)}`);
    }
    const json = await r.json();
    return parseCapitolTradesResponse(json);
  }
}
