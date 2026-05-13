'use client';

import { useState } from 'react';

type Props = { onCreated: () => void };

export function AddHoldingDrawer({ onCreated }: Props) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    ticker: '',
    kind: 'buy' as 'buy' | 'sell',
    qty: '',
    price: '',
    fees: '',
    executed_at: new Date().toISOString().slice(0, 16),
    note: '',
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const body = {
      ticker: form.ticker.toUpperCase(),
      kind: form.kind,
      qty: parseFloat(form.qty),
      price: parseFloat(form.price),
      fees: form.fees ? parseFloat(form.fees) : 0,
      executed_at: new Date(form.executed_at).toISOString(),
      note: form.note || undefined,
    };
    const r = await fetch('/api/transactions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    setSubmitting(false);
    if (!r.ok) {
      const data = await r.json().catch(() => ({ error: 'unknown' }));
      setError(data.error ?? `HTTP ${r.status}`);
      return;
    }
    setOpen(false);
    setForm({ ...form, ticker: '', qty: '', price: '', fees: '', note: '' });
    onCreated();
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-3 py-1.5 bg-accent text-bg rounded text-sm font-medium hover:opacity-90"
      >
        + Add holding
      </button>
      {open && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setOpen(false)}>
          <form
            onClick={e => e.stopPropagation()}
            onSubmit={submit}
            className="bg-panel border border-border rounded p-6 w-full max-w-md flex flex-col gap-3"
          >
            <h2 className="text-lg font-semibold">Add transaction</h2>
            {error && <div className="text-down text-sm">{error}</div>}
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted uppercase">Ticker</span>
              <input required value={form.ticker} onChange={e => setForm({ ...form, ticker: e.target.value })}
                className="bg-bg border border-border rounded px-2 py-1 uppercase" />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted uppercase">Kind</span>
                <select value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value as 'buy' | 'sell' })}
                  className="bg-bg border border-border rounded px-2 py-1">
                  <option value="buy">Buy</option>
                  <option value="sell">Sell</option>
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted uppercase">Executed at</span>
                <input required type="datetime-local" value={form.executed_at}
                  onChange={e => setForm({ ...form, executed_at: e.target.value })}
                  className="bg-bg border border-border rounded px-2 py-1" />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted uppercase">Qty</span>
                <input required type="number" step="any" min="0" value={form.qty}
                  onChange={e => setForm({ ...form, qty: e.target.value })}
                  className="bg-bg border border-border rounded px-2 py-1" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted uppercase">Price</span>
                <input required type="number" step="any" min="0" value={form.price}
                  onChange={e => setForm({ ...form, price: e.target.value })}
                  className="bg-bg border border-border rounded px-2 py-1" />
              </label>
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted uppercase">Note (optional)</span>
              <input value={form.note} onChange={e => setForm({ ...form, note: e.target.value })}
                className="bg-bg border border-border rounded px-2 py-1" />
            </label>
            <div className="flex gap-2 justify-end mt-2">
              <button type="button" onClick={() => setOpen(false)} className="px-3 py-1.5 text-muted hover:text-text">Cancel</button>
              <button type="submit" disabled={submitting}
                className="px-3 py-1.5 bg-accent text-bg rounded text-sm font-medium disabled:opacity-50">
                {submitting ? 'Saving...' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
