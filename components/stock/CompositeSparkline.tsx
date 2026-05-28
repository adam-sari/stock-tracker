type Props = {
  points: Array<{ date: string; compositeScore: number }>;
  width?: number;
  height?: number;
};

export function CompositeSparkline({ points, width = 200, height = 40 }: Props) {
  if (points.length < 2) {
    return <span className="text-xs text-muted italic">(insufficient data)</span>;
  }
  const xs = points.map((_, i) => (i / (points.length - 1)) * width);
  const min = Math.min(...points.map(p => p.compositeScore));
  const max = Math.max(...points.map(p => p.compositeScore));
  const range = Math.max(0.001, max - min);
  const ys = points.map(p => height - ((p.compositeScore - min) / range) * height);
  const d = xs.map((x, i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${ys[i].toFixed(2)}`).join(' ');
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      preserveAspectRatio="none"
      aria-label="Composite score sparkline"
      role="img"
    >
      <path d={d} stroke="currentColor" strokeWidth="1.5" fill="none" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
