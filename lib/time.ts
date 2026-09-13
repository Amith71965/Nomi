/**
 * Time helpers without external dependencies. Every function takes an explicit
 * IANA zone; nothing here reads the machine's local zone.
 */

export interface LocalDateTimeParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number;
  second: number;
}

const tzCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = tzCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    tzCache.set(timeZone, f);
  }
  return f;
}

export function isValidTimeZone(timeZone: string): boolean {
  if (typeof timeZone !== "string" || timeZone.length === 0 || timeZone.length > 64) return false;
  try {
    // Reject offsets ("+05:30") and bare abbreviations ("EST", "PST8PDT"): they hide DST.
    // Require a region-style name (Area/Location) or UTC/GMT.
    if (!/^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)*$/.test(timeZone)) return false;
    if (!timeZone.includes("/") && timeZone !== "UTC" && timeZone !== "GMT") return false;
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

/** Wall-clock parts of an instant in a zone. */
export function toLocalParts(instant: Date, timeZone: string): LocalDateTimeParts {
  const parts = formatter(timeZone).formatToParts(instant);
  const pick = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  return {
    year: pick("year"),
    month: pick("month"),
    day: pick("day"),
    hour: pick("hour") % 24,
    minute: pick("minute"),
    second: pick("second"),
  };
}

/** Offset (minutes east of UTC) that `timeZone` applies at `instant`. */
export function tzOffsetMinutes(instant: Date, timeZone: string): number {
  const p = toLocalParts(instant, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - instant.getTime()) / 60_000);
}

export interface ZonedResolution {
  instant: Date;
  /** Wall time falls in a DST gap (does not exist); `instant` is the post-gap interpretation. */
  nonexistent: boolean;
  /** Wall time occurs twice (DST overlap); `instant` is the earlier occurrence. */
  ambiguous: boolean;
}

/** Convert wall-clock parts in a zone to an instant, detecting DST gaps and overlaps. */
export function zonedPartsToInstant(parts: LocalDateTimeParts, timeZone: string): ZonedResolution {
  const wallAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  // Two-pass: guess with the offset from one day before and one day after to catch both DST sides.
  const candidates = new Set<number>();
  for (const probe of [wallAsUtc - 86_400_000, wallAsUtc, wallAsUtc + 86_400_000]) {
    const offset = tzOffsetMinutes(new Date(probe), timeZone);
    candidates.add(wallAsUtc - offset * 60_000);
  }
  const matching = [...candidates]
    .filter((ms) => {
      const back = toLocalParts(new Date(ms), timeZone);
      return (
        back.year === parts.year &&
        back.month === parts.month &&
        back.day === parts.day &&
        back.hour === parts.hour &&
        back.minute === parts.minute
      );
    })
    .sort((a, b) => a - b);

  if (matching.length === 0) {
    // Gap: pick the interpretation using the offset in force just after the gap.
    const after = tzOffsetMinutes(new Date(wallAsUtc + 3 * 3_600_000), timeZone);
    return { instant: new Date(wallAsUtc - after * 60_000), nonexistent: true, ambiguous: false };
  }
  return { instant: new Date(matching[0]!), nonexistent: false, ambiguous: matching.length > 1 };
}

export function localDateString(instant: Date, timeZone: string): string {
  const p = toLocalParts(instant, timeZone);
  return `${p.year.toString().padStart(4, "0")}-${p.month.toString().padStart(2, "0")}-${p.day.toString().padStart(2, "0")}`;
}

export function parseLocalDate(value: string): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return { year, month, day };
}

/** The instant at which the next local midnight begins after `instant` in `timeZone`. */
export function nextLocalMidnight(instant: Date, timeZone: string): Date {
  const p = toLocalParts(instant, timeZone);
  const tomorrow = new Date(Date.UTC(p.year, p.month - 1, p.day + 1));
  return zonedPartsToInstant(
    {
      year: tomorrow.getUTCFullYear(),
      month: tomorrow.getUTCMonth() + 1,
      day: tomorrow.getUTCDate(),
      hour: 0,
      minute: 0,
      second: 0,
    },
    timeZone,
  ).instant;
}

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

/** RFC3339 with numeric offset, e.g. 2026-09-11T17:30:00-04:00. Seconds always present. */
export function toRfc3339(instant: Date, timeZone: string): string {
  const p = toLocalParts(instant, timeZone);
  const offset = tzOffsetMinutes(instant, timeZone);
  const sign = offset < 0 ? "-" : "+";
  const abs = Math.abs(offset);
  return (
    `${p.year.toString().padStart(4, "0")}-${pad2(p.month)}-${pad2(p.day)}` +
    `T${pad2(p.hour)}:${pad2(p.minute)}:${pad2(p.second)}` +
    `${sign}${pad2(Math.floor(abs / 60))}:${pad2(abs % 60)}`
  );
}

const RFC3339_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

/** Parse an RFC3339 string that carries an explicit offset (or Z). Returns null otherwise. */
export function parseRfc3339(value: string): Date | null {
  if (!RFC3339_WITH_OFFSET.test(value)) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : new Date(ms);
}

export function addMinutes(instant: Date, minutes: number): Date {
  return new Date(instant.getTime() + minutes * 60_000);
}

export function isInPast(instant: Date, now: Date): boolean {
  return instant.getTime() <= now.getTime();
}

export interface ProposedSlot {
  startAt: string;
  endAt: string;
  timeZone: string;
}

/**
 * Default grocery-run slot: today at 17:30 local for 30 minutes.
 * Returns null when 17:30 has already passed: the caller must ask for a future
 * time rather than silently rolling to tomorrow.
 */
export function defaultGrocerySlot(now: Date, timeZone: string, durationMinutes = 30): ProposedSlot | null {
  const today = toLocalParts(now, timeZone);
  const start = zonedPartsToInstant(
    { year: today.year, month: today.month, day: today.day, hour: 17, minute: 30, second: 0 },
    timeZone,
  );
  if (start.nonexistent || start.ambiguous || isInPast(start.instant, now)) return null;
  const end = addMinutes(start.instant, durationMinutes);
  return { startAt: toRfc3339(start.instant, timeZone), endAt: toRfc3339(end, timeZone), timeZone };
}
