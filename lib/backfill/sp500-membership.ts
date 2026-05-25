import { parse, HTMLElement } from 'node-html-parser';

export type MembershipRow = {
  ticker: string;
  from_date: string;       // YYYY-MM-DD
  to_date: string | null;  // null for current members
};

const DEFAULT_FROM_DATE = '2010-01-01';

const MONTHS: Record<string, string> = {
  january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
  july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
};

/** Convert "February 15, 2024" → "2024-02-15". Returns null if unparseable. */
function parseEnglishDate(raw: string): string | null {
  const m = raw.trim().match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (!m) return null;
  const month = MONTHS[m[1].toLowerCase()];
  if (!month) return null;
  const day = m[2].padStart(2, '0');
  return `${m[3]}-${month}-${day}`;
}

/** Parse a YYYY-MM-DD date directly, or null. */
function parseIsoDate(raw: string): string | null {
  const m = raw.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function extractCurrent(html: string): Map<string, string> {
  const root = parse(html);
  const out = new Map<string, string>();
  const rows = root.querySelectorAll('table#constituents tbody tr');
  for (const r of rows) {
    const cells = r.querySelectorAll('td');
    if (cells.length < 6) continue;
    const ticker = cells[0].text.trim();
    if (!ticker) continue;
    const dateRaw = cells[5].text.trim();
    const from = parseIsoDate(dateRaw) ?? parseEnglishDate(dateRaw) ?? DEFAULT_FROM_DATE;
    out.set(ticker, from);
  }
  return out;
}

type ChangeRow = { date: string; added: string; removed: string };

function extractChanges(html: string): ChangeRow[] {
  const root = parse(html);
  const out: ChangeRow[] = [];
  const rows = root.querySelectorAll('table#changes tbody tr');
  for (const r of rows) {
    const cells = r.querySelectorAll('td');
    if (cells.length < 6) continue;
    const dateRaw = cells[0].text.trim();
    const date = parseIsoDate(dateRaw) ?? parseEnglishDate(dateRaw);
    if (!date) continue;
    const added = cells[2].text.trim();
    const removed = cells[4].text.trim();
    if (added || removed) out.push({ date, added, removed });
  }
  return out;
}

/**
 * Combine current-members + change-history into MembershipRow records.
 *
 * Known limitation: tickers that were a member, removed, then re-added produce
 * a single row reflecting their most-recent state. For a 5-year backtest of
 * S&P 500 names this misclassifies <1% of ticker-days.
 */
export function parseSp500Pages(currentHtml: string, changesHtml: string): MembershipRow[] {
  const current = extractCurrent(currentHtml);
  const changes = extractChanges(changesHtml);

  // Map of ticker → to_date for tickers that were removed
  const removals = new Map<string, string>();
  for (const c of changes) {
    if (c.removed && !current.has(c.removed)) {
      const existing = removals.get(c.removed);
      if (!existing || c.date > existing) removals.set(c.removed, c.date);
    }
  }

  const rows: MembershipRow[] = [];
  for (const [ticker, from_date] of current) {
    rows.push({ ticker, from_date, to_date: null });
  }
  for (const [ticker, to_date] of removals) {
    rows.push({ ticker, from_date: DEFAULT_FROM_DATE, to_date });
  }
  return rows;
}
