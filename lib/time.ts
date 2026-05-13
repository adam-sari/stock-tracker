export function timeAgo(unixSeconds: number, now: number = Math.floor(Date.now() / 1000)): string {
  const diff = now - unixSeconds;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)}d ago`;
  if (diff < 30 * 86400) return `${Math.floor(diff / (7 * 86400))}w ago`;
  if (diff < 365 * 86400) return `${Math.floor(diff / (30 * 86400))}mo ago`;
  return `${Math.floor(diff / (365 * 86400))}y ago`;
}

export function isoDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}
