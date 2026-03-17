import type { AgentStreamEvent } from "../../src/shared/agent-contracts";
import type { ToolCall } from "../../src/shared/contracts";

export const upsertCollectedToolCall = (
  collectedToolCalls: Map<string, ToolCall>,
  streamEvent: Extract<AgentStreamEvent, { type: "tool_start" | "tool_result" }>,
  streamedAssistantText: string
) => {
  const id = `tool:${streamEvent.toolId}`;

  if (streamEvent.type === "tool_start") {
    collectedToolCalls.set(id, {
      id,
      serverName: streamEvent.toolName,
      toolName: streamEvent.toolName,
      status: "pending",
      message: streamEvent.input ?? "",
      contentOffset: Math.max(0, streamedAssistantText.length)
    });
    return;
  }

  const existing = collectedToolCalls.get(id);
  collectedToolCalls.set(id, {
    ...(existing ?? {
      id,
      serverName: streamEvent.toolName,
      toolName: streamEvent.toolName,
      message: "",
      contentOffset: Math.max(0, streamedAssistantText.length)
    }),
    status: streamEvent.isError ? "error" : "success",
    // Persist the final tool output when we have it; otherwise keep the input preview.
    message:
      typeof streamEvent.output === "string" && streamEvent.output.length
        ? streamEvent.output
        : (existing?.message ?? ""),
    contentOffset:
      typeof existing?.contentOffset === "number" && Number.isFinite(existing.contentOffset)
        ? existing.contentOffset
        : Math.max(0, streamedAssistantText.length)
  });
};
