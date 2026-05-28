export function EmptyState() {
  return (
    <section className="rounded border border-default p-6">
      <h2 className="text-sm font-semibold mb-2">No backtest run yet</h2>
      <p className="text-sm text-muted mb-3">
        Generate the first report by running the analytics CLI:
      </p>
      <pre className="text-xs font-mono bg-black/30 rounded p-3 overflow-x-auto">
{`cd sidecar
uv run python -m sidecar.backtest --from 2024-01-01 --to 2024-12-31`}
      </pre>
      <p className="text-xs text-muted mt-3">
        The live monitor below will still render from <code>backtest_scores</code> regardless.
      </p>
    </section>
  );
}
