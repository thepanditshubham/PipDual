/**
 * All progress resets run on server time, not the device clock — the spec pins
 * the reset boundary to 00:00 IST. These helpers derive IST calendar keys from
 * a Date without depending on the machine's timezone.
 */

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export function istDayKey(date: Date = new Date()): string {
  const ist = new Date(date.getTime() + IST_OFFSET_MS);
  return `${ist.getUTCFullYear()}-${pad(ist.getUTCMonth() + 1)}-${pad(ist.getUTCDate())}`;
}

export function istWeekKey(date: Date = new Date()): string {
  const ist = new Date(date.getTime() + IST_OFFSET_MS);
  const midnightUtc = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate());
  const weekday = new Date(midnightUtc).getUTCDay(); // 0 = Sunday
  const backToMonday = (weekday + 6) % 7;
  const monday = new Date(midnightUtc - backToMonday * DAY_MS);
  return `${monday.getUTCFullYear()}-${pad(monday.getUTCMonth() + 1)}-${pad(monday.getUTCDate())}`;
}

/** Previous calendar day for a `YYYY-MM-DD` key. */
export function previousDayKey(dayKey: string): string {
  const [y, m, d] = dayKey.split('-').map(Number);
  const prev = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1) - DAY_MS);
  return `${prev.getUTCFullYear()}-${pad(prev.getUTCMonth() + 1)}-${pad(prev.getUTCDate())}`;
}

/** Whole days between two `YYYY-MM-DD` keys (b - a). */
export function dayGap(a: string, b: string): number {
  return Math.round((dayStartMs(b) - dayStartMs(a)) / DAY_MS);
}

export function msUntilDailyReset(date: Date = new Date()): number {
  const ist = new Date(date.getTime() + IST_OFFSET_MS);
  const midnight = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() + 1);
  return Math.max(0, midnight - (date.getTime() + IST_OFFSET_MS));
}

export function msUntilWeeklyReset(date: Date = new Date()): number {
  const ist = new Date(date.getTime() + IST_OFFSET_MS);
  const midnightUtc = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate());
  const weekday = new Date(midnightUtc).getUTCDay();
  const untilMonday = (8 - weekday) % 7 || 7;
  return Math.max(0, midnightUtc + untilMonday * DAY_MS - (date.getTime() + IST_OFFSET_MS));
}

export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (d > 0) return `${d}d ${pad(h)}h ${pad(m)}m`;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function dayStartMs(dayKey: string): number {
  const [y, m, d] = dayKey.split('-').map(Number);
  return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

function pad(value: number): string {
  return value.toString().padStart(2, '0');
}
