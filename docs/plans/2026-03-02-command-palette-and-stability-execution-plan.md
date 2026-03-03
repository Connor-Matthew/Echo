# Command Palette + 稳定性收口执行计划

日期：2026-03-02  
状态：已完成

## 1. 目标

在不改动现有核心业务链路（会话、流式、Agent、设置持久化）的前提下，完成一轮“可感知功能 + 结构收口”：

1. 新增全局 Command Palette（命令面板），提升键盘驱动效率。
2. 将命令筛选/匹配等纯逻辑抽离为独立 util，避免继续堆积在大组件中。
3. 增补对应单测并通过全量 typecheck/test。

## 2. 范围

### 2.1 本次包含

- `Cmd/Ctrl + K` 打开命令面板。
- 命令面板支持：
  - 新建 Chat 会话
  - 切换到 Chat / Agent / Settings
  - 直接打开设置分区（Provider / MCP / Chat / Memory / Skills / Environment / Theme / Data / Advanced）
  - 聚焦当前视图输入框（Chat 输入框 / Agent 输入框）
  - 收起/展开侧栏
- 命令过滤、排序、关键字高亮的纯函数封装。
- 新增 util 单测。

### 2.2 本次不包含

- 会话全文索引搜索
- 命令执行历史/最近命令
- 插件化命令注册机制
- IPC 协议调整

## 3. 里程碑

### Phase A：计划与基线

- 新建本执行文档。
- 确认现有测试基线可运行。

Done 标准：文档落地，可进入实现。

### Phase B：命令面板功能实现

- 新增命令面板组件与键盘交互（打开、关闭、方向键、回车执行）。
- 在 `AppView` 接线执行动作。

Done 标准：可从 UI 实际触发所有预设命令。

### Phase C：结构优化与测试

- 新增命令面板 util 模块。
- 新增 util 单测（过滤/排序/高亮/快捷键渲染）。

Done 标准：测试覆盖核心纯逻辑分支。

### Phase D：回归与收口

- 运行 `bun run typecheck`。
- 运行 `bun test`。
- 回填本文档执行结果。

Done 标准：验证全绿，文档状态更新为“已完成”。

## 4. 风险与缓解

- 风险：全局快捷键与输入框编辑冲突。  
  缓解：仅拦截 `Cmd/Ctrl + K`，不接管其他输入键位，保持原有编辑行为。

- 风险：命令动作破坏当前流式会话状态。  
  缓解：只调用现有 controller 公共动作，不绕过已有状态约束。

- 风险：组件新增导致主视图负担继续增大。  
  缓解：将筛选/匹配/高亮放在独立 util，主视图仅做命令定义与回调接线。

## 5. 回滚策略

- 命令面板相关改动集中在独立文件与 `AppView` 局部接线；如出现回归，可整体移除命令面板接线并保留其他稳定性改动。

## 6. 执行记录

- 2026-03-02：计划创建，进入 Phase B。
- 2026-03-02：完成命令面板功能实现。
  - 新增 `src/components/CommandPalette.tsx`
  - 新增 `src/components/command-palette/command-palette-utils.ts`
  - `src/features/app/AppView.tsx` 接入全局 `Cmd/Ctrl + K`、命令注册与动作执行
  - Chat/Agent 输入区增加 `data-chat-composer-root` / `data-agent-composer-root` 定位标记，支持“聚焦输入框”命令
- 2026-03-02：完成测试与回归。
  - 新增 `src/components/command-palette/command-palette-utils.test.ts`
  - `bun run typecheck` 通过
  - `bun test` 通过（44/44）
- 2026-03-02：完成第二轮增强（会话级命令 + 最近命令）。
  - 命令面板新增当前会话操作：重命名、删除、置顶、导出 JSON/Markdown、停止生成/运行
  - 命令面板新增会话快速切换：最近 Chat/Agent 会话直达
  - 新增最近命令持久化排序（localStorage），空查询时优先展示最近执行命令
  - 回归结果：`bun run typecheck` 通过，`bun test` 通过（45/45）
- 2026-03-02：完成第三轮增强（全局快捷键执行）。
  - 新增 `src/components/command-palette/shortcut-utils.ts`，统一快捷键匹配与平台识别
  - `src/features/app/AppView.tsx` 接入全局快捷键执行（与命令面板展示的 `shortcut` 一致）
  - 新增 `src/components/command-palette/shortcut-utils.test.ts`
  - 回归结果：`bun run typecheck` 通过，`bun test` 通过（49/49）
- 2026-03-02：完成第四轮增强（高频命令补齐）。
  - 新增命令：导出全部 Chat、清空全部 Chat（确认弹窗）、重置设置为默认值（确认弹窗）
  - 新增快捷键：`Cmd/Ctrl+Shift+N` 新建 Agent 会话
  - 回归结果：`bun run typecheck` 通过，`bun test` 通过（49/49）
- 2026-03-02：完成第五轮收口（命令构建逻辑从 AppView 外提）。
  - 新增 `src/features/app/build-command-palette-commands.ts`
  - `src/features/app/AppView.tsx` 改为调用构建器，减少入口文件内联命令定义复杂度
  - 行为不变，仅结构收敛
  - 回归结果：`bun run typecheck` 通过，`bun test` 通过（49/49）
- 2026-03-02：完成第六轮增强（会话内容检索命令）。
  - 新增 `src/features/app/command-palette-session-search.ts`，从最近消息提取检索关键词与预览摘要
  - `build-command-palette-commands` 的 Chat 会话切换命令接入内容关键词与消息摘要展示
  - 新增 `src/features/app/command-palette-session-search.test.ts`
  - 回归结果：`bun run typecheck` 通过，`bun test` 通过（52/52）
- 2026-03-02：完成第七轮收口（命令构建器测试防线）。
  - 新增 `src/features/app/build-command-palette-commands.test.ts`
  - 覆盖项：会话内容检索命令关键词注入、运行态 stop 命令、核心快捷键映射
  - 回归结果：`bun run typecheck` 通过，`bun test` 通过（55/55）
- 2026-03-02：完成第八轮增强（分组展示 + 最近标签可视化）。
  - 命令面板支持按 `group` 分组显示（导航/设置/会话等），并展示“最近执行优先”提示
  - 命令行项目增加“最近”标签，便于识别历史高频动作
  - 新增 `groupCommandPaletteItems` 及对应测试，保障分组稳定性
  - 回归结果：`bun run typecheck` 通过，`bun test` 通过（56/56）
- 2026-03-02：完成第九轮收口（输入态快捷键防误触）。
  - 新增 `isEditableEventTarget`：输入框/文本域/contenteditable 场景下拦截全局快捷键执行
  - 保留 `Cmd/Ctrl+K` 在任意焦点下可呼出命令面板
  - 新增对应测试覆盖输入态识别
  - 回归结果：`bun run typecheck` 通过，`bun test` 通过（57/57）
- 2026-03-02：完成第十轮增强（命令别名 + 英文容错检索）。
  - 命令模型新增 `aliases` 字段，关键命令补充拼音/首字母/英文别名
  - 搜索评分新增 `aliases` 参与匹配，并支持英文子序列模糊命中（如 `stngs` -> `settings`）
  - 新增对应测试：alias 命中、模糊命中、构建器别名覆盖
  - 回归结果：`bun run typecheck` 通过，`bun test` 通过（59/59）
