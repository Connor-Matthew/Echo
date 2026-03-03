import type { ToolCall } from "../../shared/contracts";

export type ToolCallItem = ToolCall;

export type AgentToolRenderItem =
  | { kind: "single"; toolCall: ToolCallItem }
  | { kind: "todo_group"; parent: ToolCallItem; steps: ToolCallItem[] };

export type ToolAnchorGroup = {
  key: string;
  offset: number;
  items: AgentToolRenderItem[];
};

export const isProgressToolCall = (toolCall: ToolCallItem) => toolCall.id.startsWith("progress:");

export const hasPendingToolInRenderItems = (items: AgentToolRenderItem[]) =>
  items.some((item) =>
    item.kind === "single"
      ? item.toolCall.status === "pending"
      : item.parent.status === "pending" || item.steps.some((step) => step.status === "pending")
  );

export const buildAgentToolRenderItems = (toolCalls: ToolCallItem[]): AgentToolRenderItem[] => {
  const result: AgentToolRenderItem[] = [];

  let index = 0;
  while (index < toolCalls.length) {
    const current = toolCalls[index];
    const isTodoParent = !isProgressToolCall(current) && current.serverName === "TodoWrite";
    if (!isTodoParent) {
      result.push({ kind: "single", toolCall: current });
      index += 1;
      continue;
    }

    const steps: ToolCallItem[] = [];
    let cursor = index + 1;
    while (cursor < toolCalls.length && isProgressToolCall(toolCalls[cursor])) {
      steps.push(toolCalls[cursor]);
      cursor += 1;
    }

    if (!steps.length) {
      result.push({ kind: "single", toolCall: current });
      index += 1;
      continue;
    }

    result.push({ kind: "todo_group", parent: current, steps });
    index = cursor;
  }

  return result;
};

export const buildClampedToolAnchorGroups = (
  items: AgentToolRenderItem[],
  contentLength: number
): ToolAnchorGroup[] => {
  const anchorGroups: ToolAnchorGroup[] = [];
  for (const item of items) {
    const rawOffset = item.kind === "single" ? item.toolCall.contentOffset : item.parent.contentOffset;
    const hasOffset = typeof rawOffset === "number" && Number.isFinite(rawOffset);
    if (hasOffset && rawOffset !== anchorGroups[anchorGroups.length - 1]?.offset) {
      anchorGroups.push({
        key: `offset:${Math.floor(rawOffset as number)}:${anchorGroups.length}`,
        offset: rawOffset as number,
        items: [item]
      });
    } else if (anchorGroups.length > 0) {
      anchorGroups[anchorGroups.length - 1].items.push(item);
    } else {
      anchorGroups.push({ key: `offset:0:${anchorGroups.length}`, offset: 0, items: [item] });
    }
  }

  return anchorGroups.map((group) => ({
    ...group,
    offset: Math.max(0, Math.min(contentLength, Math.floor(group.offset)))
  }));
};
