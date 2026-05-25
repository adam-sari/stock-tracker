import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseSp500Pages, type MembershipRow } from '@/lib/backfill/sp500-membership';

const CURRENT_HTML = readFileSync(
  path.join(process.cwd(), 'test/fixtures/wikipedia-sp500-current.html'), 'utf-8');
const CHANGES_HTML = readFileSync(
  path.join(process.cwd(), 'test/fixtures/wikipedia-sp500-changes.html'), 'utf-8');

describe('parseSp500Pages', () => {
  it('extracts current members with from_date and NULL to_date', () => {
    const rows = parseSp500Pages(CURRENT_HTML, CHANGES_HTML);
    const aapl = rows.find(r => r.ticker === 'AAPL');
    expect(aapl).toBeTruthy();
    expect(aapl!.from_date).toBe('1982-11-30');
    expect(aapl!.to_date).toBeNull();
  });

  it('emits removed-ticker rows with to_date set from changes table', () => {
    const rows = parseSp500Pages(CURRENT_HTML, CHANGES_HTML);
    const old = rows.find(r => r.ticker === 'OLD');
    expect(old).toBeTruthy();
    expect(old!.to_date).toBe('2024-02-15');
    const rmv = rows.find(r => r.ticker === 'RMV');
    expect(rmv).toBeTruthy();
    expect(rmv!.to_date).toBe('2023-06-30');
  });

  it('uses the 2010-01-01 floor when current member has no listed date', () => {
    const noDateHtml = `<table class="wikitable sortable" id="constituents"><tbody>
      <tr><td><a>FOO</a></td><td>Foo</td><td></td><td></td><td></td><td></td><td>0</td><td></td></tr>
    </tbody></table>`;
    const rows = parseSp500Pages(noDateHtml, '<table></table>');
    expect(rows[0].ticker).toBe('FOO');
    expect(rows[0].from_date).toBe('2010-01-01');
  });

  it('skips ticker rows that lack a symbol', () => {
    const blankHtml = `<table class="wikitable sortable" id="constituents"><tbody>
      <tr><td><a></a></td><td>X</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
    </tbody></table>`;
    const rows = parseSp500Pages(blankHtml, '<table></table>');
    expect(rows.length).toBe(0);
  });
});
