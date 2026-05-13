import type { Session } from './types';

/**
 * US equity trading sessions, DST-aware via Intl.
 *
 * Regular: 09:30-16:00 ET (Mon-Fri)
 * Pre:     04:00-09:30 ET
 * Post:    16:00-20:00 ET
 *
 * Outside 04:00-20:00 ET, buckets into pre/post by hour proximity.
 */
export function sessionFor(input: Date | number): Session {
  const date = typeof input === 'number' ? new Date(input * 1000) : input;
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const hourStr = parts.find(p => p.type === 'hour')?.value ?? '0';
  const minStr = parts.find(p => p.type === 'minute')?.value ?? '0';
  // Intl can return '24' for midnight in some locales; normalize to 0
  const hour = Number(hourStr) % 24;
  const minute = Number(minStr);
  const wallMinutes = hour * 60 + minute;

  const REG_OPEN = 9 * 60 + 30;
  const REG_CLOSE = 16 * 60;
  const PRE_OPEN = 4 * 60;
  const POST_CLOSE = 20 * 60;

  if (wallMinutes >= REG_OPEN && wallMinutes < REG_CLOSE) return 'regular';
  if (wallMinutes >= PRE_OPEN && wallMinutes < REG_OPEN) return 'pre';
  if (wallMinutes >= REG_CLOSE && wallMinutes < POST_CLOSE) return 'post';
  return wallMinutes < PRE_OPEN ? 'pre' : 'post';
}
