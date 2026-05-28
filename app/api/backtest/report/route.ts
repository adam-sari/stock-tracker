import { promises as fs } from 'node:fs';
import path from 'node:path';

const NO_REPORT_MSG =
  'No backtest report yet — generate one with:\n\n' +
  '  cd sidecar\n' +
  '  uv run python -m sidecar.backtest --from <YYYY-MM-DD> --to <YYYY-MM-DD>\n';

export async function GET(): Promise<Response> {
  const backtestDir = path.join(process.cwd(), 'out', 'backtest');
  let entries: string[];
  try {
    entries = await fs.readdir(backtestDir);
  } catch {
    return new Response(NO_REPORT_MSG, { status: 404, headers: { 'Content-Type': 'text/plain' } });
  }
  const tsPattern = /^\d{8}-\d{6}$/;
  const candidates = entries.filter(e => tsPattern.test(e)).sort();
  for (let i = candidates.length - 1; i >= 0; i--) {
    const reportPath = path.join(backtestDir, candidates[i], 'report.html');
    try {
      const html = await fs.readFile(reportPath, 'utf-8');
      return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    } catch {
      continue;
    }
  }
  return new Response(NO_REPORT_MSG, { status: 404, headers: { 'Content-Type': 'text/plain' } });
}
