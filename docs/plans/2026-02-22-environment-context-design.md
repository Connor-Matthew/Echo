# Echo 环境上下文注入模块设计

日期：2026-02-22

## 目标

为 Agent 发送链路新增一个独立“环境上下文模块”，在不改变聊天正文显示的前提下，将日期/时间/位置/天气/设备状态等信息注入模型上下文，提升回答对当前环境的感知能力。

本设计的已确认决策：

- 交互方式：发送前展示“环境卡片”，允许用户本次发送前编辑。
- 字段范围：平衡版（时间、时区、locale、cwd、天气、网络、电池、设备类型）。
- 位置来源：手动城市（不申请定位权限）。
- 注入可见性：仅注入模型上下文，不显示在聊天消息正文。
- 刷新策略：天气 10 分钟缓存；网络/电池实时；发送等待天气最多 600ms，超时降级但不阻塞发送。
- 天气服务：Open-Meteo（免 API Key）。

## 非目标

- 不做自动地理定位。
- 不做 IP 归属、OS 版本、经纬度等完整版字段。
- 不在本阶段引入 provider 插件系统。
- 不改变既有历史消息结构与渲染逻辑。

## 方案比较

### A. 直接在 prompt builder 拼接（不推荐）

在 `agent-prompt-builder.ts` 直接采集和拼接所有环境信息。

- 优点：改动最少。
- 缺点：采集、缓存、网络请求、格式化耦合在一处；难测试、难扩展，后续维护成本高。

### B. 独立环境模块分层（推荐）

将“采集/缓存/注入”分层，prompt builder 只负责序列化。

- 优点：边界清晰、可测试、能稳定扩展。
- 缺点：首版接线较多，但复杂度可控。

### C. Provider 插件化（暂不采用）

天气/设备/网络都抽象为 provider。

- 优点：扩展性最强。
- 缺点：当前需求下过度设计。

## 架构与模块

### 前端（Renderer）

新增 `env-context-client`（建议放在 `src/lib/`）：

- 采集本地实时字段：时间、时区、locale、网络、电池、设备类型、cwd。
- 管理“环境卡片”临时编辑态（仅本次发送生效）。
- 在发送前与主进程天气结果合并为 `EnvironmentSnapshot`。

UI 接入点：

- `src/components/Composer.tsx`：发送前卡片交互入口。
- `src/components/SettingsCenter.tsx`：新增环境设置（开关、城市、单位、超时/缓存参数）。

### 主进程（Main）

新增 `env-context-service`（建议放在 `electron/env/`）：

- 提供 `getWeatherSnapshot(city, unit)`。
- 使用 Open-Meteo 查询天气。
- 实现 10 分钟 TTL 缓存（key: `city + unit`）。
- 提供 stale 数据回退与错误原因。

IPC 接入：

- `electron/main.ts` 增加 `env:getWeatherSnapshot` handler。
- `electron/preload.ts` 与 `src/lib/mu-api.ts` 增加 `env` API。

### Prompt 注入

- 在 `electron/agent/agent-prompt-builder.ts` 中读取 `environmentSnapshot`。
- 将快照格式化注入到 `<runtime_context>` 中。
- 环境块仅提供给模型，不写入用户消息正文。

## 数据结构（草案）

建议在 `src/shared/contracts.ts` 或 `src/shared/agent-contracts.ts` 中增加：

```ts
export type EnvironmentSettings = {
  enabled: boolean;
  city: string;
  temperatureUnit: "c" | "f";
  weatherCacheTtlMs: number; // default 600000
  sendTimeoutMs: number; // default 600
};

export type EnvironmentSnapshot = {
  capturedAt: string;
  cwd: string;
  time: {
    iso: string;
    date: string;
    time: string;
    timezone: string;
    locale: string;
  };
  device: {
    type: "desktop" | "laptop" | "unknown";
    network?: { online: boolean; effectiveType?: string };
    battery?: { level?: number; charging?: boolean };
  };
  location: {
    city: string;
  };
  weather: {
    status: "ok" | "stale" | "unavailable";
    source: "open-meteo";
    fetchedAt?: string;
    summary?: string;
    temp?: number;
    feelsLike?: number;
    humidity?: number;
    windKph?: number;
    reason?: string;
  };
};

export type EnvironmentOverrides = {
  city?: string;
  weatherSummary?: string;
};
```

约束：

- `EnvironmentOverrides` 仅允许覆盖“可人工修正字段”（如城市、天气描述）。
- 系统客观字段（如时间）不允许手改，避免上下文失真。

## 详细数据流

发送流程：

1. 用户点击发送，Composer 触发环境卡片准备流程。
2. 前端立即执行 `collectLocal()` 获取本地实时字段。
3. 同时 IPC 调用 `env:getWeatherSnapshot(city, unit)`。
4. 前端最多等待 `sendTimeoutMs`（默认 600ms）。
5. 若天气及时返回：`weather.status = ok`；若超时/失败：
   - 有缓存：`weather.status = stale`
   - 无缓存：`weather.status = unavailable`
6. 用户可在卡片中做本次临时编辑。
7. 生成最终 `EnvironmentSnapshot`，挂到 `AgentSendMessageRequest`。
8. Prompt builder 注入 `<runtime_context>`，消息继续发送。

保证：环境模块任意失败都不允许中断主消息发送。

## 错误处理与降级

- 天气 API 超时：返回 stale 或 unavailable，并附 `reason`。
- 网络中断：直接降级为 unavailable，不重试阻塞发送。
- 城市为空：跳过天气查询，标记 unavailable。
- Open-Meteo 数据结构变化：解析失败时返回 unavailable + reason。
- 电池 API 不可用（部分桌面环境）：`battery` 字段省略。

## 配置与默认值

新增 `AppSettings.environment`：

- `enabled: true`
- `city: ""`（首次由用户填写）
- `temperatureUnit: "c"`
- `weatherCacheTtlMs: 600000`
- `sendTimeoutMs: 600`

边界限制建议：

- `weatherCacheTtlMs`: 60,000 ~ 3,600,000
- `sendTimeoutMs`: 100 ~ 2,000

## 可观测性

新增轻量日志事件：`env_snapshot_status`

建议字段：

- `status`: ok | stale | unavailable
- `weatherLatencyMs`
- `city`
- `usedCache`: boolean

用于评估缓存命中率与超时阈值是否合理。

## 测试清单

### 单元测试

- `env-context-service`：
  - 缓存命中/过期逻辑。
  - 超时与异常映射为 stale/unavailable。
- `agent-prompt-builder`：
  - 环境块序列化稳定。
  - `enabled=false` 时不注入环境字段。

### 集成测试

- IPC `env:getWeatherSnapshot` 在正常/超时/断网下都返回可消费结构。
- `muApi.env` 与 preload 桥接正确。

### UI 测试

- 环境卡片可展开、编辑、确认发送。
- 临时编辑仅影响本次发送。
- 注入内容不显示在聊天正文。

### 回归测试

- 关闭环境注入后，发送链路与现状一致。
- 历史会话读取与渲染不受影响。

## 风险与缓解

- 外部天气服务不稳定：缓存 + 超时降级，不阻塞主流程。
- 字段膨胀导致 prompt 变长：限制字段总量，保持简洁摘要。
- 用户隐私顾虑：默认只用手动城市，不采集精确位置。

## 实施顺序建议

1. 定义类型与默认配置。
2. 主进程天气服务 + IPC。
3. preload 与 muApi 契约扩展。
4. renderer `env-context-client` 与发送合并逻辑。
5. Composer 环境卡片 UI。
6. prompt builder 注入与回归测试。
