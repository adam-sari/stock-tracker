import React from 'react';

export type TermRow = {
  horizon_days: number;
  point_pred: number;
  lower: number;
  upper: number;
};

export type Mode = 'pid' | 'cqr';

function fmtPct(x: number): string { return `${(x * 100).toFixed(1)}%`; }
function labelFor(h: number): string { return `${h}d`; }

export function ForecastTermStructure(
  { rows, mode = 'pid' }: { rows: TermRow[]; mode?: Mode },
) {
  if (rows.length === 0) {
    return <div className="text-sm text-muted">insufficient data for term structure</div>;
  }

  const sorted = [...rows].sort((a, b) => a.horizon_days - b.horizon_days);
  const maxAbs = Math.max(
    ...sorted.flatMap(r => [Math.abs(r.lower), Math.abs(r.upper), Math.abs(r.point_pred)])
  );
  const yMax = Math.max(maxAbs, 0.001);

  const width = 280;
  const height = 100;
  const padLeft = 30;
  const padBottom = 20;
  const plotW = width - padLeft - 6;
  const plotH = height - padBottom - 6;
  const yMid = 6 + plotH / 2;

  function yPx(v: number): number {
    return yMid - (v / yMax) * (plotH / 2);
  }

  const barW = plotW / sorted.length * 0.6;
  const badgeText = mode === 'pid' ? 'PID-calibrated' : 'raw CQR — coverage unvalidated';
  const badgeColor = mode === 'pid' ? 'text-emerald-400' : 'text-amber-400';

  return (
    <figure className="mt-2">
      <figcaption className={`text-[10px] uppercase tracking-wide ${badgeColor}`}>
        forecast term structure · {badgeText}
      </figcaption>
      <svg width={width} height={height} role="img" aria-label="forecast term structure">
        <line x1={padLeft} x2={width - 6} y1={yMid} y2={yMid}
              stroke="currentColor" strokeOpacity="0.2" />
        {sorted.map((r, i) => {
          const xCenter = padLeft + (plotW / sorted.length) * (i + 0.5);
          const yLo = yPx(r.lower);
          const yHi = yPx(r.upper);
          const yMidPred = yPx(r.point_pred);
          return (
            <g key={r.horizon_days}>
              <rect x={xCenter - barW / 2} y={Math.min(yLo, yHi)}
                    width={barW} height={Math.abs(yHi - yLo)}
                    fill="currentColor" fillOpacity="0.18" />
              <line x1={xCenter - barW / 2} x2={xCenter + barW / 2}
                    y1={yMidPred} y2={yMidPred}
                    stroke="currentColor" strokeWidth="2" />
              <text x={xCenter} y={height - 4}
                    textAnchor="middle" fontSize="10" fill="currentColor"
                    fillOpacity="0.7">
                {labelFor(r.horizon_days)}
              </text>
            </g>
          );
        })}
        <text x={4} y={yPx(yMax) + 4} fontSize="9" fill="currentColor" fillOpacity="0.6">
          {fmtPct(yMax)}
        </text>
        <text x={4} y={yPx(-yMax) + 4} fontSize="9" fill="currentColor" fillOpacity="0.6">
          -{fmtPct(yMax)}
        </text>
      </svg>
    </figure>
  );
}
