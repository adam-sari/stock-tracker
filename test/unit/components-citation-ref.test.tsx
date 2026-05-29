import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import React from 'react';
import { CitationRef } from '@/components/stock/CitationRef';

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }));

afterEach(() => { cleanup(); pushMock.mockReset(); });

const citation = {
  position: 1, source_table: 'insider_txns', source_id: 'abc',
  source_summary: 'Fejes (CEO) bought 77 sh on 2026-04-30',
  source_deep_link: '/stock/EPAM?tab=insiders&highlight=abc',
};

describe('CitationRef', () => {
  it('renders a superscript with the citation number', () => {
    render(React.createElement(CitationRef, { citation }));
    expect(screen.getByText('[1]')).toBeTruthy();
  });

  it('shows popover content on focus', () => {
    render(React.createElement(CitationRef, { citation }));
    const link = screen.getByText('[1]').closest('a')!;
    fireEvent.focus(link);
    expect(screen.queryByText(/Fejes/)).toBeTruthy();
  });

  it('navigates to deep link on click', () => {
    render(React.createElement(CitationRef, { citation }));
    const link = screen.getByText('[1]').closest('a')!;
    fireEvent.click(link);
    expect(pushMock).toHaveBeenCalledWith('/stock/EPAM?tab=insiders&highlight=abc');
  });
});
