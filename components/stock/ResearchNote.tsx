'use client';

import React from 'react';
import { CitationRef } from './CitationRef';
import type { Citation } from '@/lib/research/types';

function renderWithCitations(html: string, citations: Citation[]): React.ReactNode[] {
  const byPos = new Map(citations.map(c => [c.position, c]));
  const parts: React.ReactNode[] = [];
  const re = /<sup class="cite" data-pos="(\d+)"><a href="#cite-\d+">\[\d+\]<\/a><\/sup>/g;
  let cursor = 0; let m; let key = 0;
  while ((m = re.exec(html)) !== null) {
    if (m.index > cursor) {
      parts.push(<span key={key++} dangerouslySetInnerHTML={{ __html: html.slice(cursor, m.index) }} />);
    }
    const pos = Number(m[1]);
    const cite = byPos.get(pos);
    if (cite) parts.push(<CitationRef key={key++} citation={cite} />);
    cursor = m.index + m[0].length;
  }
  if (cursor < html.length) {
    parts.push(<span key={key++} dangerouslySetInnerHTML={{ __html: html.slice(cursor) }} />);
  }
  return parts;
}

export function ResearchNote({ html, citations }: { html: string; citations: Citation[] }) {
  return (
    <article className="prose prose-invert max-w-none text-sm">
      {renderWithCitations(html, citations)}
    </article>
  );
}
