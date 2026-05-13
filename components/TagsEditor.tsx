'use client';

import { useState } from 'react';

type Props = {
  ticker: string;
  initialTags: string[];
  onChange?: (tags: string[]) => void;
};

export function TagsEditor({ ticker, initialTags, onChange }: Props) {
  const [tags, setTags] = useState(initialTags);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = draft.trim().toLowerCase();
    if (!trimmed || tags.includes(trimmed)) { setDraft(''); setAdding(false); return; }
    const r = await fetch(`/api/stock/${ticker}/tags`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tag: trimmed }),
    });
    if (r.ok) {
      const data = await r.json();
      setTags(data.tags);
      onChange?.(data.tags);
    }
    setDraft('');
    setAdding(false);
  };

  const remove = async (tag: string) => {
    const r = await fetch(`/api/stock/${ticker}/tags?tag=${encodeURIComponent(tag)}`, { method: 'DELETE' });
    if (r.ok) {
      const next = tags.filter(t => t !== tag);
      setTags(next);
      onChange?.(next);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map(t => (
        <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-accent/20 text-accent border border-accent/30">
          {t}
          <button onClick={() => remove(t)} className="hover:opacity-70" aria-label={`remove ${t}`}>×</button>
        </span>
      ))}
      {adding ? (
        <form onSubmit={submit}>
          <input
            autoFocus
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={() => { if (!draft) setAdding(false); }}
            placeholder="tag"
            className="text-xs px-2 py-0.5 rounded-full bg-bg border border-border w-20"
          />
        </form>
      ) : (
        <button onClick={() => setAdding(true)} className="text-xs text-muted hover:text-accent px-2 py-0.5">+ tag</button>
      )}
    </div>
  );
}
