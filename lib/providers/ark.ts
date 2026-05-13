/**
 * ARK Invest CSV trade parser.
 * ARK publishes daily trade CSVs at:
 *   https://www.ark-funds.com/wp-content/uploads/funds-etf-csv/{FUND}_TRADES.csv
 *
 * CSV columns: Date, Direction, Ticker, CUSIP, Name, Shares, % of ETF
 */

export type ArkTrade = {
  fund: string;
  ticker: string;
  direction: string; // "Buy" | "Sell" | ""
  shares: number;
  ts: string; // YYYY-MM-DD
};

export const ARK_FUNDS = ['ARKK', 'ARKG', 'ARKQ', 'ARKF', 'ARKW', 'ARKX'] as const;
export type ArkFund = (typeof ARK_FUNDS)[number];

export function buildCsvUrl(fund: ArkFund | string, baseUrl = 'https://www.ark-funds.com'): string {
  return `${baseUrl}/wp-content/uploads/funds-etf-csv/${fund}_TRADES.csv`;
}

/**
 * Parse ARK CSV text into trade records.
 * Skips header row and any rows without a valid ticker or date.
 */
export function parseArkCsv(fund: string, csvText: string): ArkTrade[] {
  const lines = csvText.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  // Find header row to detect column indices dynamically
  const header = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/^"|"$/g, ''));
  const idx = {
    date: header.indexOf('date'),
    direction: header.indexOf('direction'),
    ticker: header.indexOf('ticker'),
    shares: header.indexOf('shares'),
  };

  // Fall back to positional if headers not found
  if (idx.date === -1) idx.date = 0;
  if (idx.direction === -1) idx.direction = 1;
  if (idx.ticker === -1) idx.ticker = 2;
  if (idx.shares === -1) idx.shares = 5;

  const trades: ArkTrade[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    const date = cleanField(cols[idx.date] ?? '');
    const ticker = cleanField(cols[idx.ticker] ?? '');
    const direction = cleanField(cols[idx.direction] ?? '');
    const sharesRaw = cleanField(cols[idx.shares] ?? '');

    // Skip rows without a date or ticker
    if (!date || !ticker) continue;
    // Skip rows where ticker looks like a header or description
    if (ticker.toLowerCase() === 'ticker') continue;

    const shares = parseFloat(sharesRaw.replace(/,/g, '')) || 0;

    trades.push({
      fund: fund.toUpperCase(),
      ticker: ticker.toUpperCase(),
      direction: normalizeDirection(direction),
      shares,
      ts: normalizeDate(date),
    });
  }

  return trades;
}

function cleanField(s: string): string {
  return s.trim().replace(/^"|"$/g, '');
}

function normalizeDirection(d: string): string {
  const lower = d.toLowerCase();
  if (lower === 'buy') return 'Buy';
  if (lower === 'sell') return 'Sell';
  return '';
}

/** Normalize various date formats to YYYY-MM-DD */
function normalizeDate(d: string): string {
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  // MM/DD/YYYY
  const mdyMatch = d.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdyMatch) {
    const [, m, day, y] = mdyMatch;
    return `${y}-${m.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  return d;
}

/** Minimal CSV line splitter that handles quoted fields */
function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQuote = false;
  for (const ch of line) {
    if (ch === '"') { inQuote = !inQuote; continue; }
    if (ch === ',' && !inQuote) { result.push(cur); cur = ''; continue; }
    cur += ch;
  }
  result.push(cur);
  return result;
}

export class ArkClient {
  constructor(private baseUrl = 'https://www.ark-funds.com') {}

  async fetchFundTrades(fund: ArkFund | string): Promise<ArkTrade[]> {
    const url = buildCsvUrl(fund, this.baseUrl);
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`ARK CSV fetch failed for ${fund}: HTTP ${res.status}`);
    }
    const text = await res.text();
    return parseArkCsv(fund, text);
  }
}
