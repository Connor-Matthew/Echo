# Soul 模式可用性重构设计

日期：2026-02-23  
状态：已确认设计，待实现

## 1. 问题定义与目标

本次重构聚焦两类核心痛点：

- `开关感知弱`：用户无法在发送前明确知道 Soul 模式是否会注入、注入了什么。
- `提取不可见`：用户感知不到“是否真的提取到记忆”，难以建立信任。

已确认范围：

- 反馈位置固定在输入框上方。
- 每次发送后给出“本轮提取反馈”。
- 支持“仅撤销本轮新增/更新记忆”。
- 不改为文档编辑流，不做全量历史版本管理。

成功标准：

- 用户在聊天页即可看到“提取结果”。
- 提取失败或未命中时有明确原因，不影响聊天回复。
- 撤销只作用于当前轮操作，行为可预测。

## 2. 方案选择

在 3 个方案中采用“前后端显式 delta”方案：

1. `前后端显式 delta（采用）`：ingest 返回本轮提取结果及 operationId，支持按 operationId 撤销。
2. `前端快照 diff`：前后对比 snapshot 推导变化，容易受并发影响，不采用。
3. `完整操作日志中心`：扩展性强但首版成本高，不采用。

采用理由：

- 反馈准确且可解释。
- 撤销实现可靠，边界清晰。
- 改动集中，能快速落地首版体验改进。

## 3. 架构与模块改动

### 3.1 Renderer（聊天页）

在发送入口保留现有流式链路，新增 ingest 反馈状态机，不阻塞首 token：

- 发送后异步等待 ingest 结果。
- 输入框上方展示反馈条：提取成功 / 未提取 / 提取失败。
- 成功且可撤销时显示“撤销”按钮。

状态建议：

- `hidden`
- `loading`
- `extracted`
- `no_match`
- `error`
- `undoing`
- `undone`

### 3.2 API 与 IPC

- `persona.ingestMessage` 从 `Promise<void>` 改为 `Promise<PersonaIngestResult>`。
- 新增 `persona.undoIngest`。
- 新增 IPC：`persona:undoIngest`。
- `persona:ingestMessage` handler 返回结果对象而非空。

### 3.3 Persona Service（主进程）

新增轻量操作日志（operation log）：

- 每次 ingest 产生 `operationId`。
- 记录本轮变更（新增/更新的偏好与事件）及回滚所需最小前态。
- `undoIngest(operationId)` 精准回滚该轮变更。
- 日志保留最近 N 条（建议 100）。

## 4. 数据结构设计

在 `src/shared/contracts.ts` 新增：

```ts
export type PersonaIngestResult = {
  operationId: string;
  observedAt: string;
  reason: "extracted" | "no_match" | "disabled";
  undoable: boolean;
  extracted: {
    preferencesAdded: string[];
    preferencesUpdated: string[];
    eventsAdded: string[];
    eventsUpdated: string[];
  };
};

export type PersonaUndoIngestPayload = {
  operationId: string;
};

export type PersonaUndoIngestResult = {
  ok: boolean;
  reverted: {
    preferences: number;
    events: number;
  };
  message: string;
};
```

接口改动：

- `ingestMessage(payload: PersonaIngestPayload): Promise<PersonaIngestResult>`
- `undoIngest(payload: PersonaUndoIngestPayload): Promise<PersonaUndoIngestResult>`

## 5. 交互与文案

反馈条位置：输入框上方。

状态文案建议：

- `extracted`：已提取 `X` 条偏好、`Y` 条事件。
- `no_match`：未提取（未检测到明确偏好或时间线索）。
- `error`：提取失败（不影响本次回复）。
- `undone`：已撤销本轮记忆变更。

行为细节：

- 默认 5 秒自动淡出，可手动关闭。
- 点击“撤销”进入 `undoing`，完成后展示 `undone`。
- 撤销失败显示轻量错误并保留当前反馈条。

## 6. 数据流

### 6.1 发送消息

1. 用户发送消息。
2. 聊天流式请求立即开始（不等待 ingest）。
3. 并发调用 `persona.ingestMessage`。
4. ingest 返回 `PersonaIngestResult`。
5. 前端据结果渲染反馈条并决定是否显示“撤销”。

### 6.2 撤销

1. 用户点击“撤销”。
2. 前端调用 `persona.undoIngest({ operationId })`。
3. 主进程按 operation log 回滚本轮变更。
4. 前端显示撤销结果。

## 7. 错误处理与边界

- ingest/undo 失败不得中断聊天主流程。
- operationId 不存在或过期时返回可读 message。
- 仅允许撤销本轮操作，不做跨轮联动回滚。
- fallback API 需返回兼容结构，避免 Web/Fallback 环境下接口不一致。

## 8. 实现范围（首版）

包含：

- 新增 ingest result / undo API / IPC。
- persona-service operation log 与回滚逻辑。
- 聊天页输入框上方反馈条与撤销交互。

不包含：

- 可视化全量记忆编辑器。
- 多步撤销栈与跨会话回滚。
- 复杂提取算法升级（本轮优先可见性与可控性）。

## 9. 测试计划

单测：

- `ingest -> result` 字段完整性。
- `ingest -> undo` 后 profile 恢复预期。
- `no_match` 返回原因正确。

集成：

- IPC `persona:ingestMessage` 与 `persona:undoIngest` 闭环。
- fallback API 与 runtime API 结构一致。

手测：

- 发送后反馈条出现与自动隐藏。
- 提取成功时撤销可用并生效。
- 提取失败不影响流式回复。
- Soul 模式关闭时不出现提取反馈。

## 10. 里程碑

1. 类型与 API 契约改造。  
2. persona-service 操作日志与撤销实现。  
3. IPC/preload/mu-api 联通。  
4. App 聊天页反馈条与撤销交互。  
5. 单测与手测回归。
