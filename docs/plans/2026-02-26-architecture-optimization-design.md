# 架构优化设计（增量版）

日期：2026-02-26  
状态：Phase A/B/C/D/E/F/G/H/I/J/K/L/M/N/O/P 已执行（增量）

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

## 15. Phase J 实施内容（已完成）

### 15.1 domain 层最小单测补齐

新增：

- `src/domain/provider/utils.test.ts`
- `src/domain/environment/load-snapshot.test.ts`

覆盖点：

- provider 工具：baseUrl 归一化、api key 去重解析、Anthropic endpoint 归一化、model id 提取与排序、整数 clamp 逻辑。
- environment 快照：空城市跳过天气查询、天气超时回退 stale、查询失败回退 unavailable。

### 15.2 environment 快照可测性增强（不改默认行为）

调整：

- `src/domain/environment/load-snapshot.ts` 增加可选依赖注入参数（`collectLocalContext/buildUnavailable/toStaleFromPrevious/setTimeoutFn/clearTimeoutFn`）。
- 运行时默认仍使用现有实现，仅为单测与后续替换提供注入点。

验证结果：

- `bun run typecheck` 通过
- `bun test` 17/17 通过

## 16. Phase K 实施内容（已完成）

### 16.1 Controller helper 下沉与单测补齐

新增：

- `src/features/app/controller-helpers.ts`
- `src/components/settings/controller-helpers.ts`
- `src/features/app/controller-helpers.test.ts`
- `src/components/settings/controller-helpers.test.ts`

重构结果：

- `src/features/app/use-app-controller.ts` 中 `withPersistedAutoDetectedCapabilities`、`mergeRuntimeAgentMessageDecorations` 已迁移到 helper 模块。
- `src/components/settings/use-settings-center-controller.ts` 中 providerType 归一化、MCP 状态映射、状态消息拼接逻辑已迁移到 helper 模块。

### 16.2 ChatView/Composer 拆分续进（第一刀）

新增：

- `src/components/composer/paste-utils.ts`
- `src/components/composer/paste-utils.test.ts`

重构结果：

- `src/components/Composer.tsx` 中粘贴文本转文件的判断、扩展名推断与文件构造逻辑已下沉到独立模块。
- 维持原有交互行为，仅做结构拆分与可测化。

验证结果：

- `bun run typecheck` 通过
- `bun test` 27/27 通过

## 17. Phase L 实施内容（已完成）

### 17.1 ChatView 滚动跟随状态抽离

新增：

- `src/components/chat/use-chat-scroll-follow.ts`

重构结果：

- `src/components/ChatView.tsx` 中滚轮滚动、自动跟随、流式尾随、resize 跟随、会话切换重置等 scroll/cinematic 状态编排已下沉到独立 hook。
- `ChatView` 组件收敛为“渲染 + hook 接线”，保留原 UI 与交互行为。

### 17.2 最小测试补齐

新增：

- `src/components/chat/use-chat-scroll-follow.test.ts`

覆盖点：

- 活跃 assistant 消息识别（仅在生成中返回最新 assistant id）。
- 非流式与流式场景下 follow target 计算边界。

验证结果：

- `bun run typecheck` 通过
- `bun test` 31/31 通过

## 18. Phase M 实施内容（已完成）

### 18.1 ChatView agent tool 纯逻辑下沉

新增：

- `src/components/chat/agent-tool-render-helpers.ts`

重构结果：

- `src/components/ChatView.tsx` 中 agent tool render items 构建、pending 状态判定、inline anchor group 计算逻辑已迁移到 helper 模块。
- `MessageBubble` 中保留渲染与本地交互状态，减少大组件中的纯计算代码密度。

### 18.2 最小测试补齐

新增：

- `src/components/chat/agent-tool-render-helpers.test.ts`

覆盖点：

- progress tool 识别。
- TodoWrite + progress steps 的分组行为。
- single/group 两类 pending 判定。
- anchor group 计算与 content 长度 clamp。

验证结果：

- `bun run typecheck` 通过
- `bun test` 36/36 通过

## 19. Phase N 实施内容（已完成）

### 19.1 Composer 面板状态编排下沉

新增：

- `src/components/composer/use-composer-panels.ts`

重构结果：

- `src/components/Composer.tsx` 中 quick settings / MCP popover / skills picker 的开关状态与 outside-click/Escape 关闭逻辑已迁移到独立 hook。
- slash command 输入识别从组件内联逻辑收敛为 `updateSkillsQueryFromInput`。

### 19.2 最小测试补齐

新增：

- `src/components/composer/use-composer-panels.test.ts`

覆盖点：

- slash command 查询提取规则（纯命令输入提取 query，非命令输入返回 null）。

验证结果：

- `bun run typecheck` 通过
- `bun test` 38/38 通过

## 20. Phase O 实施内容（已完成）

### 20.1 Composer skills 交互逻辑下沉

新增：

- `src/components/composer/use-composer-skills.ts`

重构结果：

- `src/components/Composer.tsx` 中 skills 过滤、选择、参数确认、slash command 键盘导航逻辑迁移到独立 hook。
- `use-composer-panels.ts` 收敛为面板状态管理（quick settings / MCP / skills picker）职责，减少 hook 间职责交叉。

### 20.2 最小测试补齐

新增：

- `src/components/composer/use-composer-skills.test.ts`

覆盖点：

- slash 命令前缀清洗（`/command ...` -> 输入正文）。
- skill 参数默认值 map 构建。

验证结果：

- `bun run typecheck` 通过
- `bun test` 40/40 通过

## 21. Phase P 实施内容（已完成）

### 21.1 ChatView agent tool 渲染组件化

调整：

- `src/components/ChatView.tsx` 新增 `AgentToolItems` 子组件。
- `MessageBubble` 内原 `renderAgentToolItems` 内联渲染函数移除，改为 `<AgentToolItems />` 组合调用（inline/non-inline 两条路径统一）。

重构结果：

- `MessageBubble` 继续降复杂度，渲染逻辑层次更清晰。
- 保持现有 UI 与交互行为，不改工具调用渲染语义。

验证结果：

- `bun run typecheck` 通过
- `bun test` 40/40 通过

## 22. Phase Q 实施内容（已完成）

### 22.1 ChatView agent tool 子组件外提

新增：

- `src/components/chat/agent-tool-items.tsx`

重构结果：

- `src/components/ChatView.tsx` 中 `AgentToolItems / AgentToolCallRow / AgentTodoProgressGroup / ToolStatusIcon` 已迁移到独立模块。
- `ChatView` 继续收敛为“消息态编排 + 视图组合”，减少单文件内嵌渲染层级。

### 22.2 Composer UI 片段组件化续进

新增：

- `src/components/composer/skills-slash-popover.tsx`
- `src/components/composer/skill-param-form.tsx`
- `src/components/composer/mcp-picker-popover.tsx`
- `src/components/composer/skills-picker-popover.tsx`

重构结果：

- `src/components/Composer.tsx` 中 slash command 技能弹层、skill 参数表单、MCP/技能选择弹层已全部下沉为独立子组件。
- 主组件保留输入状态与动作接线，降低 JSX 体积与认知复杂度。

验证结果：

- `bun run typecheck` 通过
- `bun test` 40/40 通过

## 23. Phase R 实施内容（已完成）

### 23.1 ChatView 编辑面板与消息动作组件化

新增：

- `src/components/chat/message-edit-panel.tsx`
- `src/components/chat/message-action-bar.tsx`

重构结果：

- `src/components/ChatView.tsx` 中用户编辑态面板（文本编辑、拖拽上传、附件预览/删除、保存取消操作）已下沉到 `MessageEditPanel`。
- 消息底部操作区（复制/编辑/重发/删除）已下沉到 `MessageActionBar`。
- `MessageBubble` 进一步收敛为状态组合与事件接线，减少内联 JSX 深度。

验证结果：

- `bun run typecheck` 通过
- `bun test` 40/40 通过

## 24. Phase S 实施内容（已完成）

### 24.1 Composer 激活上下文标签区组件化

新增：

- `src/components/composer/active-context-badges.tsx`

重构结果：

- `src/components/Composer.tsx` 中 active skill 与 active MCP 标签渲染逻辑已下沉到 `ActiveContextBadges`。
- 主组件继续聚焦输入、面板开关与提交动作接线，减少展示细节内联。

验证结果：

- `bun run typecheck` 通过
- `bun test` 40/40 通过

## 25. Phase T 实施内容（已完成）

### 25.1 ChatView 附件与 usage 展示条组件化

新增：

- `src/components/chat/message-attachment-list.tsx`
- `src/components/chat/message-usage-stats.tsx`

重构结果：

- `src/components/ChatView.tsx` 中消息附件标签展示与 usage 指标展示已下沉为独立组件。
- `MessageBubble` 进一步聚焦状态编排与组合调用。

### 25.2 Composer 上下文窗口弹层组件化

新增：

- `src/components/composer/context-window-popover.tsx`

重构结果：

- `src/components/Composer.tsx` 中 quick settings 的上下文窗口 slider 弹层已下沉为 `ContextWindowPopover`。
- `Composer` 主组件继续收敛为输入态和事件接线职责。

验证结果：

- `bun run typecheck` 通过
- `bun test` 40/40 通过

## 26. Phase U 实施内容（已完成）

### 26.1 ChatView 折叠信息区组件化续进

新增：

- `src/components/chat/message-tool-calls-panel.tsx`
- `src/components/chat/message-reasoning-panel.tsx`

重构结果：

- `src/components/ChatView.tsx` 中非 agent 模式的 toolCalls 折叠面板与 reasoning 折叠面板已下沉为独立组件。
- `MessageBubble` 继续聚焦 message 状态编排、内容分段与动作接线。

### 26.2 Composer 能力/usage 展示组件化

新增：

- `src/components/composer/capability-indicators.tsx`

重构结果：

- `src/components/Composer.tsx` 中能力图标组与 usage label 展示逻辑已下沉到 `CapabilityIndicators`。
- `Composer` 主组件进一步减少展示层内联渲染。

验证结果：

- `bun run typecheck` 通过
- `bun test` 40/40 通过
