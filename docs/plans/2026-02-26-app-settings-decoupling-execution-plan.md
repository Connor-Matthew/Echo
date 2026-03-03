# App / SettingsCenter 解耦重组执行计划

日期：2026-02-26  
状态：Phase A/B/C 已执行（2026-03-02 完成收口）

## 1. 目标与范围

本次只处理两项：

1. `src/App.tsx` 入口解耦（超大入口拆分）
2. `src/components/SettingsCenter.tsx` 解耦（超大设置页拆分）

不在本次范围：

- 功能新增
- 业务规则重写
- IPC 协议调整
- Provider 行为改动

## 2. 成功标准（Done）

- `App` 变为薄入口，状态/副作用/业务动作迁移到 controller hook。
- `SettingsCenter` 的状态与动作从视图中抽离，重型子块拆分到独立模块。
- 原有交互行为保持一致（会话、发送、Agent、设置保存、MCP 操作等）。
- `bun run typecheck` 通过。
- `bun test` 通过。

## 3. 交付物

- 新文档：本计划文件
- 新代码结构：
  - `src/features/app/use-app-controller.ts`
  - `src/features/app/AppView.tsx`
  - `src/components/settings/use-settings-center-controller.ts`
  - `src/components/settings/SettingsCenterView.tsx`
- 入口文件降复杂度：
  - `src/App.tsx`
  - `src/components/SettingsCenter.tsx`

## 4. 分阶段执行

### Phase A: App 解耦

- 提取 `useAppController`：
  - 持有状态、副作用、事件动作、服务调用。
- 提取 `AppView`：
  - 仅负责布局与组件编排。
- `App.tsx`：
  - 改为薄入口导出。

验收：`App` 不再包含业务流程实现细节。

### Phase B: SettingsCenter 解耦

- 提取 `useSettingsCenterController`：
  - 承载 draft、异步动作、校验与派生状态。
- 提取 `SettingsCenterView`：
  - 仅视图层。
- 提取 `McpServerList`：
  - MCP 表单和列表独立组件。
- `SettingsCenter.tsx`：
  - 改为薄入口导出。

验收：`SettingsCenter` 不再混合状态编排与全部 UI 细节。

### Phase C: 回归验证

- 执行 `bun run typecheck`
- 执行 `bun test`
- 修复拆分导致的类型与依赖问题。

## 5. 风险与应对

- 风险：拆分后 props 传递遗漏，导致运行时行为偏差。  
  应对：先机械迁移，后逐项类型校验与最小回归测试。

- 风险：hook 依赖数组变化引发行为回归。  
  应对：保持原依赖声明，不做语义优化。

- 风险：大文件拆分期间 merge 冲突概率上升。  
  应对：只做结构迁移，避免同时改业务逻辑。

## 6. 回滚策略

- 每个 Phase 独立完成并通过 typecheck 后再进入下一阶段。
- 若某阶段出现不可控回归：回退该阶段新增文件并恢复对应入口文件。

## 7. 后续建议（本次不做）

- 继续拆分 `ChatView` 与 `Composer` 的滚动/动画/交互状态。
- 引入 `settings` 子域组件分包（provider/chat/memory/environment/theme）。
- 增加 `App controller` 与 `Settings controller` 的单测覆盖。

## 8. 执行收口记录（2026-03-02）

- 已完成 `McpServerList` 独立模块抽离：
  - 新增 `src/components/settings/McpServerList.tsx`
  - `src/components/settings/SettingsCenterView.tsx` 改为引用该模块，移除内联实现
- 验证结果：
  - `bun run typecheck` 通过
  - `bun test` 通过（9/9）

## 9. 执行续进记录（2026-03-02）

- `App/Settings` controller 可测化下沉：
  - 新增 `src/features/app/controller-helpers.ts`
  - 新增 `src/components/settings/controller-helpers.ts`
  - `use-app-controller` / `use-settings-center-controller` 改为复用 helper，减少超大 hook 内嵌纯逻辑
- `Composer` 交互逻辑拆分第一刀（粘贴处理）：
  - 新增 `src/components/composer/paste-utils.ts`
  - `src/components/Composer.tsx` 改为引用 `paste-utils`
- 新增测试：
  - `src/features/app/controller-helpers.test.ts`
  - `src/components/settings/controller-helpers.test.ts`
  - `src/components/composer/paste-utils.test.ts`
- 验证结果：
  - `bun run typecheck` 通过
  - `bun test` 通过（27/27）

## 10. 执行续进记录（2026-03-02）

- `ChatView` 滚动/动画状态拆分（第一刀）：
  - 新增 `src/components/chat/use-chat-scroll-follow.ts`
  - `src/components/ChatView.tsx` 改为接入 `useChatScrollFollow`，移除内联滚动跟随 effect 与状态 ref
- 新增测试：
  - `src/components/chat/use-chat-scroll-follow.test.ts`
  - 覆盖活跃 assistant 消息识别、streaming follow target 计算等关键 helper 逻辑
- 验证结果：
  - `bun run typecheck` 通过
  - `bun test` 通过（31/31）

## 11. 执行续进记录（2026-03-02）

- `ChatView` agent tool timeline 逻辑拆分（第二刀）：
  - 新增 `src/components/chat/agent-tool-render-helpers.ts`
  - `src/components/ChatView.tsx` 改为复用 helper，移除内联的 tool 分组、pending 判定与 anchor offset 计算逻辑
- 新增测试：
  - `src/components/chat/agent-tool-render-helpers.test.ts`
  - 覆盖 progress 判定、TodoWrite 分组、pending 判定、anchor group clamp
- 验证结果：
  - `bun run typecheck` 通过
  - `bun test` 通过（36/36）

## 12. 执行续进记录（2026-03-02）

- `Composer` 面板状态编排拆分（第二刀）：
  - 新增 `src/components/composer/use-composer-panels.ts`
  - `src/components/Composer.tsx` 改为复用该 hook，移除内联 `quick settings / mcp popover / skills picker` 外部点击关闭 effect
  - 输入框 slash command 解析改为通过 hook 的 `updateSkillsQueryFromInput` 统一处理
- 新增测试：
  - `src/components/composer/use-composer-panels.test.ts`
  - 覆盖 slash command 查询解析逻辑
- 验证结果：
  - `bun run typecheck` 通过
  - `bun test` 通过（38/38）

## 13. 执行续进记录（2026-03-02）

- `Composer` skills 交互流程拆分（第三刀）：
  - 新增 `src/components/composer/use-composer-skills.ts`
  - `src/components/Composer.tsx` 改为复用该 hook，`selectSkill / confirmSkillParams / skills 键盘导航` 从组件内联逻辑下沉
  - `use-composer-panels` 收敛为纯面板开关/关闭职责
- 新增测试：
  - `src/components/composer/use-composer-skills.test.ts`
  - 覆盖 slash 命令输入清洗、skill 参数默认值构建
- 验证结果：
  - `bun run typecheck` 通过
  - `bun test` 通过（40/40）

## 14. 执行续进记录（2026-03-02）

- `ChatView` 消息气泡内 agent tool 渲染块继续解耦（第三刀）：
  - `src/components/ChatView.tsx` 新增 `AgentToolItems` 子组件
  - 原 `MessageBubble` 内联 `renderAgentToolItems` 函数已移除，改为组件化调用
- 结果：
  - `MessageBubble` 聚焦内容/附件/usage 展示，agent tool 列表渲染结构下沉
- 验证结果：
  - `bun run typecheck` 通过
  - `bun test` 通过（40/40）

## 15. 执行续进记录（2026-03-02）

- `ChatView` agent tool 组件继续外提（第四刀）：
  - 新增 `src/components/chat/agent-tool-items.tsx`
  - `AgentToolItems / AgentToolCallRow / AgentTodoProgressGroup / ToolStatusIcon` 从 `src/components/ChatView.tsx` 迁移至 `chat` 子目录
  - `src/components/ChatView.tsx` 改为仅保留状态编排与组件调用
- `Composer` UI 片段继续组件化（第四刀）：
  - 新增 `src/components/composer/skills-slash-popover.tsx`
  - 新增 `src/components/composer/skill-param-form.tsx`
  - 新增 `src/components/composer/mcp-picker-popover.tsx`
  - 新增 `src/components/composer/skills-picker-popover.tsx`
  - `src/components/Composer.tsx` 中 slash 技能弹层、技能参数表单、MCP/技能选择弹层改为独立子组件接线
- 结果：
  - `ChatView` 与 `Composer` 主组件继续降复杂度，保持行为不变
- 验证结果：
  - `bun run typecheck` 通过
  - `bun test` 通过（40/40）

## 16. 执行续进记录（2026-03-02）

- `ChatView` 编辑态与动作区继续拆分（第五刀）：
  - 新增 `src/components/chat/message-edit-panel.tsx`
  - 新增 `src/components/chat/message-action-bar.tsx`
  - `src/components/ChatView.tsx` 的用户消息编辑面板（含附件编辑列表）改为 `MessageEditPanel`
  - `src/components/ChatView.tsx` 底部消息操作按钮组（复制/编辑/重发/删除）改为 `MessageActionBar`
- 结果：
  - `MessageBubble` 继续聚焦状态与数据编排，减少大块 JSX 内联渲染
  - 所有交互与视觉样式保持不变
- 验证结果：
  - `bun run typecheck` 通过
  - `bun test` 通过（40/40）

## 17. 执行续进记录（2026-03-02）

- `Composer` 激活上下文标签区继续组件化（第五刀）：
  - 新增 `src/components/composer/active-context-badges.tsx`
  - `src/components/Composer.tsx` 中 active skill 与 active MCP 标签渲染改为 `ActiveContextBadges` 组件
- 结果：
  - `Composer` 主组件进一步收敛为状态与事件编排
  - 展示层职责继续下沉，行为保持不变
- 验证结果：
  - `bun run typecheck` 通过
  - `bun test` 通过（40/40）

## 18. 执行续进记录（2026-03-02）

- `ChatView` 展示区继续组件化（第六刀）：
  - 新增 `src/components/chat/message-attachment-list.tsx`
  - 新增 `src/components/chat/message-usage-stats.tsx`
  - `src/components/ChatView.tsx` 中附件展示条与 usage 展示条改为独立子组件
- `Composer` quick settings 弹层继续组件化（第六刀）：
  - 新增 `src/components/composer/context-window-popover.tsx`
  - `src/components/Composer.tsx` 中上下文窗口滑块弹层改为 `ContextWindowPopover`
- 结果：
  - `ChatView` 与 `Composer` 主组件继续收敛，展示逻辑下沉，行为不变
- 验证结果：
  - `bun run typecheck` 通过
  - `bun test` 通过（40/40）

## 19. 执行续进记录（2026-03-02）

- `ChatView` 折叠信息区继续组件化（第七刀）：
  - 新增 `src/components/chat/message-tool-calls-panel.tsx`
  - 新增 `src/components/chat/message-reasoning-panel.tsx`
  - `src/components/ChatView.tsx` 中 toolCalls 与 reasoning 折叠块改为独立子组件
- `Composer` 能力与 usage 展示区继续组件化（第七刀）：
  - 新增 `src/components/composer/capability-indicators.tsx`
  - `src/components/Composer.tsx` 中能力图标区与 usage 文本区改为 `CapabilityIndicators`
- 结果：
  - 两个主组件继续收敛为状态与流程编排层
  - 展示逻辑进一步下沉，行为保持一致
- 验证结果：
  - `bun run typecheck` 通过
  - `bun test` 通过（40/40）

## 20. 执行续进记录（2026-03-03）

- `ChatView` Markdown 渲染模块继续下沉（第八刀）：
  - 新增 `src/components/chat/message-markdown-content.tsx`
  - `src/components/ChatView.tsx` 中代码块复制、markdown 组件映射与渲染入口改为引用 `MarkdownContent`
- 结果：
  - `ChatView` 主文件继续收敛为消息状态编排与组合接线
  - markdown 展示细节与复制交互集中到 `chat` 子模块，行为保持不变
- 验证结果：
  - `bun run typecheck` 通过
  - `bun test` 通过（59/59）

## 21. 执行续进记录（2026-03-03）

- `AppController` 权限队列纯逻辑继续下沉（第九刀）：
  - `src/features/app/controller-helpers.ts` 新增 `PendingAgentPermission` 相关 helper：
    - `removeAgentPermissionQueueItems`
    - `enqueueAgentPermissionFromEnvelope`
    - `markAgentPermissionResolving`
    - `buildAgentPermissionResolutionMessage`
  - `src/features/app/use-app-controller.ts` 中 Agent permission 队列的过滤/入队/resolving 标记与决策文案改为调用 helper
- 新增测试：
  - `src/features/app/controller-helpers.test.ts` 增补 permission queue helper 覆盖（去重、过滤、状态标记、决策文案）
- 结果：
  - `use-app-controller` 继续收敛为状态与副作用接线层
  - 队列处理逻辑集中且可测化，行为保持不变
- 验证结果：
  - `bun run typecheck` 通过
  - `bun test` 通过（62/62）

## 22. 执行续进记录（2026-03-03）

- `ChatView` 流式内容 reveal 逻辑下沉（第十刀）：
  - 新增 `src/components/chat/use-stream-revealed-content.ts`
  - `src/components/ChatView.tsx` 中 assistant 文本渐进展示的状态/ref/effect 改为调用 `useStreamRevealedContent`
  - 移除 `ChatView` 内 `STREAM_REVEAL_*` 常量与对应动画 effect 实现
- 新增测试：
  - `src/components/chat/use-stream-revealed-content.test.ts`
  - 覆盖 reveal 速度分档与 step/carry 计算边界
- 结果：
  - `MessageBubble` 继续收敛为状态编排与组件组合
  - 流式文本展示逻辑集中在独立 hook，行为保持不变
- 验证结果：
  - `bun run typecheck` 通过
  - `bun test` 通过（64/64）

## 23. 执行续进记录（2026-03-03）

- `AppController` 附件添加流程去重（第十一刀）：
  - `src/features/app/controller-helpers.ts` 新增：
    - `normalizeIncomingDraftFiles`
    - `summarizeBlockedAttachmentMessages`
  - `src/features/app/use-app-controller.ts` 新增内部共用流程 `addDraftLikeFiles`，`addFiles`/`addAgentFiles` 改为调用同一条路径
- 新增测试：
  - `src/features/app/controller-helpers.test.ts` 增补 draft 文件标准化与 blocked message 汇总测试
- 结果：
  - `use-app-controller` 继续收敛，减少重复分支代码
  - Chat 与 Agent 附件添加行为保持一致且不变
- 验证结果：
  - `bun run typecheck` 通过
  - `bun test` 通过（65/65）

## 24. 执行续进记录（2026-03-03）

- `AppController` 附件移除逻辑去重（第十二刀）：
  - `src/features/app/controller-helpers.ts` 新增 `removeAttachmentById`
  - `src/features/app/use-app-controller.ts` 中 `removeAttachment`/`removeAgentAttachment` 改为复用 helper，再统一调用 `revokeAttachmentPreview`
- 新增测试：
  - `src/features/app/controller-helpers.test.ts` 增补 `removeAttachmentById` 行为覆盖（命中/未命中）
- 结果：
  - `use-app-controller` 重复分支继续减少
  - Chat 与 Agent 附件移除行为保持不变
- 验证结果：
  - `bun run typecheck` 通过
  - `bun test` 通过（66/66）
