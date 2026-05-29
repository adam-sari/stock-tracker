'use client';

import { useEffect, useState } from 'react';
import { ResearchNote } from './ResearchNote';
import type { ResearchNote as Note, Mode } from '@/lib/research/types';

type Status = 'idle' | 'loading' | 'empty' | 'generating' | 'loaded' | 'error';

export function ResearchTab({ ticker }: { ticker: string }) {
  const [mode, setMode] = useState<Mode>('standard');
  const [status, setStatus] = useState<Status>('loading');
  const [note, setNote] = useState<Note | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    fetch(`/api/research/${ticker}?mode=${mode}`)
      .then(async (r) => {
        if (cancelled) return;
        if (r.status === 200) {
          const body = await r.json();
          setNote(body.note);
          setStatus('loaded');
        } else if (r.status === 404) {
          setNote(null);
          setStatus('empty');
        } else {
          setErr(await r.text().catch(() => `HTTP ${r.status}`));
          setStatus('error');
        }
      })
      .catch((e) => { if (!cancelled) { setErr(String(e)); setStatus('error'); } });
    return () => { cancelled = true; };
  }, [ticker, mode]);

  async function generate(forceMode: Mode, force = false) {
    setStatus('generating');
    setErr(null);
    try {
      const r = await fetch(`/api/research/${ticker}?mode=${forceMode}${force ? '&force=true' : ''}`,
        { method: 'POST' });
      if (!r.ok) {
        setErr(await r.text().catch(() => `HTTP ${r.status}`));
        setStatus('error');
        return;
      }
      const body = await r.json();
      setNote(body.note);
      setMode(forceMode);
      setStatus('loaded');
    } catch (e) {
      setErr(String(e));
      setStatus('error');
    }
  }

  if (status === 'loading') {
    return <p className="text-sm text-muted p-4">Loading…</p>;
  }

  if (status === 'empty' || (status === 'loaded' && !note)) {
    return (
      <section className="p-4 rounded border border-default">
        <h2 className="text-sm font-semibold mb-2">✦ AI research note</h2>
        <p className="text-sm text-muted mb-4">No research note for {ticker} yet.</p>
        <div className="flex gap-3 flex-wrap">
          <button onClick={() => generate('standard')}
            className="rounded border border-default px-3 py-2 text-sm hover:bg-white/5">
            Generate standard <span className="text-xs text-muted">~15s · ~$0.04</span>
          </button>
          <button onClick={() => generate('deep')}
            className="rounded border border-default px-3 py-2 text-sm hover:bg-white/5">
            Generate deep dive <span className="text-xs text-muted">~60s · ~$0.15</span>
          </button>
        </div>
      </section>
    );
  }

  if (status === 'generating') {
    return <p className="text-sm text-muted p-4">⟳ Generating {mode} research note…</p>;
  }

  if (status === 'error') {
    return (
      <section className="p-4 rounded border border-default">
        <p className="text-sm text-red-400 mb-2">Generation failed: {err}</p>
        <button onClick={() => generate(mode)}
          className="rounded border border-default px-3 py-1 text-sm hover:bg-white/5">
          Retry {mode}
        </button>
      </section>
    );
  }

  return (
    <section className="p-4 rounded border border-default">
      <header className="flex items-baseline justify-between mb-3 text-xs text-muted">
        <span>✦ {note!.mode} · {note!.prompt_tokens + note!.completion_tokens} tokens · ${(note!.cost_usd_micros / 1e6).toFixed(3)}</span>
        <button onClick={() => generate(mode, true)} className="hover:underline">↻ Regenerate</button>
      </header>
      <ResearchNote html={note!.html} citations={note!.citations} />
    </section>
  );
}
