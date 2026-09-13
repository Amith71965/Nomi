/**
 * Display formatting that never depends on the viewer's locale or zone, so
 * server and client render identically. Wire values are RFC3339 with offset;
 * we display the wall-clock parts as written, plus the zone name.
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function parts(iso: string): { y: number; m: number; d: number; hh: number; mm: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso);
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]), hh: Number(m[4]), mm: Number(m[5]) };
}

/** "Thu, Sep 11" using the date written in the string. */
export function formatLocalDate(iso: string): string {
  const p = parts(iso);
  if (!p) return iso;
  const dow = new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay();
  return `${DAYS[dow]}, ${MONTHS[p.m - 1]} ${p.d}`;
}

/** "Sep 11, 2026" */
export function formatLocalDateLong(iso: string): string {
  const p = parts(iso);
  if (!p) return iso;
  return `${MONTHS[p.m - 1]} ${p.d}, ${p.y}`;
}

/** "5:30 PM" */
export function formatLocalTime(iso: string): string {
  const p = parts(iso);
  if (!p) return iso;
  const suffix = p.hh >= 12 ? "PM" : "AM";
  const h12 = p.hh % 12 === 0 ? 12 : p.hh % 12;
  return `${h12}:${p.mm.toString().padStart(2, "0")} ${suffix}`;
}

/** "5:30–6:00 PM" (shared suffix collapsed when both sides match). */
export function formatTimeRange(startIso: string, endIso: string): string {
  const a = formatLocalTime(startIso);
  const b = formatLocalTime(endIso);
  const [aTime, aSuffix] = a.split(" ");
  const [bTime, bSuffix] = b.split(" ");
  if (aSuffix === bSuffix && aTime && bTime) return `${aTime}–${bTime} ${aSuffix}`;
  return `${a}–${b}`;
}

/** "$1.98" or null when the amount or currency is missing. Never prints $0 for unknown. */
export function formatPrice(amount: number | null, currency: "USD" | null): string | null {
  if (amount === null || currency === null) return null;
  return `$${amount.toFixed(2)}`;
}

/** "America/New_York" → "New York". */
export function formatZone(timeZone: string): string {
  const leaf = timeZone.split("/").pop() ?? timeZone;
  return leaf.replace(/_/g, " ");
}

/** "4.5 (120)" only when both parts exist. */
export function formatRating(rating: number | null, count: number | null): string | null {
  if (rating === null || count === null) return null;
  return `${rating.toFixed(1)} (${count.toLocaleString("en-US")})`;
}
