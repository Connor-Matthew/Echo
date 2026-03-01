# App / SettingsCenter 解耦重组执行计划

日期：2026-02-26  
状态：执行中

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
