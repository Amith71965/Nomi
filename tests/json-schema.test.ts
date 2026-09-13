import { describe, expect, it } from "vitest";
import { z } from "zod";
import { modelAnswerSchema } from "@/lib/schemas/assistant";
import { containsUnsupportedKeyword, toModelJsonSchema } from "@/lib/schemas/json-schema";
import { toolDefinitions } from "@/lib/schemas/tools";

describe("toModelJsonSchema", () => {
  it("strips constraint keywords strict providers reject and keeps enums", () => {
    const schema = toModelJsonSchema(modelAnswerSchema);
    expect(containsUnsupportedKeyword(schema)).toBeNull();
    const text = JSON.stringify(schema);
    expect(text).toContain('"enum"');
    expect(text).not.toContain("maxLength");
    expect(text).not.toContain("$schema");
  });

  it("makes every object strict with all properties required", () => {
    const schema = toModelJsonSchema(z.object({ a: z.string().optional(), b: z.number() })) as {
      required: string[];
      additionalProperties: boolean;
    };
    expect(schema.required).toEqual(["a", "b"]);
    expect(schema.additionalProperties).toBe(false);
  });

  it("applies to every tool definition", () => {
    for (const def of toolDefinitions()) {
      expect(containsUnsupportedKeyword(def.function.parameters)).toBeNull();
    }
  });
});
