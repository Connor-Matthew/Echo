# Echo 架构分析与渐进式重构计划

> 更新日期：2026-03-17
> 当前分支：`codex/重构`
> 目标：基于仓库现状，输出一个可分步执行、可单独提交、尽量不改变行为的重构方案

---

## 一、结论摘要

Echo 当前最核心的结构问题不是“目录不够漂亮”，而是以下三点：

1. [`src/features/app/use-app-controller.ts`](/Users/mac/Desktop/Echo/src/features/app/use-app-controller.ts) 过大，承担了过多前台状态、后台调度和跨域协调职责。
2. Soul / Journal / Profile 自动化存在明显的重复模式，但目前还不适合一上来做过度抽象。
3. [`src/lib/`](/Users/mac/Desktop/Echo/src/lib) 同时承载通用工具、领域逻辑和应用逻辑，导致边界模糊。

这三个问题里，真正影响后续演进速度的是第 1 点。第 2 和第 3 点适合先做成低风险切口，为后续拆分控制器降低复杂度。

---

## 二、已核对的现状

以下内容已和仓库当前文件结构交叉确认：

- [`src/features/app/use-app-controller.ts`](/Users/mac/Desktop/Echo/src/features/app/use-app-controller.ts) 当前为 1956 行。
- [`electron/main.ts`](/Users/mac/Desktop/Echo/electron/main.ts) 当前为 676 行。
- [`src/features/chat/services/soul-automation.ts`](/Users/mac/Desktop/Echo/src/features/chat/services/soul-automation.ts) 与 [`src/features/profile/services/profile-automation.ts`](/Users/mac/Desktop/Echo/src/features/profile/services/profile-automation.ts) 中确实存在重复的 `trimBlock`、`compareMessageCursor`、`getDateStringForTimeZone` 以及结构相同的 tracked message 类型。
- [`src/lib/model-capabilities.ts`](/Users/mac/Desktop/Echo/src/lib/model-capabilities.ts) 与 [`src/lib/model-context-window.ts`](/Users/mac/Desktop/Echo/src/lib/model-context-window.ts) 这类文件更接近领域逻辑，而不是通用工具。
- [`src/lib/app-chat-utils.ts`](/Users/mac/Desktop/Echo/src/lib/app-chat-utils.ts)、[`src/lib/app-session-mutations.ts`](/Users/mac/Desktop/Echo/src/lib/app-session-mutations.ts)、[`src/lib/app-draft-attachments.ts`](/Users/mac/Desktop/Echo/src/lib/app-draft-attachments.ts)、[`src/lib/app-agent-stream.ts`](/Users/mac/Desktop/Echo/src/lib/app-agent-stream.ts)、[`src/lib/app-session-transfer.ts`](/Users/mac/Desktop/Echo/src/lib/app-session-transfer.ts) 明显是应用层代码。
- [`src/domain/`](/Users/mac/Desktop/Echo/src/domain) 目前只有 environment 和 provider 的少量实现，领域层整体偏空。

---

## 三、修正后的问题判断

### 1. `use-app-controller.ts` 仍然是首要问题

这个判断保持不变，而且优先级最高。

该文件同时处理：

- 应用初始化和 hydrate
- 聊天会话管理
- 消息发送与流式响应
- Agent 编排
- Soul / Journal / Profile 自动化调度
- 草稿与附件
- 拖拽行为
- 响应式布局状态
- 命令面板与快捷键

这不是单纯的“文件太长”，而是前台控制器、后台调度器、跨域协同器被耦合在一起。只要这一层不拆，后续任何功能新增都会继续往同一个入口堆。

### 2. 自动化系统确实重复，但先做“共享工具”，再决定是否抽象调度框架

Soul Memory、Soul Rewrite、Journal、Profile Refresh 的运行模式相似，这个观察是对的。

但更稳妥的做法不是立刻引入一个通用 `useBackgroundAutomation` 框架，而是先分两步：

1. 先提取共享的文本处理、日期处理、消息游标比较逻辑。
2. 再把自动化任务从 `use-app-controller` 中拆到独立 hook。

等拆分完成后，如果四套调度逻辑仍然高度一致，再引入更通用的调度抽象。这样可以避免“为了统一而统一”。

### 3. `src/lib/` 与 `src/domain/` 的边界问题成立

这个问题也成立，但执行时要控制节奏。

建议优先搬迁“纯函数、低耦合、无副作用”的文件，例如：

- `model-capabilities`
- `model-context-window`

而像 `app-session-mutations`、`app-session-transfer`、`app-agent-stream` 这类虽然位置不理想，但经常与现有 feature 实现联动，适合在控制器拆分过程中顺手归位，而不是单独大搬家。

### 4. `SettingsCenter.tsx` 不是重复实现

这一条需要修正。

[`src/components/SettingsCenter.tsx`](/Users/mac/Desktop/Echo/src/components/SettingsCenter.tsx) 当前只是一个非常薄的导出壳：

```ts
import { SettingsCenterView } from "./settings/SettingsCenterView";

export const SettingsCenter = SettingsCenterView;
```

所以这里不是“双份实现”，而是“入口别名 + 真实视图实现”的结构。它不是当前的重构重点，最多算一个命名清晰度问题。

### 5. `profile-automation.ts` 不建议并入 `chat/services`

原方案中曾把 `profile-automation.ts` 规划到 `chat/services`，但这会弱化模块边界。

虽然 Profile 自动化消费聊天消息，但它在语义上仍属于用户画像域，更适合继续放在：

- [`src/features/profile/services/profile-automation.ts`](/Users/mac/Desktop/Echo/src/features/profile/services/profile-automation.ts)

更好的做法是抽取共享 automation utils，而不是把所有自动化都塞进 chat。

---

## 四、当前依赖与边界问题

### 前端控制层

当前核心依赖关系可概括为：

```text
AppView / 组件树
  -> use-app-controller
     -> use-chat-orchestration
     -> use-agent-orchestration
     -> soul-automation
     -> profile-automation
     -> controller-helpers
     -> lib/app-*.ts
     -> mu-api
```

其中 `use-app-controller` 既在维护 UI 状态，也在协调聊天状态，还承担自动化调度。这导致任何局部改动都需要理解整份控制器。

### 自动化能力

当前自动化相关逻辑分布在至少三个地方：

- [`src/features/chat/services/soul-automation.ts`](/Users/mac/Desktop/Echo/src/features/chat/services/soul-automation.ts)
- [`src/features/profile/services/profile-automation.ts`](/Users/mac/Desktop/Echo/src/features/profile/services/profile-automation.ts)
- [`src/features/app/use-app-controller.ts`](/Users/mac/Desktop/Echo/src/features/app/use-app-controller.ts)

服务层和调度层没有明确分开，导致“任务怎么计算”和“任务何时运行”耦合在一起。

### 目录职责

当前目录职责大致是：

- `features/`：有业务语义，但还不够完整
- `lib/`：沦为兜底目录
- `domain/`：方向正确，但尚未真正承担领域建模职责

因此重构目标不应该是“把所有文件都重新分类一遍”，而应该是让新增代码不再继续落进 `lib/` 和 `use-app-controller.ts`。

---

## 五、重构原则

1. 每一步都应保持功能不变。
2. 每一步都应尽量能独立提交和回滚。
3. 先拆职责，再做通用抽象。
4. 先移动低耦合代码，再处理高耦合代码。
5. 优先减少认知负担，而不是追求理想化目录结构。

---

## 六、新的分阶段计划

### Phase 0：校准边界与落地顺序

目标：先把后续重构的边界定清楚，避免计划和代码不同步。

动作：

- 修正文档中的不准确判断。
- 明确 `SettingsCenter.tsx` 不是重复实现，不纳入当前重构重点。
- 明确 `profile-automation.ts` 继续归属 `features/profile`。
- 把“先抽象通用后台调度框架”的想法降级为候选项，而不是默认步骤。

完成标志：

- 文档结论与仓库现状一致。
- 后续执行者不会因为目录归属或拆分顺序产生歧义。

### Phase 1：提取自动化共享工具

目标：消除已确认的重复代码，但不改变自动化模块归属。

建议新增：

- [`src/features/automation/automation-utils.ts`](/Users/mac/Desktop/Echo/src/features/automation/automation-utils.ts)

建议提取内容：

- `trimBlock`
- `compareMessageCursor`
- `getDateStringForTimeZone`
- 通用 `TrackedUserMessage` 类型

调整范围：

- [`src/features/chat/services/soul-automation.ts`](/Users/mac/Desktop/Echo/src/features/chat/services/soul-automation.ts)
- [`src/features/profile/services/profile-automation.ts`](/Users/mac/Desktop/Echo/src/features/profile/services/profile-automation.ts)

为什么先做这个：

- 改动面小
- 容易验证
- 能为后续拆自动化调度提供统一底座

### Phase 2：先清理低耦合目录边界

目标：优先处理“纯逻辑但放错位置”的文件。

建议迁移：

- [`src/lib/model-capabilities.ts`](/Users/mac/Desktop/Echo/src/lib/model-capabilities.ts) -> `src/domain/model/capabilities.ts`
- [`src/lib/model-context-window.ts`](/Users/mac/Desktop/Echo/src/lib/model-context-window.ts) -> `src/domain/model/context-window.ts`

这一阶段暂不强制搬迁所有 `lib/app-*.ts` 文件，原因是这些文件更接近应用层实现，和控制器拆分强相关，单独迁移的收益不如在下一阶段顺手完成。

完成标志：

- `domain/model/` 开始承接真正的模型领域逻辑。
- `lib/` 不再继续承载新的领域规则文件。

### Phase 3：优先拆“纯前台状态”，降低控制器体积

目标：先从 `use-app-controller.ts` 中拆出低风险状态片段。

建议先拆两个 hook：

- [`src/features/app/use-app-ui-state.ts`](/Users/mac/Desktop/Echo/src/features/app/use-app-ui-state.ts)
- [`src/features/app/use-draft-manager.ts`](/Users/mac/Desktop/Echo/src/features/app/use-draft-manager.ts)

前者负责：

- sidebar 开关
- 当前视图
- settings section
- viewport 监听
- compact layout 判断
- toast / banner 状态

后者负责：

- draft 内容
- draft attachments
- 拖拽 enter/over/leave/drop
- 附件增删与格式转换

为什么先拆这两块：

- 它们对业务流程影响较小
- 容易写出清晰边界
- 可以显著减少控制器的状态噪音

### Phase 4：拆会话管理与聊天会话变更逻辑

目标：把聊天会话相关逻辑从总控制器中抽出。

建议新增：

- [`src/features/chat/use-session-manager.ts`](/Users/mac/Desktop/Echo/src/features/chat/use-session-manager.ts)

建议吸收内容：

- `sessions`
- `activeSessionId`
- `createSession`
- `removeSession`
- `restoreSession`
- `switchSession`
- `upsertSession`
- removed session undo 逻辑
- session 持久化协调

在这个阶段，再把下列文件逐步归位会更自然：

- [`src/lib/app-chat-utils.ts`](/Users/mac/Desktop/Echo/src/lib/app-chat-utils.ts)
- [`src/lib/app-session-mutations.ts`](/Users/mac/Desktop/Echo/src/lib/app-session-mutations.ts)
- [`src/lib/app-session-transfer.ts`](/Users/mac/Desktop/Echo/src/lib/app-session-transfer.ts)

也就是说，这一阶段的重点不是“搬文件”，而是“先形成一个稳定的 session 模块，再让相关工具贴近它”。

### Phase 5：拆自动化调度层

目标：让服务逻辑和调度逻辑分离。

建议新增：

- [`src/features/automation/use-soul-automation.ts`](/Users/mac/Desktop/Echo/src/features/automation/use-soul-automation.ts)
- [`src/features/automation/use-profile-automation.ts`](/Users/mac/Desktop/Echo/src/features/automation/use-profile-automation.ts)

如果 Journal 逻辑与 Soul 共享较强，可以先落在 `use-soul-automation.ts` 中。

这一阶段处理的是：

- 何时检查是否到期
- 如何避免并发执行
- timer 生命周期
- ready 之后首次补跑

服务层文件仍保留在各自 feature 下：

- `chat/services/soul-automation.ts`
- `profile/services/profile-automation.ts`

只有在这一阶段完成后，如果调度模式依然高度重复，再评估是否引入：

- `use-background-automation.ts`

这样可以用真实重复来驱动抽象，而不是预设一个大框架再强行套进去。

### Phase 6：把 `use-app-controller.ts` 收缩为组合层

目标：让总控制器只负责装配，而不是自己实现所有细节。

理想职责应只剩：

- 组合 session / draft / ui / automation / orchestration hooks
- 处理少数跨模块协调
- 暴露给 `AppView` 的统一接口

目标结果：

- 文件规模降到约 400 至 700 行
- 剩余逻辑主要是组合与桥接，而不是细节实现

这里不强求一定压到某个精确行数，关键是职责纯化。

### Phase 7：清理主进程残留逻辑

目标：继续收敛 [`electron/main.ts`](/Users/mac/Desktop/Echo/electron/main.ts)。

建议分拆方向：

- `fetchModelIds` -> settings 相关模块或独立 model fetcher
- `scanClaudeSkills` -> storage 相关模块
- `runStreamWithTimeout` / 调试请求预览 -> chat stream utils
- `buildAcpMcpConfigOverrides` -> chat handlers 附近

这一阶段可以独立推进，不阻塞前端控制层拆分。

### Phase 8：可选的存储层统一

目标：只在前面几步都稳定后，再考虑统一主进程存储结构。

这是长期优化项，不建议抢在前面做。原因很简单：

- 它不直接缓解当前最痛的控制器复杂度
- 涉及 I/O、路径、数据格式时，验证成本更高

---

## 七、推荐执行顺序

建议顺序调整为：

1. Phase 1：提取自动化共享工具
2. Phase 2：迁移低耦合领域逻辑
3. Phase 3：拆 UI 状态和草稿管理
4. Phase 4：拆 session manager，并顺手归位 `lib/app-*.ts`
5. Phase 5：拆自动化调度层
6. Phase 6：收缩 `use-app-controller`
7. Phase 7：清理 `electron/main.ts`
8. Phase 8：视收益决定是否统一存储层

这个顺序比“先抽一个通用后台框架”更稳，因为它先减少局部复杂度，再决定要不要抽象。

---

## 八、每阶段的风险提示

### 低风险

- 提取重复工具
- 迁移纯领域函数
- 拆 UI 状态
- 拆草稿与附件管理

### 中风险

- 拆 session manager
- 归位 `lib/app-*.ts`
- 收缩 `use-app-controller`

### 较高风险

- 自动化调度重组
- 主进程残留逻辑拆分
- 统一存储层

这里的“较高风险”不是说不能做，而是它们更依赖已有行为是否被完整覆盖验证。

---

## 九、验收标准

如果要判断这轮重构是不是成功，可以看这几个结果：

1. 新增功能不再默认落进 `use-app-controller.ts`。
2. `lib/` 不再继续承载业务逻辑兜底文件。
3. 自动化服务和自动化调度不再耦合在一个入口控制器里。
4. 会话管理、草稿管理、UI 状态可以被单独理解和测试。
5. 主进程 `main.ts` 不再承担大量非入口职责。

---

## 十、明确不建议做的事

- 不要一次性搬迁所有文件。
- 不要在重构过程中顺手改业务行为。
- 不要为了“目录对称”把 profile 逻辑硬塞进 chat。
- 不要在缺少真实重复证据前，先设计一个过大的自动化调度框架。
- 不要把“文件行数变少”误当成唯一目标，真正目标是职责清晰和改动可控。

---

## 十一、下一步建议

如果按这个计划继续推进，最合适的起手式是：

1. 实施 Phase 1，提取自动化共享工具。
2. 紧接着做 Phase 2，把模型领域逻辑移到 `domain/model/`。
3. 然后开始 Phase 3，先拆 UI 状态和草稿管理，而不是先碰自动化框架。

这样做的好处是，我们可以连续拿到三个“低风险、可验证、有体感收益”的提交，再进入更难的控制器拆分。
