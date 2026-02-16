# Echo

一个基于 Electron + React + Vite + Bun 的桌面 AI Chat 客户端。

## 功能特性

- 多 Provider 管理（OpenAI / OpenRouter / Groq / DeepSeek / Anthropic / Ollama / LM Studio 预设）
- 流式输出（SSE）与中断生成
- 多会话线程管理（新建 / 重命名 / 删除 / 撤销删除）
- 消息编辑后重生成、消息重发、消息复制
- Markdown 渲染（含代码块复制、表格、列表）
- 附件支持：`md/txt` 文本内容可注入上下文；图片和其他文件可预览与存档（默认不发送给模型）
- 会话导入/导出（JSON）
- 本地持久化设置与历史会话

## 技术栈

- `Electron`
- `React 18`
- `TypeScript`
- `Vite`
- `Tailwind CSS`
- `Bun`（包管理与脚本执行）

## 快速开始

### 1. 安装依赖

```bash
bun install
```

### 2. 启动开发模式（Renderer + Electron）

```bash
bun run dev
```

### 3. 生产构建

```bash
bun run build
```

### 4. 运行已构建 Electron 主进程

```bash
bun run start
```

## 首次配置

1. 打开应用后进入 `Settings -> Provider`
2. 选择预设 Provider（或自定义）
3. 填写 `Base URL`、`API Key`、`Model`
4. 点击测试连接并保存

## 常用脚本

- `bun run dev`：本地开发
- `bun run build`：类型检查 + 前端构建 + Electron 构建
- `bun run start`：启动 Electron（读取 `dist-electron/main.cjs`）
- `bun run typecheck`：仅 TypeScript 类型检查

## 目录结构

```text
electron/          # Electron main/preload
src/               # React 前端代码
src/components/    # UI 组件
src/shared/        # 主进程与渲染进程共享类型
scripts/           # 构建辅助脚本
docs/plans/        # 设计文档
```

## 数据与安全

- 会话与设置保存到 Electron `userData` 目录下的 `store` 文件夹。
- 当前版本会在本地持久化 Provider 配置（包括 API Key）；请仅在受信任设备使用。

## 已知限制

- 仅 `md/txt` 附件会注入模型上下文；图片/二进制文件默认不发送。
- 仓库当前未包含应用安装包（`.dmg`/`.exe`）打包流程。
