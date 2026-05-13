import Link from 'next/link';

export default async function StockDetail({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  return (
    <main className="p-6 max-w-4xl mx-auto">
      <Link href="/" className="text-accent hover:underline">← Back to dashboard</Link>
      <h1 className="text-2xl font-semibold mt-4">{ticker.toUpperCase()}</h1>
      <p className="text-muted mt-2">Full stock detail page is built in Plan 3 (per-stock detail).</p>
    </main>
  );
}
