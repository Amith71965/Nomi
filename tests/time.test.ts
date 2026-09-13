import { describe, expect, it } from "vitest";
import {
  addMinutes,
  defaultGrocerySlot,
  isInPast,
  isValidTimeZone,
  localDateString,
  nextLocalMidnight,
  parseLocalDate,
  parseRfc3339,
  toLocalParts,
  toRfc3339,
  tzOffsetMinutes,
  zonedPartsToInstant,
} from "@/lib/time";

const NY = "America/New_York";

describe("isValidTimeZone", () => {
  it("accepts IANA names and rejects offsets, abbreviations, and junk", () => {
    expect(isValidTimeZone("America/New_York")).toBe(true);
    expect(isValidTimeZone("Asia/Kolkata")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
    expect(isValidTimeZone("+05:30")).toBe(false);
    expect(isValidTimeZone("EST")).toBe(false);
    expect(isValidTimeZone("EST5EDT")).toBe(false);
    expect(isValidTimeZone("Etc/UTC")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
  });
});

describe("local parts and offsets", () => {
  it("resolves wall time and offset in New York during DST", () => {
    const instant = new Date("2026-09-11T21:30:00Z");
    expect(toLocalParts(instant, NY)).toEqual({ year: 2026, month: 9, day: 11, hour: 17, minute: 30, second: 0 });
    expect(tzOffsetMinutes(instant, NY)).toBe(-240);
    expect(localDateString(instant, NY)).toBe("2026-09-11");
  });

  it("resolves the plan expiry to the next local midnight (2026-09-12T04:00:00Z)", () => {
    const said = new Date("2026-09-11T18:00:00Z"); // 2 PM New York
    expect(nextLocalMidnight(said, NY).toISOString()).toBe("2026-09-12T04:00:00.000Z");
  });

  it("handles a statement made just before midnight local", () => {
    const said = new Date("2026-09-12T03:59:00Z"); // 11:59 PM Sep 11 New York
    expect(localDateString(said, NY)).toBe("2026-09-11");
    expect(nextLocalMidnight(said, NY).toISOString()).toBe("2026-09-12T04:00:00.000Z");
  });
});

describe("zonedPartsToInstant", () => {
  it("converts an ordinary wall time", () => {
    const r = zonedPartsToInstant({ year: 2026, month: 9, day: 11, hour: 17, minute: 30, second: 0 }, NY);
    expect(r.instant.toISOString()).toBe("2026-09-11T21:30:00.000Z");
    expect(r.ambiguous).toBe(false);
    expect(r.nonexistent).toBe(false);
  });

  it("flags a DST gap (2:30 AM on spring-forward day does not exist)", () => {
    // US DST 2026 starts March 8.
    const r = zonedPartsToInstant({ year: 2026, month: 3, day: 8, hour: 2, minute: 30, second: 0 }, NY);
    expect(r.nonexistent).toBe(true);
  });

  it("flags a DST overlap (1:30 AM on fall-back day happens twice) and picks the earlier", () => {
    // US DST 2026 ends November 1.
    const r = zonedPartsToInstant({ year: 2026, month: 11, day: 1, hour: 1, minute: 30, second: 0 }, NY);
    expect(r.ambiguous).toBe(true);
    expect(r.instant.toISOString()).toBe("2026-11-01T05:30:00.000Z"); // EDT interpretation
  });
});

describe("RFC3339", () => {
  it("formats with a numeric offset and seconds", () => {
    expect(toRfc3339(new Date("2026-09-11T21:30:00Z"), NY)).toBe("2026-09-11T17:30:00-04:00");
    expect(toRfc3339(new Date("2026-01-15T12:00:00Z"), "Asia/Kolkata")).toBe("2026-01-15T17:30:00+05:30");
  });

  it("parses only strings that carry an explicit offset", () => {
    expect(parseRfc3339("2026-09-11T17:30:00-04:00")?.toISOString()).toBe("2026-09-11T21:30:00.000Z");
    expect(parseRfc3339("2026-09-11T21:30:00Z")?.toISOString()).toBe("2026-09-11T21:30:00.000Z");
    expect(parseRfc3339("2026-09-11T17:30:00")).toBeNull();
    expect(parseRfc3339("2026-09-11")).toBeNull();
    expect(parseRfc3339("tomorrow at 5")).toBeNull();
  });
});

describe("parseLocalDate", () => {
  it("accepts real dates and rejects impossible ones", () => {
    expect(parseLocalDate("2026-09-11")).toEqual({ year: 2026, month: 9, day: 11 });
    expect(parseLocalDate("2026-02-30")).toBeNull();
    expect(parseLocalDate("2026-13-01")).toBeNull();
    expect(parseLocalDate("9/11/2026")).toBeNull();
  });
});

describe("defaultGrocerySlot", () => {
  it("proposes today 17:30–18:00 local when that is still in the future", () => {
    const now = new Date("2026-09-11T18:00:00Z"); // 2 PM New York
    expect(defaultGrocerySlot(now, NY)).toEqual({
      startAt: "2026-09-11T17:30:00-04:00",
      endAt: "2026-09-11T18:00:00-04:00",
      timeZone: NY,
    });
  });

  it("returns null instead of silently rolling to tomorrow once 17:30 has passed", () => {
    const now = new Date("2026-09-11T22:00:00Z"); // 6 PM New York
    expect(defaultGrocerySlot(now, NY)).toBeNull();
  });

  it("helpers: addMinutes and isInPast", () => {
    const t = new Date("2026-09-11T21:30:00Z");
    expect(addMinutes(t, 30).toISOString()).toBe("2026-09-11T22:00:00.000Z");
    expect(isInPast(t, new Date("2026-09-11T21:30:00Z"))).toBe(true);
    expect(isInPast(t, new Date("2026-09-11T21:29:59Z"))).toBe(false);
  });
});
