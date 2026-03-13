# 前端优化 A+B 执行计划（Design Tokens + 聊天可读性/性能）

日期：2026-03-08  
状态：执行中（Phase 0/1/2/3/4 已完成）

## 1. 目标

在不改变核心业务流程（会话管理、流式生成、Agent、设置持久化）的前提下，完成两条高收益前端优化：

1. A：设计 Token 统一 + 交互状态规范化（提升整体一致性）。
2. B：聊天区可读性提升 + 长会话性能优化（提升阅读体验与流畅度）。

## 2. 方案对比

1. 方案 A（快速样式补丁）
- 做法：仅修改少量页面样式与局部组件类名。
- 优点：最快见效。
- 缺点：不可持续，后续容易再次分叉。

2. 方案 B（采用）：Token-first 增量改造
- 做法：先建立统一 token 与交互规范，再把 Chat 可读性与性能按阶段落地。
- 优点：改动可控、复用性高、回归风险低。
- 缺点：前期需要先做一轮基线梳理。

3. 方案 C（全面设计系统重构）
- 做法：重做组件体系与页面结构。
- 优点：长期上限高。
- 缺点：周期长，当前不符合“快速推进新任务”的节奏。

## 3. 范围

### 3.1 本次包含

A. Design Tokens + 交互规范
- 定义并落地统一 token：`surface`、`border`、`shadow`、`radius`、`spacing`、`state`（hover/active/focus）。
- 替换核心页面与高频组件的硬编码样式值。
- 统一按钮、列表项、消息卡片、侧边栏项的交互状态表达。

B. 聊天可读性 + 性能
- 调整聊天正文宽度、段落/列表/代码块节奏。
- 统一代码块容器样式（含标题栏/复制按钮区域视觉一致性）。
- 优化长会话渲染：减少不必要重渲染，增加消息项 memo 化边界。
- 为超长消息列表引入渐进式性能策略（先做轻量优化，保留虚拟化扩展位）。

### 3.2 本次不包含

- 全量主题系统重做（仅做 token 收敛，不做品牌重绘）。
- 新增复杂动效系统（只统一现有动效节奏）。
- 彻底重构聊天渲染架构（本轮以增量优化为主）。

## 4. 里程碑与任务拆解

### Phase 0：基线与规范冻结

任务：
- 梳理当前关键页面的样式来源与重复值。
- 输出 token 命名与使用约定（light/dark 双态）。
- 确定本轮视觉验收基线截图点位（sidebar/chat/settings）。

Done 标准：
- token 清单完成，命名冻结。
- 回归截图点位明确。

### Phase 1：A-Token 落地（结构一致性）

任务：
- 新增 `src/styles/design-tokens.css`（或在现有样式入口统一声明 token）。
- 在 `src/index.css` 接入 token（含 `.dark` 覆盖）。
- 首批替换高频视图：
  - `src/features/app/AppView.tsx`
  - `src/components/Sidebar.tsx`
  - `src/components/ui/button.tsx`
  - `src/components/ui/card.tsx`

Done 标准：
- 不再新增裸写颜色/阴影/圆角 magic numbers。
- 核心容器与常用交互控件风格统一。

### Phase 2：A-交互状态规范化

任务：
- 统一 hover/active/focus ring 规则与透明度梯度。
- 对侧边栏项、会话卡片、设置项按钮统一状态表现。
- 统一过渡时长与 easing（例如 160/240/320ms 三档）。

Done 标准：
- 三类交互状态在主页面表现一致。
- 键盘焦点可见性明确且可访问。

### Phase 3：B-聊天可读性提升

任务：
- 优化消息正文阅读宽度与排版节奏：
  - `src/components/ChatView.tsx`
  - `src/components/chat/message-markdown-content.tsx`
- 统一代码块区块层级（背景、边框、标题栏、复制按钮位置）。
- 处理中英文混排与长代码行滚动体验。

Done 标准：
- 长文本阅读疲劳明显下降。
- 代码块视觉一致，复制操作易发现。

### Phase 4：B-长会话性能优化

任务：
- 对消息项做 memo 边界与稳定 key 检查，避免级联重渲染。
- 对 Markdown 渲染热点做缓存策略评估与落地。
- 大会话场景压测（消息 200/500）并记录耗时。
- 如必要，补“窗口化渲染预留层”（先留接口，不强行一次性重构）。

Done 标准：
- 大会话滚动与输入响应无明显卡顿。
- 关键交互帧率与响应时间较基线改善。

### Phase 5：回归与收口

任务：
- 运行 `bun run typecheck`。
- 运行 `bun test`。
- 完成手工回归（Chat/Agent/Settings + light/dark + sidebar 开合）。
- 更新计划文档状态与执行记录。

Done 标准：
- 自动化检查全绿。
- 关键路径无交互回归。

## 5. 验收指标

1. 一致性：
- 核心界面颜色/圆角/边框/阴影风格统一，无明显“拼接感”。

2. 可读性：
- 聊天正文与代码块阅读效率提升，用户可连续阅读长消息。

3. 性能：
- 长会话（>=200 条）滚动与输入稳定，交互延迟可接受。

4. 可维护性：
- 新 UI 开发优先使用 token，减少重复样式定义。

## 6. 风险与缓解

- 风险：样式统一改动面较大，容易引入视觉回归。  
  缓解：分阶段提交 + 截图对比 + 关键页面回归清单。

- 风险：性能优化改动可能影响流式体验。  
  缓解：先做无行为变更的 memo/缓存优化，再逐步引入窗口化方案。

- 风险：light/dark 双主题不一致。  
  缓解：token 定义阶段即双态成对设计，避免后补。

## 7. 建议执行顺序（推荐）

1. 先做 Phase 1 + Phase 2（A 完整落地，保证视觉基础稳定）。
2. 再做 Phase 3 + Phase 4（B 的阅读与性能优化）。
3. 最后 Phase 5 统一回归并收口。

## 8. 执行记录

- 2026-03-08：计划创建，待进入 Phase 0。
- 2026-03-08：完成 Phase 0（基线与 token 规范冻结）与 Phase 1（Token 首轮接入）。
  - 新增 `src/styles/design-tokens.css`（统一 shell/sidebar/card/button 相关 token）。
  - `src/index.css` 接入 tokens，并补充 `app-shell-frame` / `sidebar-surface` / `session-list-item` 等复用样式类。
  - `src/features/app/AppView.tsx` 切换到 token 化容器样式与列间距变量。
  - `src/components/Sidebar.tsx` 切换到 token 化交互样式（模式切换、导航项、会话项）。
  - `src/components/ui/button.tsx` 与 `src/components/ui/card.tsx` 接入统一交互/卡片 token 样式。
  - 验证通过：`bun run typecheck`、`bun test`、`bun run build`。
- 2026-03-08：完成 Phase 2（交互状态规范化）与 Phase 3（聊天可读性优化）。
  - `src/index.css` 新增统一交互过渡规则（nav/session/mode toggle/floating toggle）。
  - `src/components/Sidebar.tsx` 去除局部硬编码动效参数，改由 token 驱动。
  - `src/components/ChatView.tsx` 新增 token 化聊天列宽与消息气泡表面样式。
  - `src/components/chat/message-markdown-content.tsx` 优化标题/段落/列表节奏与代码块结构样式。
  - `src/styles/design-tokens.css` 增补 chat 阅读与代码块相关 tokens。
  - 验证通过：`bun run typecheck`、`bun test`、`bun run build`。
- 2026-03-08：完成 Phase 4（长会话性能优化，第一轮低风险项）。
  - `src/components/ChatView.tsx`：为 `MessageBubble` 增加 `React.memo` + 自定义 props comparator，避免非目标消息在流式过程中重复渲染。
  - `src/components/chat/message-markdown-content.tsx`：`MarkdownContent` 增加 `React.memo`，内容不变时跳过重复渲染。
  - 验证通过：`bun run typecheck`、`bun test`、`bun run build`。
