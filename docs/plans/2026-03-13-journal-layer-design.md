# 第三层日记系统设计

日期：2026-03-13
状态：待实现

## 1. 目标

在现有 `memory.md → SOUL.md` 演化链之外，新增第三层本地文件：`journal/YYYY-MM-DD.md`。

每天 22:00 基于当天对话自动生成一篇 AI 视角的今日手记，风格主观、有情绪、像真的在回望自己的一天。不注入主聊天上下文，只供用户在设置页回看。

## 2. 文件结构

```
~/.echo/memory/
├── soul.md
├── memory.md
├── soul-state.json
└── journal/
    ├── 2026-03-13.md
    ├── 2026-03-14.md
    └── ...
```

`soul-state.json` 新增字段：

```json
{
  "lastJournalDate": "2026-03-13"
}
```

## 3. 触发逻辑

- 每天 **22:00** 检测：若当天有普通聊天用户消息，且 `lastJournalDate` 不等于今日日期，触发生成
- 若 22:00 时 app 未运行，下次启动后补做一次
- 已生成的日期不重复生成（幂等）

## 4. 生成输入与提示词

**输入材料**

1. 当天用户消息（按 `createdAt` 筛选今日）
2. 当前 `memory.md`（提供稳定自我背景）
3. 当前 `SOUL.md`（提供人格底色）

**提示词方向**

- 第一人称散文为主体，情绪高点或关键洞察处切换为更短、更碎的表达
- 允许：主观偏好、情绪波动、重要性排序、自我误读或自我修正
- 不要：干燥总结、逐条列举对话、假装客观
- 复用 `getSoulAutomationSettingsCandidates` 的渠道选择与静默回退逻辑

## 5. 后端实现

### soul-service.ts 新增

```typescript
const JOURNAL_DIR = "journal";

export const getJournalEntry = async (date: string): Promise<string | null>
export const saveJournalEntry = async (date: string, markdown: string): Promise<void>
export const listJournalDates = async (): Promise<string[]>  // 倒序
```

### soul-automation.ts 新增

```typescript
export const JOURNAL_SCHEDULE_HOUR = 22;

export const buildJournalMessages = (
  todayMessages: SoulTrackedUserMessage[],
  memoryMarkdown: string,
  soulMarkdown: string
): ChatStreamRequest["messages"]

export const getTodayDateString = (now: Date): string  // "YYYY-MM-DD"
```

### register-soul-handlers.ts 新增 IPC

- `soul:get-journal-entry` — 读取指定日期日记
- `soul:list-journal-dates` — 获取日期列表（倒序）

### use-app-controller.ts

- 在现有 SOUL 定时调度逻辑旁，注册 22:00 journal 检测定时器
- 启动时补做逻辑：若 `lastJournalDate` 不等于今日且今日有消息且当前时间 >= 22:00，立即触发

## 6. UI 实现

### 设置页新增"日记"选项卡

位置：`SettingsCenterView.tsx`，与 SOUL、通用配置并列。

**布局**

```
┌─────────────────────────────────────┐
│  日记                                │
├──────────────┬──────────────────────┤
│ 2026-03-13   │                      │
│ 2026-03-12   │  [选中日期的日记内容]  │
│ 2026-03-11   │                      │
│ 2026-03-10   │  Markdown 渲染        │
│  ...         │  复用 MarkdownContent │
└──────────────┴──────────────────────┘
```

- 左侧：日期列表，倒序，点击切换，默认选中最新一篇
- 右侧：日记正文，复用现有 `MarkdownContent` 组件渲染
- 当天无日记（22:00 前）：显示"今日手记将在 22:00 自动生成"
- 历史为空：显示"还没有日记，今天的对话结束后会自动生成第一篇"

**不包含**：编辑、删除、导出

## 7. 风险与边界

- 当天消息为空时不生成日记，避免产出无意义内容
- 日记生成失败静默处理，不影响主聊天与 SOUL 演化链
- 日记直接覆盖当日文件，不保留历史版本
- 渠道选择复用 `getSoulAutomationSettingsCandidates`，优先 SOUL 演化渠道，失败回退当前模型
