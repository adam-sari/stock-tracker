import type Database from 'better-sqlite3';
import { marked } from 'marked';
import DOMPurify from 'isomorphic-dompurify';
import type { Citation } from './types';
import { resolveCitationSource } from './citation-sources';

const KNOWN_TABLES = new Set([
  'insider_txns', 'fund_holdings', 'congress_trades', 'candles_daily',
  'news', 'stock_meta', 'backtest_scores', 'trading_halts', 'web_search',
]);

// Marker format: [cite:<table>:<id>] where id may contain pipes.
const CITE_RE = /\[cite:(\w+):([^\]]+)\]/g;

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

export function parseCitations(
  markdown: string, db: Database.Database,
): { html: string; citations: Citation[] } {
  const seen = new Map<string, number>();
  const citations: Citation[] = [];

  // First pass: substitute known markers with a token we can post-process
  // after markdown rendering (so they aren't treated as link/text by marked).
  const tokenized = markdown.replace(CITE_RE, (_, table: string, id: string) => {
    if (!KNOWN_TABLES.has(table)) {
      return `[cite:${table}:${id}]`;
    }
    const key = `${table}:${id}`;
    let pos = seen.get(key);
    if (pos === undefined) {
      pos = citations.length + 1;
      seen.set(key, pos);
      const resolved = resolveCitationSource(db, table, id);
      citations.push({
        position: pos, source_table: table, source_id: id,
        source_summary: resolved.summary, source_deep_link: resolved.deepLink,
      });
    }
    return `CITE${pos}`;
  });

  const refsBlock = citations.length === 0 ? '' : (
    '\n\n## References\n\n' +
    citations.map(c =>
      `<div id="cite-${c.position}">[${c.position}] ${escapeHtml(c.source_summary)} ` +
      `<a href="${escapeHtml(c.source_deep_link)}">↗</a></div>`
    ).join('\n')
  );

  const bodyHtml = String(marked.parse(tokenized, { async: false }));
  const refsHtml = refsBlock ? String(marked.parse(refsBlock, { async: false })) : '';
  const combined = bodyHtml + refsHtml;

  // Replace tokens with <sup> elements
  const supRe = /CITE(\d+)/g;
  const withSups = combined.replace(supRe, (_, pos) =>
    `<sup class="cite" data-pos="${pos}"><a href="#cite-${pos}">[${pos}]</a></sup>`
  );

  const safe = DOMPurify.sanitize(withSups, {
    ADD_ATTR: ['data-pos'],
    ADD_TAGS: ['sup'],
  });
  return { html: safe, citations };
}
