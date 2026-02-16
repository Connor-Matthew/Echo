# AI 对话桌面客户端 MVP 设计（类似 Proma）

日期：2026-02-15  
状态：已确认范围，待进入实现

## 1. 已确认范围

本设计基于已确认的选择：

- 形态：桌面端（Electron）
- 技术栈：Bun + Electron + React + TypeScript + Jotai + Tailwind + shadcn/ui
- 模型接入：仅 OpenAI 兼容协议（`Base URL + API Key + model`）
- 数据策略：完全本地存储，不做账号系统
- 页面范围：聊天页 + 渠道设置页 + 会话侧栏（新建/重命名/删除）

## 2. 目标与非目标

### 2.1 目标

- 提供可用的本地 AI 聊天闭环：配置渠道、创建会话、发送消息、流式返回。
- 保持结构可扩展：后续能平滑增加附件解析、渲染增强、Agent 模式。
- 保障桌面安全边界：密钥不直接暴露给渲染层网络请求。

### 2.2 非目标（MVP 不做）

- 不做多供应商专有适配（只做 OpenAI-compatible）。
- 不做附件上传解析（PDF/Office/图片解析）。
- 不做 Agent 执行、Skills/MCP、自动化任务。
- 不做云同步、账号体系、多设备登录。

## 3. 架构方案（推荐方案 2：分层标准型）

采用 `UI -> 应用层 -> Provider 适配层 -> 主进程网络代理` 分层。

### 3.1 进程边界

- `main`（Electron 主进程）
  - 管理窗口生命周期。
  - 暴露安全 IPC 接口。
  - 负责对外网络请求（模型流式调用）。
  - 负责本地持久化读写。
- `preload`
  - 使用 `contextBridge` 暴露白名单 API。
  - 屏蔽 Node 能力给渲染层。
- `renderer`（React）
  - 页面渲染与交互。
  - Jotai 状态管理。
  - 消费流式事件并更新 UI。

### 3.2 目录建议

```text
src/
  main/
    index.ts
    ipc/
      chat.ts
      settings.ts
      sessions.ts
    services/
      openaiCompatibleClient.ts
      storage.ts
  preload/
    index.ts
    types.ts
  renderer/
    app/
    pages/
      ChatPage.tsx
      SettingsPage.tsx
    components/
      SessionSidebar.tsx
      ChatComposer.tsx
      MessageList.tsx
    state/
      settings.atoms.ts
      sessions.atoms.ts
      chat.atoms.ts
    lib/
      ipcClient.ts
```

## 4. 核心模块设计

### 4.1 设置模块（Channels/Model）

- 字段：`baseUrl`、`apiKey`、`model`。
- 行为：
  - 表单保存到本地。
  - 发送前校验必填项。
  - 提供“连接测试”能力（调用 `/models` 或轻量对话请求）。

### 4.2 会话模块

- 会话侧栏能力：
  - 新建会话（默认标题：`新对话` + 时间后缀）
  - 重命名会话
  - 删除会话
  - 切换当前会话
- 会话模型：
  - `id`, `title`, `createdAt`, `updatedAt`, `messages[]`

### 4.3 聊天模块（流式）

- 输入框支持多行输入、发送中禁用重复提交。
- 流式渲染增量文本（token/chunk 级更新）。
- 中断/失败可见错误提示，保持已有消息不丢失。

## 5. 数据模型与本地持久化

使用本地 JSON 文件存储，建议文件：

- `settings.json`
- `sessions.json`

建议结构：

```ts
type AppSettings = {
  baseUrl: string
  apiKey: string
  model: string
}

type ChatMessage = {
  id: string
  role: 'system' | 'user' | 'assistant'
  content: string
  createdAt: string
}

type ChatSession = {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  messages: ChatMessage[]
}
```

写盘策略：

- 启动时一次性加载到内存。
- 状态变更后防抖写盘（如 300-500ms）。
- 写盘失败时展示错误并保留内存状态，避免 UI 卡死。

## 6. 关键数据流

### 6.1 应用启动

1. 主进程读取本地 `settings/sessions`。  
2. 渲染进程通过 IPC 获取初始状态。  
3. Jotai atoms 初始化并渲染默认会话。

### 6.2 发送消息（流式）

1. 用户输入并点击发送。  
2. 渲染层将用户消息写入当前会话并立即回显。  
3. 调用 `chat.stream` IPC，参数包含 `baseUrl/apiKey/model/messages`。  
4. 主进程请求 OpenAI-compatible `chat.completions`（`stream=true`）。  
5. 增量 chunk 经 IPC 事件回传渲染层。  
6. 渲染层拼接 assistant 消息并实时刷新。  
7. 完成后更新 `updatedAt` 并触发持久化。

### 6.3 会话操作

- 新建/重命名/删除会话在渲染层先更新状态，再触发主进程写盘。
- 删除当前会话时自动切换到最近更新的会话；无会话则自动新建空会话。

## 7. 错误处理与安全策略

### 7.1 错误分层

- 配置错误：未填写 `baseUrl/apiKey/model`，阻止发送并提示。
- 网络错误：超时、DNS、TLS、401/429/5xx，给出可读错误信息。
- 流式中断：保留已返回片段，标记“响应中断”。
- 持久化错误：提示用户本地写入失败，不影响当前内存会话。

### 7.2 安全策略

- 渲染进程禁用直接 Node 访问，启用 `contextIsolation`。
- API Key 仅通过 IPC 传给主进程请求，不在前端日志打印。
- IPC 仅暴露最小接口：`getSettings/saveSettings/testConnection/chatStream/sessionOps`。

## 8. 测试策略

### 8.1 单元测试

- `openaiCompatibleClient`：请求构造、流式 chunk 解析、错误映射。
- `storage`：读写容错、防抖写盘行为。
- `state atoms`：会话增删改与消息合并逻辑。

### 8.2 集成测试

- IPC 通道测试：渲染层调用到主进程结果闭环。
- 流式链路测试：mock SSE 响应，验证 UI 增量渲染。

### 8.3 E2E（最小）

- 首次启动 -> 配置渠道 -> 新建会话 -> 发送消息 -> 获得流式回复 -> 重启后数据仍在。

## 9. 里程碑拆分

1. 工程初始化：Electron + React + TS + Tailwind + shadcn + Jotai。  
2. 设置页：保存/读取配置 + 连接测试。  
3. 会话侧栏：新建/重命名/删除 + 本地持久化。  
4. 聊天主链路：发送消息 + 流式渲染 + 基础错误处理。  
5. 测试与打磨：关键单测 + 一条 E2E 冒烟用例。

## 10. MVP 验收标准

- 可在本地配置 OpenAI-compatible 渠道并成功发起对话。
- 聊天回复为流式更新，用户可感知增量输出。
- 可创建、重命名、删除会话，且重启后会话与消息保留。
- 在配置错误或网络失败时有明确错误反馈。
- 不引入账号系统与云依赖，纯本地可运行。
