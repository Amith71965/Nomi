import { describe, expect, it } from "vitest";
import fixtures from "@/fixtures/ui-responses.json";
import { isKnownBlockType, resolveBlock } from "@/components/generative-ui/registry";
import { UI_BLOCK_TYPES } from "@/lib/schemas/assistant";

describe("generative-ui registry", () => {
  it("resolves every fixture block to a typed block", () => {
    for (const type of UI_BLOCK_TYPES) {
      const r = resolveBlock(fixtures.blocks[type]);
      expect(r.kind).toBe("block");
      if (r.kind === "block") expect(r.block.type).toBe(type);
    }
  });

  it("rejects an unknown type and never resolves model-supplied markup", () => {
    expect(resolveBlock({ type: "raw_html", data: { html: "<script>" } })).toEqual({ kind: "unknown", type: "raw_html", reason: "unknown_type" });
    expect(resolveBlock("just a string")).toEqual({ kind: "unknown", type: null, reason: "unknown_type" });
    expect(resolveBlock(null)).toEqual({ kind: "unknown", type: null, reason: "unknown_type" });
  });

  it("flags a known type with invalid data separately", () => {
    const r = resolveBlock({ type: "approval_card", data: { actionId: "x" } });
    expect(r).toEqual({ kind: "unknown", type: "approval_card", reason: "invalid_data" });
  });

  it("only the five block types are known", () => {
    expect(UI_BLOCK_TYPES.every(isKnownBlockType)).toBe(true);
    expect(isKnownBlockType("calendar_delete")).toBe(false);
    expect(isKnownBlockType("html")).toBe(false);
  });
});
