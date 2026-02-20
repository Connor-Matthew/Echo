# Echo Claude Agent SDK 设计

日期：2026-02-20

## 目标

在不破坏现有 Chat（OpenAI/Anthropic/ACP）能力的前提下，为 Echo 增加独立的 Agent 模式，并接入 `@anthropic-ai/claude-agent-sdk`。

## 架构

- Chat 链路保持原样：`chat:startStream` 继续负责聊天流式输出。
- Agent 新链路：`agent:*` IPC + 主进程 `agent-service`。
- Provider 新增：`claude-agent`，仅用于 Agent 模式。

## 模块拆分

- `electron/agent/agent-service.ts`
  - 动态加载 Claude Agent SDK
  - 执行 `query()` 并将 SDK 消息转换为统一事件
- `electron/agent/agent-session-manager.ts`
  - 会话索引：`store/agent-sessions.json`
  - 消息落盘：`store/agent-sessions/{id}.jsonl`
- `electron/agent/agent-prompt-builder.ts`
  - 组合 system prompt + 运行时上下文 + 最近历史
- `electron/agent/agent-ipc.ts`
  - 会话 CRUD
  - `sendMessage/stop`
  - `agent:stream:event` 推送

## 数据模型

- `AgentSessionMeta`
- `AgentMessage`
- `AgentStreamEvent`（`text_delta` / `text_complete` / `tool_*` / `task_progress` / `complete` / `error`）
- `AgentStreamEnvelope`（带 `runId/seq/timestamp`）

## 前端接入

- `App` 新增 `agent` 视图
- `Sidebar` 新增 Agent 模式入口和 Agent 会话列表
- `AgentView` 用于显示 Agent 消息与执行状态
- `mu-api` 与 `preload` 新增 `agent` 命名空间接口

## 风险与处理

- SDK 版本差异：通过“弱类型 + 事件容错解析”降低接口波动风险
- 流中断恢复：每次运行持有 `AbortController`，支持 `agent:stop`
- 数据损坏容错：JSONL 逐行解析，坏行跳过

## 验证

- `bun run typecheck`
- 手工验证：创建 Agent 会话、发送消息、停止运行、重启后读取历史
