/**
 * Shared formatting utilities — import from here, never copy-paste!
 */

export function fmt(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(2)}`;
}

export function fmtPrice(v: number): string {
  return fmt(v);
}

export function pct(v: number): string {
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;
}

export function dateLabel(iso: string): string {
  if (!iso) return '—';
  return iso.slice(0, 10);
}
