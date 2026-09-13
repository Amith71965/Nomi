import { describe, expect, it } from "vitest";
import { MemoryService } from "@/lib/memory/service";
import { InMemoryMemoryStore } from "@/lib/memory/store";
import { resolveLocation } from "@/lib/integrations/places";
import { SHOPPING_LOCATION_KEY, loadShoppingLocation, readShoppingLocation, saveShoppingLocation } from "@/lib/preferences";
import { USER_A, USER_B } from "./helpers/fake-stores";

const NOW = new Date("2026-09-13T18:00:00.000Z");

function service() {
  return new MemoryService(new InMemoryMemoryStore(() => NOW), () => NOW);
}

function fake(status: number, body: unknown, capture?: { url?: string }) {
  return async (url: string) => {
    if (capture) capture.url = url;
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  };
}

const OK = {
  status: "OK",
  results: [
    {
      formatted_address: "Austin, TX 78701, USA",
      address_components: [
        { long_name: "Austin", types: ["locality"] },
        { long_name: "Travis County", types: ["administrative_area_level_2"] },
        { long_name: "Texas", types: ["administrative_area_level_1"] },
        { long_name: "United States", types: ["country"] },
      ],
    },
  ],
};

describe("resolveLocation", () => {
  it("canonicalizes a recognised place for the product search", async () => {
    const capture: { url?: string } = {};
    const result = await resolveLocation("austin tx", { apiKey: "maps-secret", fetchImpl: fake(200, OK, capture) });
    expect(result).toEqual({ value: "Austin, Texas, United States", verified: true });
    expect(new URL(capture.url ?? "").searchParams.get("address")).toBe("austin tx");
  });

  it("keeps the user's own words when there is no key, no match, or an error, and never marks them verified", async () => {
    expect(await resolveLocation("  Somewhere  odd ", {})).toEqual({ value: "Somewhere odd", verified: false });
    expect(await resolveLocation("nowhere", { apiKey: "k", fetchImpl: fake(200, { status: "ZERO_RESULTS", results: [] }) })).toEqual({ value: "nowhere", verified: false });
    expect(await resolveLocation("austin", { apiKey: "k", fetchImpl: fake(500, {}) })).toEqual({ value: "austin", verified: false });
    expect(
      await resolveLocation("austin", {
        apiKey: "k",
        fetchImpl: async () => {
          throw new TypeError("network");
        },
      }),
    ).toEqual({ value: "austin", verified: false });
    expect(await resolveLocation("   ", { apiKey: "k" })).toEqual({ value: "", verified: false });
  });

  it("never leaks the maps key into its result", async () => {
    const result = await resolveLocation("austin", { apiKey: "maps-secret", fetchImpl: fake(200, OK) });
    expect(JSON.stringify(result)).not.toContain("maps-secret");
  });
});

describe("shopping location preference", () => {
  it("saves, reads back, and keeps accounts apart", async () => {
    const memory = service();
    expect(await loadShoppingLocation(memory, USER_A)).toBeNull();
    await saveShoppingLocation(memory, USER_A, "Austin, Texas, United States", "austin tx");
    expect(await loadShoppingLocation(memory, USER_A)).toBe("Austin, Texas, United States");
    expect(await loadShoppingLocation(memory, USER_B)).toBeNull();
  });

  it("is an ordinary editable memory carrying the user's own words as the quote", async () => {
    const memory = service();
    await saveShoppingLocation(memory, USER_A, "Austin, Texas, United States", "austin tx");
    const rows = await memory.list(USER_A, "preference");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ category: "preference", entityKey: SHOPPING_LOCATION_KEY, source: "manual_edit", sourceQuote: "austin tx", expiresAt: null });
    expect(rows[0].value).toEqual({ note: "Austin, Texas, United States" });
  });

  it("changing it replaces the same row instead of adding another", async () => {
    const memory = service();
    await saveShoppingLocation(memory, USER_A, "Austin, Texas, United States", "austin");
    await saveShoppingLocation(memory, USER_A, "Dallas, Texas, United States", "dallas");
    const rows = await memory.list(USER_A, "preference");
    expect(rows).toHaveLength(1);
    expect(readShoppingLocation(rows)).toBe("Dallas, Texas, United States");
    expect(rows[0].version).toBe(2);
  });

  it("deleting it means no location at all, never a guessed one", async () => {
    const memory = service();
    await saveShoppingLocation(memory, USER_A, "Austin, Texas, United States", "austin");
    const [row] = await memory.list(USER_A, "preference");
    await memory.delete(USER_A, row.id, row.version);
    expect(await loadShoppingLocation(memory, USER_A)).toBeNull();
  });
});
