import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/connection';

export type JobStatusRow = {
  job: string;
  started_at: number;
  status: string;
  detail: string | null;
  finished_at: number | null;
};

export async function GET() {
  try {
    const rows = getDb()
      .prepare(`
        SELECT job, MAX(started_at) AS started_at, status, detail, finished_at
        FROM job_runs
        GROUP BY job
        ORDER BY job
      `)
      .all() as JobStatusRow[];
    return NextResponse.json({ jobs: rows });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
