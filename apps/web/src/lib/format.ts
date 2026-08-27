/** Display helpers shared by the HUD and the pages. */

export function formatCredits(value: number): string {
  if (!Number.isFinite(value)) return '0';
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (Math.abs(value) >= 10_000) return `${(value / 1000).toFixed(1)}k`;
  return Math.round(value).toLocaleString();
}

export function formatNumber(value: number): string {
  return Math.round(value).toLocaleString();
}

export function shortAddress(address: string | undefined | null): string {
  if (!address || address.length < 10) return address ?? '';
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  if (total < 60) return `${total}s`;
  const minutes = Math.floor(total / 60);
  if (minutes < 60) return `${minutes}m ${String(total % 60).padStart(2, '0')}s`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${String(minutes % 60).padStart(2, '0')}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

export function formatPlaytime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

/** Formats a wei string for display without pulling in a bignum library. */
export function formatEth(wei: string): string {
  try {
    const value = BigInt(wei);
    const whole = value / 10n ** 18n;
    const fraction = (value % 10n ** 18n) / 10n ** 14n;
    return `${whole}.${String(fraction).padStart(4, '0')}`;
  } catch {
    return '0.0000';
  }
}

export function stars(count: number): string {
  return '★'.repeat(Math.max(0, Math.min(5, count))).padEnd(5, '☆');
}

export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return 'unknown';
  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86_400)}d ago`;
}
