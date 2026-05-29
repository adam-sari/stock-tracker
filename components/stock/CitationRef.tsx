'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Citation } from '@/lib/research/types';

export function CitationRef({ citation }: { citation: Citation }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <span className="relative inline-block">
      <a
        href={citation.source_deep_link}
        className="text-xs align-super text-accent hover:underline"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}
        onClick={(e) => {
          e.preventDefault();
          router.push(citation.source_deep_link);
        }}
      >
        [{citation.position}]
      </a>
      {open && (
        <span
          role="tooltip"
          className="absolute z-10 left-0 top-full mt-1 w-64 rounded border border-default bg-bg-elevated p-2 text-xs shadow-lg"
        >
          <span className="block text-muted text-[10px] uppercase tracking-wide mb-1">
            {citation.source_table}
          </span>
          <span className="block">{citation.source_summary}</span>
          <span className="block mt-1 text-muted">↗ Click to open</span>
        </span>
      )}
    </span>
  );
}
