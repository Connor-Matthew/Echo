declare module "@anthropic-ai/claude-agent-sdk" {
  export function query(payload: Record<string, unknown>): AsyncIterable<unknown>;
}
