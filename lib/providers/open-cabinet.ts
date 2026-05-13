/**
 * Open Cabinet client — https://open-cabinet.org
 *
 * Open Cabinet aggregates OGE Form 278-T periodic transaction reports filed by
 * cabinet secretaries, agency heads, and other senior executive branch officials.
 *
 * Data is published as a static JSON file updated periodically (last seen: 2026-04-28).
 * No API key required. URL: https://open-cabinet.org/data/full-dataset.json
 */

export const OPEN_CABINET_DATA_URL = 'https://open-cabinet.org/data/full-dataset.json';

/** Amount-range bracket as reported in OGE Form 278-T */
const AMOUNT_BRACKETS: Record<string, [number, number]> = {
  '$1,001-$15,000':         [1001,      15000],
  '$15,001-$50,000':        [15001,     50000],
  '$50,001-$100,000':       [50001,     100000],
  '$100,001-$250,000':      [100001,    250000],
  '$250,001-$500,000':      [250001,    500000],
  '$500,001-$1,000,000':    [500001,    1000000],
  '$1,000,001-$5,000,000':  [1000001,   5000000],
  '$5,000,001-$25,000,000': [5000001,   25000000],
  '$25,000,001-$50,000,000':[25000001,  50000000],
  'Over $50,000,000':       [50000001,  Number.MAX_SAFE_INTEGER],
};

export function parseAmountBracket(amount: string): [number | null, number | null] {
  const entry = AMOUNT_BRACKETS[amount.trim()];
  if (!entry) return [null, null];
  return [entry[0], entry[1] === Number.MAX_SAFE_INTEGER ? null : entry[1]];
}

export type OpenCabinetTransaction = {
  officialName: string;
  title: string;
  agency: string;
  ticker: string;
  description: string;
  kind: string;               // 'Purchase' | 'Sale' | 'Exchange'
  date: string;               // YYYY-MM-DD
  amountLow: number | null;
  amountHigh: number | null;
  lateFilingFlag: boolean;
};

type RawTransaction = {
  description: string;
  ticker: string | null;
  type: string;
  date: string;
  amount: string;
  lateFilingFlag: boolean;
};

type RawOfficial = {
  name: string;
  title: string;
  agency: string;
  transactions: RawTransaction[];
};

type FullDataset = {
  generatedAt: string;
  officialCount: number;
  transactionCount: number;
  officials: RawOfficial[];
};

export function parseFullDataset(json: unknown): OpenCabinetTransaction[] {
  const data = json as FullDataset;
  const out: OpenCabinetTransaction[] = [];
  for (const official of data.officials ?? []) {
    for (const txn of official.transactions ?? []) {
      // Skip transactions with no ticker (money market funds, etc.)
      if (!txn.ticker || txn.ticker.trim() === '') continue;
      const [amountLow, amountHigh] = parseAmountBracket(txn.amount);
      out.push({
        officialName: official.name,
        title: official.title,
        agency: official.agency,
        ticker: txn.ticker.trim().toUpperCase(),
        description: txn.description,
        kind: txn.type,
        date: txn.date,
        amountLow,
        amountHigh,
        lateFilingFlag: txn.lateFilingFlag,
      });
    }
  }
  return out;
}

export class OpenCabinetClient {
  private dataUrl: string;

  constructor(dataUrl = OPEN_CABINET_DATA_URL) {
    this.dataUrl = dataUrl;
  }

  async fetchTransactions(): Promise<OpenCabinetTransaction[]> {
    const res = await fetch(this.dataUrl, {
      headers: { 'User-Agent': 'stock-tracker/1.0 (personal research tool)' },
    });
    if (!res.ok) {
      throw new Error(`OpenCabinet HTTP ${res.status}: ${res.statusText}`);
    }
    const json = await res.json();
    return parseFullDataset(json);
  }
}
