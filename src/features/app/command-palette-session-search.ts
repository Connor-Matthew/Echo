import type { ChatMessage, ChatSession } from "../../shared/contracts";

type SessionSearchMetadata = {
  keywords: string[];
  preview: string;
};

const MAX_KEYWORDS = 14;
const MAX_PREVIEW_LENGTH = 72;
const MIN_ASCII_TOKEN = 3;
const MIN_CJK_TOKEN = 2;

const toSingleLine = (value: string) => value.replace(/\s+/g, " ").trim();

const truncate = (value: string, maxLength: number) =>
  value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;

const hasCjk = (value: string) => /[\u4e00-\u9fff]/.test(value);

const isUsefulToken = (token: string) => {
  if (!token) {
    return false;
  }
  if (hasCjk(token)) {
    return token.length >= MIN_CJK_TOKEN;
  }
  if (!/[a-z0-9]/i.test(token)) {
    return false;
  }
  return token.length >= MIN_ASCII_TOKEN;
};

const expandCjkToken = (token: string) => {
  if (!hasCjk(token) || token.length <= 4) {
    return [token];
  }

  const expansions: string[] = [
    token,
    token.slice(-4),
    token.slice(-3),
    token.slice(-2)
  ];
  for (let size = 2; size <= 4; size += 1) {
    for (let index = 0; index <= token.length - size; index += 1) {
      expansions.push(token.slice(index, index + size));
    }
  }
  return expansions;
};

const tokenize = (value: string) =>
  toSingleLine(value)
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .map((item) => item.trim())
    .flatMap((item) => expandCjkToken(item))
    .filter((item) => isUsefulToken(item));

const extractRecentMessages = (session: ChatSession) =>
  session.messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .slice(-8)
    .reverse();

const extractPreview = (messages: ChatMessage[]) => {
  for (const message of messages) {
    const normalized = toSingleLine(message.content);
    if (normalized) {
      return truncate(normalized, MAX_PREVIEW_LENGTH);
    }
  }
  return "暂无消息内容";
};

export const buildSessionSearchMetadata = (session: ChatSession): SessionSearchMetadata => {
  const recentMessages = extractRecentMessages(session);
  const preview = extractPreview(recentMessages);
  const snippetCandidates: string[] = [];
  const tokenCandidates: string[] = [];

  for (const message of recentMessages) {
    const normalized = toSingleLine(message.content);
    if (normalized) {
      snippetCandidates.push(truncate(normalized.toLowerCase(), 36));
    }
    tokenize(normalized).forEach((token) => tokenCandidates.push(token));
  }

  const uniq = (items: string[]) => Array.from(new Set(items));
  const uniqTokens = uniq(tokenCandidates);
  const asciiTokens = uniqTokens.filter((token) => !hasCjk(token) && /[a-z0-9]/i.test(token));
  const cjkLongTokens = uniqTokens.filter((token) => hasCjk(token) && token.length >= 4);
  const cjkShortTokens = uniqTokens.filter((token) => hasCjk(token) && token.length < 4);
  const prioritized = uniq([
    ...asciiTokens,
    ...cjkLongTokens,
    ...cjkShortTokens,
    ...snippetCandidates
  ]);

  return {
    preview,
    keywords: prioritized.slice(0, MAX_KEYWORDS)
  };
};
