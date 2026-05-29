import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import React from 'react';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { ResearchTab } from '@/components/stock/ResearchTab';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

type R = { status: number; body?: any };
function queueFetch(...responses: R[]) {
  let i = 0;
  vi.spyOn(global, 'fetch').mockImplementation(async () => {
    const r = responses[Math.min(i++, responses.length - 1)];
    return new Response(r.body ? JSON.stringify(r.body) : '', { status: r.status });
  });
}

const NOTE = (html: string) => ({
  ticker: 'EPAM', mode: 'standard', generated_at: 1,
  model_id: 'm', prompt_version: 'v', prompt_tokens: 0, completion_tokens: 0,
  cache_read_tokens: 0, cache_creation_tokens: 0, cost_usd_micros: 4200,
  markdown: 'md', html, context_hash: 'h', status: 'ok' as const,
  error_message: null, citations: [],
});

describe('ResearchTab', () => {
  it('shows empty CTA when GET returns 404', async () => {
    queueFetch({ status: 404 });
    render(React.createElement(ResearchTab, { ticker: 'EPAM' }));
    expect(await screen.findByText(/No research note for EPAM yet/i)).toBeTruthy();
    expect(screen.getByText(/Generate standard/i)).toBeTruthy();
    expect(screen.getByText(/Generate deep dive/i)).toBeTruthy();
  });

  it('renders the note when GET returns 200', async () => {
    queueFetch({ status: 200, body: { note: NOTE('<p>note body</p>') } });
    render(React.createElement(ResearchTab, { ticker: 'EPAM' }));
    expect(await screen.findByText('note body')).toBeTruthy();
  });

  it('clicking "Generate standard" POSTs and renders result', async () => {
    queueFetch(
      { status: 404 },
      { status: 200, body: { note: NOTE('<p>fresh note</p>') } },
    );
    render(React.createElement(ResearchTab, { ticker: 'EPAM' }));
    const btn = await screen.findByText(/Generate standard/i);
    fireEvent.click(btn);
    expect(await screen.findByText('fresh note')).toBeTruthy();
  });

  it('shows error message and retry button when POST fails', async () => {
    queueFetch(
      { status: 404 },
      { status: 500, body: { error: 'kaboom' } },
    );
    render(React.createElement(ResearchTab, { ticker: 'EPAM' }));
    const btn = await screen.findByText(/Generate standard/i);
    fireEvent.click(btn);
    expect(await screen.findByText(/failed/i)).toBeTruthy();
    expect(screen.getByText(/Retry/i)).toBeTruthy();
  });
});
