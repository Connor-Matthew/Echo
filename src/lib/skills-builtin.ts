import type { Skill } from "../shared/contracts";

const now = "2024-01-01T00:00:00.000Z";

export const BUILTIN_SKILLS: Skill[] = [
  {
    id: "builtin-translate",
    name: "翻译",
    command: "translate",
    description: "将内容翻译成指定语言",
    icon: "🌐",
    userPromptTemplate: "请将以下内容翻译成{{language}}：\n\n{{input}}",
    params: [{ key: "language", label: "目标语言", defaultValue: "英文" }],
    isBuiltin: true,
    createdAt: now,
    updatedAt: now
  },
  {
    id: "builtin-summarize",
    name: "总结",
    command: "summarize",
    description: "用指定风格总结内容",
    icon: "📝",
    userPromptTemplate: "请用{{style}}风格总结以下内容：\n\n{{input}}",
    systemPromptOverride: "You are a concise summarization assistant. Focus on key points and be brief.",
    params: [{ key: "style", label: "风格", defaultValue: "简洁" }],
    isBuiltin: true,
    createdAt: now,
    updatedAt: now
  },
  {
    id: "builtin-review",
    name: "代码审查",
    command: "review",
    description: "审查代码质量",
    icon: "🔍",
    userPromptTemplate: "请审查以下代码，重点关注{{focus}}：\n\n{{input}}",
    systemPromptOverride: "You are an expert code reviewer. Be specific, actionable, and constructive.",
    params: [{ key: "focus", label: "关注点", defaultValue: "安全性和性能" }],
    isBuiltin: true,
    createdAt: now,
    updatedAt: now
  },
  {
    id: "builtin-polish",
    name: "润色",
    command: "polish",
    description: "润色和改善文字表达",
    icon: "✨",
    userPromptTemplate: "请以{{style}}风格润色以下文字，保持原意：\n\n{{input}}",
    params: [{ key: "style", label: "风格", defaultValue: "专业正式" }],
    isBuiltin: true,
    createdAt: now,
    updatedAt: now
  },
  {
    id: "builtin-explain",
    name: "解释",
    command: "explain",
    description: "解释代码或概念",
    icon: "💡",
    userPromptTemplate: "请用{{level}}的方式解释以下内容：\n\n{{input}}",
    systemPromptOverride: "You are a patient teacher. Use clear language and examples.",
    params: [{ key: "level", label: "难度", defaultValue: "通俗易懂" }],
    isBuiltin: true,
    createdAt: now,
    updatedAt: now
  }
];
