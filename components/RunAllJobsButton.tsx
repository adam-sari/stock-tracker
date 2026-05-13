'use client';

import { useState } from 'react';

type RunJobsResult = {
  ran: number;
  ok: number;
  errors: number;
  results: Array<{ job: string; status: 'ok' | 'error'; detail?: string }>;
};

type State =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'done'; result: RunJobsResult }
  | { kind: 'error'; message: string };

/**
 * Admin button that POSTs to /api/admin/run-jobs to trigger immediate
 * execution of all scheduled jobs. Useful after first-time setup.
 */
export function RunAllJobsButton() {
  const [state, setState] = useState<State>({ kind: 'idle' });

  const handleClick = async () => {
    if (state.kind === 'running') return;
    setState({ kind: 'running' });
    try {
      const res = await fetch('/api/admin/run-jobs', { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const result = await res.json() as RunJobsResult;
      setState({ kind: 'done', result });
    } catch (e) {
      setState({ kind: 'error', message: (e as Error).message });
    }
  };

  const reset = () => setState({ kind: 'idle' });

  if (state.kind === 'done') {
    const { ok, errors, results } = state.result;
    const failedJobs = results.filter(r => r.status === 'error');
    return (
      <div className="text-xs text-muted flex items-center gap-3">
        <span className={errors > 0 ? 'text-down' : 'text-up'}>
          {errors > 0
            ? `${ok} ok, ${errors} failed: ${failedJobs.map(j => j.job).join(', ')}`
            : `All ${ok} jobs ran successfully`}
        </span>
        <button onClick={reset} className="underline hover:text-text">dismiss</button>
      </div>
    );
  }

  if (state.kind === 'error') {
    return (
      <div className="text-xs text-down flex items-center gap-3">
        <span>Run jobs failed: {state.message}</span>
        <button onClick={reset} className="underline hover:text-text">dismiss</button>
      </div>
    );
  }

  return (
    <button
      onClick={handleClick}
      disabled={state.kind === 'running'}
      className="text-xs text-muted border border-border rounded px-3 py-1 hover:text-text hover:border-text/40 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      {state.kind === 'running' ? 'Running all jobs…' : 'Run all jobs now'}
    </button>
  );
}
