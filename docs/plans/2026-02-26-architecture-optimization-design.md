# 架构优化设计（增量版）

日期：2026-02-26  
状态：Phase A/B/C/D/E/F/G/H/I 已执行（增量）

## 1. 背景与问题

当前项目已具备较完整能力，但存在两个持续放大的架构痛点：

- `跨端重复逻辑`：`src/lib/mu-api.ts` 与 `electron/main.ts` 中存在同类 provider 解析逻辑重复实现。
- `App 入口过重`：`src/App.tsx` 同时承担 UI 编排、环境上下文构建与业务流程控制，维护成本高。

## 2. 目标

- 降低重复代码与跨端行为偏差风险。
- 把“可复用业务逻辑”从入口组件抽离到服务层。
- 在不改变现有用户行为的前提下完成结构升级。

## 3. 方案对比

1. `方案 A（采用）`：低风险增量重构（先抽共享工具和环境服务）。
2. `方案 B`：进一步拆 `App.tsx` 为 chat/agent/settings orchestration hooks。
3. `方案 C`：目录级大重组（feature-first + domain 层次重建）。

选择 A 的原因：

- 改动集中，可快速见效。
- 回归风险低，适合当前存在大量在途改动的工作树。
- 为 B/C 打下可验证的中间层基础。

## 4. Phase A 实施内容（已完成）

### 4.1 共享 provider 工具模块

新增 `src/shared/provider-utils.ts`，统一沉淀以下能力：

- `normalizeBaseUrl`
- `parseApiKeys`
- `resolveAnthropicEndpoint`
- `extractModelIds`
- `clampInteger`

并将 `src/lib/mu-api.ts` 与 `electron/main.ts` 接入该共享模块，移除重复实现。

### 4.2 环境快照服务抽离

新增 `src/lib/environment-snapshot.ts`，统一 Chat/Agent 的环境快照构建逻辑：

- 本地环境采集
- 系统状态合并
- 天气请求超时与 stale/fallback 处理

`src/App.tsx` 中的 Chat 与 Agent 路径均改为调用该服务，删除重复逻辑。

## 5. 验证结果

- `bun run typecheck` 通过。
- 本次重构不改变已有对外接口与交互行为。

## 6. Phase B 实施内容（已完成）

### 6.1 Orchestration hooks 拆分

新增：

- `src/features/chat/use-chat-orchestration.ts`
- `src/features/agent/use-agent-orchestration.ts`

`src/App.tsx` 已接入这两个 hook，原先的会话派生、模型选项派生与设置写回编排已从入口组件中迁移。

## 7. Phase C 实施内容（已完成）

### 7.1 domain 分层骨架

新增：

- `src/domain/provider/utils.ts`
- `src/domain/environment/load-snapshot.ts`

并保留旧路径兼容导出：

- `src/shared/provider-utils.ts`（re-export 到 domain）
- `src/lib/environment-snapshot.ts`（re-export 到 domain）

### 7.2 接入调整

- `electron/main.ts` 与 `src/lib/mu-api.ts` 改为直接依赖 `src/domain/provider/utils.ts`。
- `src/App.tsx` 改为直接依赖 `src/domain/environment/load-snapshot.ts`。

## 8. 后续建议

1. 继续拆 `App.tsx` 里长流程（`sendFromBaseMessages`、`sendAgentMessage`）到 chat/agent service。
2. 拆 `electron/main.ts` 的 provider streaming parser 为独立模块。
3. 为 `domain/provider` 与 `domain/environment` 增加最小单测，锁定跨端行为一致性。

## 9. Phase D 实施内容（已完成）

### 9.1 消息发送主流程服务化

新增：

- `src/features/chat/services/send-from-base-messages.ts`
- `src/features/agent/services/run-agent-message.ts`

两条主流程（Chat 流式发送与 Agent 运行）已从 `App.tsx` 抽离到 feature service 层，`App.tsx` 现在仅保留输入校验、状态连接与服务调用。

## 10. Phase E 实施内容（已完成）

### 10.1 Electron stream/parser 模块拆分

新增：

- `electron/chat/stream-parser-utils.ts`

迁移能力：

- OpenAI/Anthropic delta 文本解析
- OpenAI/Anthropic/Generic usage 解析
- provider usage / usage-missing 日志输出

`electron/main.ts` 现通过该模块导入并复用上述能力，主文件中对应 parser/usage 工具函数已移除，stream 主流程结构更聚焦。

## 11. Phase F 实施内容（已完成）

### 11.1 Electron stream runner 工厂化拆分

新增：

- `electron/chat/stream-runners/openai.ts`
- `electron/chat/stream-runners/anthropic.ts`
- `electron/chat/stream-runners/acp.ts`

迁移能力：

- OpenAI-compatible streaming + MCP tool call 循环
- Anthropic streaming 主循环
- ACP(Codex) streaming 主循环

`electron/main.ts` 由“实现细节承载者”收敛为“依赖装配与路由入口”：通过 `createStreamOpenAICompatible / createStreamAnthropic / createStreamCodexAcp` 注入依赖并调用，降低主文件复杂度与后续测试替换成本。

## 12. Phase G 实施内容（已完成）

### 12.1 MemOS 客户端模块抽离

新增：

- `electron/memos/memos-client.ts`

迁移能力：

- MemOS 搜索：`searchMemosMemory`
- MemOS 写入：`addMemosMessage`
- MemOS 连通性测试：`testMemosConnection`
- 相关 payload 解析、超时请求与错误归一化逻辑

`electron/main.ts` 中 MemOS 相关长逻辑已下沉到独立模块，IPC handler 保持原有签名与行为，仅负责调用。

## 13. Phase H 实施内容（已完成）

### 13.1 消息格式化与附件处理下沉

新增：

- `electron/chat/message-formatters.ts`

迁移能力：

- OpenAI stream message content 构建（含文本/图片附件转换）
- Anthropic content blocks 构建（含 data URL base64 解析）
- ACP turn message 格式化

`electron/main.ts` 不再承载这些 message/attachment 转换细节，继续收敛为装配和 IPC 路由层。

### 13.2 最小回归测试补齐

新增：

- `electron/chat/stream-parser-utils.test.ts`
- `electron/memos/memos-client.test.ts`

覆盖点：

- OpenAI/Anthropic/Generic usage 解析与 token 归一化
- MemOS search/add/test 的关键分支（禁用、空查询、成功解析、空消息拦截）

验证结果：

- `bun run typecheck` 通过
- `bun test electron/chat/stream-parser-utils.test.ts electron/memos/memos-client.test.ts` 9/9 通过

## 14. Phase I 实施内容（已完成）

### 14.1 IPC 注册按业务域模块化

新增：

- `electron/ipc/register-settings-handlers.ts`
- `electron/ipc/register-environment-handlers.ts`
- `electron/ipc/register-storage-handlers.ts`
- `electron/ipc/register-persona-handlers.ts`
- `electron/ipc/register-memos-handlers.ts`
- `electron/ipc/register-chat-handlers.ts`

重构结果：

- `electron/main.ts` 中超长 `registerIpcHandlers` 已拆为“聚合注册器”，仅负责依赖装配。
- handler 的 channel 名、输入输出类型与行为保持不变。
- `skills:scanClaude` 保留原逻辑，但改为可注入函数，便于后续测试替换。

验证结果：

- `bun run typecheck` 通过
- `bun test electron/chat/stream-parser-utils.test.ts electron/memos/memos-client.test.ts` 9/9 通过
