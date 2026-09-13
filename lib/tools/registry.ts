import type { ToolCallRequest } from "@/lib/ai/client";
import type { Capabilities } from "@/lib/ai/prompts";
import type { MemoryChange } from "@/lib/memory/service";
import { TOOL_NAMES, toolArgSchemas, toolDefinitions, type ChatToolDefinition, type ToolName } from "@/lib/schemas/tools";
import { createMemoryTool, getMemoriesTool, updateMemoryTool, type MemoryToolContext } from "@/lib/tools/memory";
import { compareOptionsTool, searchProductsTool, type ResearchContext } from "@/lib/tools/research";

/**
 * The only tools the model can call. Research and proposal tools appear only
 * when their capability is on (Phases 3 and 4). The Calendar executor is not
 * here and never will be.
 */
export interface ToolContext extends MemoryToolContext {
  capabilities: Capabilities;
  /** Present only when research is on; holds this turn's search results. */
  research: ResearchContext | null;
}

export type ToolExecution =
  | { ok: true; name: ToolName; result: unknown; memoryChanges: MemoryChange[] }
  | { ok: false; name: string; error: "unsupported_tool" | "invalid_arguments" | "handler_failed"; detail: string };

export function availableToolNames(capabilities: Capabilities): ToolName[] {
  return TOOL_NAMES.filter((name) => {
    if (name === "search_products" || name === "compare_options") return capabilities.research;
    if (name === "propose_calendar_event") return capabilities.calendar;
    return true;
  });
}

export function availableToolDefinitions(capabilities: Capabilities): ChatToolDefinition[] {
  return toolDefinitions(availableToolNames(capabilities));
}

function isToolName(name: string): name is ToolName {
  return (TOOL_NAMES as readonly string[]).includes(name);
}

export async function executeTool(call: ToolCallRequest, ctx: ToolContext): Promise<ToolExecution> {
  const name = call.name;
  if (!isToolName(name) || !availableToolNames(ctx.capabilities).includes(name)) {
    return { ok: false, name, error: "unsupported_tool", detail: `Tool "${name}" is not available.` };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(call.argumentsJson || "{}");
  } catch {
    return { ok: false, name, error: "invalid_arguments", detail: "Arguments were not valid JSON." };
  }
  const parsed = toolArgSchemas[name].safeParse(raw);
  if (!parsed.success) {
    return { ok: false, name, error: "invalid_arguments", detail: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  }

  try {
    switch (name) {
      case "get_memories": {
        const result = await getMemoriesTool(parsed.data as Parameters<typeof getMemoriesTool>[0], ctx);
        return { ok: true, name, result, memoryChanges: [] };
      }
      case "create_memory": {
        const outcome = await createMemoryTool(parsed.data as Parameters<typeof createMemoryTool>[0], ctx);
        return { ok: true, name, result: summarizeOutcome(outcome), memoryChanges: outcome.changes };
      }
      case "update_memory": {
        const outcome = await updateMemoryTool(parsed.data as Parameters<typeof updateMemoryTool>[0], ctx);
        return { ok: true, name, result: summarizeOutcome(outcome), memoryChanges: outcome.changes };
      }
      case "search_products": {
        if (!ctx.research) return { ok: false, name, error: "unsupported_tool", detail: "Research is not available in this turn." };
        const result = await searchProductsTool(parsed.data as Parameters<typeof searchProductsTool>[0], ctx.research);
        return { ok: true, name, result, memoryChanges: [] };
      }
      case "compare_options": {
        if (!ctx.research) return { ok: false, name, error: "unsupported_tool", detail: "Research is not available in this turn." };
        const result = await compareOptionsTool(parsed.data as Parameters<typeof compareOptionsTool>[0], ctx.research);
        return { ok: true, name, result, memoryChanges: [] };
      }
      case "propose_calendar_event":
        // Reached only when the capability flag is on before the handler exists; fail closed.
        return { ok: false, name, error: "unsupported_tool", detail: `Tool "${name}" has no handler in this build.` };
    }
  } catch (error) {
    return { ok: false, name, error: "handler_failed", detail: error instanceof Error ? error.message : "unknown" };
  }
}

function summarizeOutcome(outcome: { changes: MemoryChange[]; skipped: Array<{ entity: string; reason: string }> }) {
  return {
    committed: outcome.changes.map((c) => ({
      operation: c.operation,
      id: c.memory.id,
      version: c.memory.version,
      category: c.memory.category,
      entity: c.memory.entity,
      summary: c.memory.summary,
    })),
    skipped: outcome.skipped,
  };
}
