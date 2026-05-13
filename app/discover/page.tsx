import Link from 'next/link';

export default function Discover() {
  return (
    <main className="p-6 max-w-4xl mx-auto">
      <Link href="/" className="text-accent hover:underline">← Back to dashboard</Link>
      <h1 className="text-2xl font-semibold mt-4">Discover</h1>
      <p className="text-muted mt-2">Discovery feed is built in Plan 4.</p>
    </main>
  );
}
