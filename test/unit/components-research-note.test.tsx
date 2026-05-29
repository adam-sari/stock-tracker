import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import React from 'react';
import { ResearchNote } from '@/components/stock/ResearchNote';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
afterEach(() => cleanup());

const SAMPLE_HTML = '<h2>Thesis</h2><p>Note<sup class="cite" data-pos="1"><a href="#cite-1">[1]</a></sup>.</p>';
const SAMPLE_CITATIONS = [{
  position: 1, source_table: 'insider_txns', source_id: 'abc',
  source_summary: 'Fejes bought 77 sh', source_deep_link: '/x',
}];

describe('ResearchNote', () => {
  it('renders the HTML content', () => {
    render(React.createElement(ResearchNote, { html: SAMPLE_HTML, citations: SAMPLE_CITATIONS }));
    expect(screen.getByText('Thesis')).toBeTruthy();
    expect(screen.getByText(/Note/)).toBeTruthy();
  });

  it('replaces <sup> markers with CitationRef components', () => {
    const { container } = render(
      React.createElement(ResearchNote, { html: SAMPLE_HTML, citations: SAMPLE_CITATIONS }),
    );
    expect(container.textContent).toContain('[1]');
  });

  it('does not error when html has no citations', () => {
    render(React.createElement(ResearchNote, {
      html: '<p>plain</p>', citations: [],
    }));
    expect(screen.getByText('plain')).toBeTruthy();
  });
});
