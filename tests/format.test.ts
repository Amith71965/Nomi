import { describe, expect, it } from "vitest";
import { formatLocalDate, formatLocalDateLong, formatLocalTime, formatPrice, formatRating, formatTimeRange, formatZone } from "@/lib/format";

describe("format helpers", () => {
  it("formats wall-clock parts as written, ignoring the viewer's zone", () => {
    expect(formatLocalDate("2026-09-11T17:30:00-04:00")).toBe("Fri, Sep 11");
    expect(formatLocalDateLong("2026-09-11T17:30:00-04:00")).toBe("Sep 11, 2026");
    expect(formatLocalTime("2026-09-11T17:30:00-04:00")).toBe("5:30 PM");
    expect(formatLocalTime("2026-09-11T00:05:00-04:00")).toBe("12:05 AM");
    expect(formatTimeRange("2026-09-11T17:30:00-04:00", "2026-09-11T18:00:00-04:00")).toBe("5:30–6:00 PM");
    expect(formatTimeRange("2026-09-11T11:30:00-04:00", "2026-09-11T12:00:00-04:00")).toBe("11:30 AM–12:00 PM");
    expect(formatZone("America/New_York")).toBe("New York");
  });

  it("never prints a price or rating for missing evidence", () => {
    expect(formatPrice(1.98, "USD")).toBe("$1.98");
    expect(formatPrice(null, "USD")).toBeNull();
    expect(formatPrice(1.98, null)).toBeNull();
    expect(formatPrice(0, "USD")).toBe("$0.00"); // an explicit zero is a real value; null is the unknown
    expect(formatRating(4.5, 120)).toBe("4.5 (120)");
    expect(formatRating(4.5, null)).toBeNull();
  });

  it("passes through unparseable input rather than throwing", () => {
    expect(formatLocalDate("soon")).toBe("soon");
    expect(formatLocalTime("")).toBe("");
  });
});
