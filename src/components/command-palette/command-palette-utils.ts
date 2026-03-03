export type CommandPaletteSearchItem = {
  id: string;
  title: string;
  keywords?: string[];
  aliases?: string[];
};

export type HighlightPart = {
  text: string;
  matched: boolean;
};

export type CommandPaletteGroup<T> = {
  group: string;
  items: T[];
};

const normalizeText = (value: string) => value.trim().toLowerCase();
const compactText = (value: string) => normalizeText(value).replace(/[\s_\-/.:]+/g, "");

const isSubsequenceMatch = (needle: string, haystack: string) => {
  if (!needle) {
    return false;
  }
  let index = 0;
  for (const char of haystack) {
    if (char === needle[index]) {
      index += 1;
      if (index >= needle.length) {
        return true;
      }
    }
  }
  return false;
};

const scoreCandidate = (
  rawCandidate: string,
  normalizedQuery: string,
  compactQuery: string,
  weights: { exact: number; prefix: number; contains: number; subsequence: number }
) => {
  const candidate = normalizeText(rawCandidate);
  const compactCandidate = compactText(rawCandidate);
  if (!candidate && !compactCandidate) {
    return 0;
  }

  if (
    candidate === normalizedQuery ||
    compactCandidate === compactQuery
  ) {
    return weights.exact;
  }
  if (
    candidate.startsWith(normalizedQuery) ||
    compactCandidate.startsWith(compactQuery)
  ) {
    return weights.prefix;
  }
  if (
    candidate.includes(normalizedQuery) ||
    compactCandidate.includes(compactQuery)
  ) {
    return weights.contains;
  }
  if (isSubsequenceMatch(compactQuery, compactCandidate)) {
    return weights.subsequence;
  }

  return 0;
};

const scoreItem = (item: CommandPaletteSearchItem, normalizedQuery: string) => {
  if (!normalizedQuery) {
    return 1;
  }

  const compactQuery = compactText(normalizedQuery);
  const titleScore = scoreCandidate(item.title, normalizedQuery, compactQuery, {
    exact: 120,
    prefix: 90,
    contains: 70,
    subsequence: 48
  });
  const keywordScore = [...(item.keywords ?? []), ...(item.aliases ?? [])].reduce(
    (highest, candidate) =>
      Math.max(
        highest,
        scoreCandidate(candidate, normalizedQuery, compactQuery, {
          exact: 80,
          prefix: 55,
          contains: 35,
          subsequence: 24
        })
      ),
    0
  );

  return Math.max(titleScore, keywordScore);
};

export const filterCommandPaletteItems = <T extends CommandPaletteSearchItem>(
  items: T[],
  query: string
): T[] => {
  const normalizedQuery = normalizeText(query);
  return items
    .map((item, index) => ({ item, index, score: scoreItem(item, normalizedQuery) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.index - right.index;
    })
    .map((entry) => entry.item);
};

export const sortCommandPaletteItemsByRecent = <T extends { id: string }>(
  items: T[],
  recentIds: string[]
): T[] => {
  if (!recentIds.length) {
    return items;
  }

  const rankById = new Map<string, number>();
  recentIds.forEach((id, index) => {
    rankById.set(id, index);
  });

  return [...items].sort((left, right) => {
    const leftRank = rankById.get(left.id);
    const rightRank = rankById.get(right.id);
    const leftScore = typeof leftRank === "number" ? leftRank : Number.POSITIVE_INFINITY;
    const rightScore = typeof rightRank === "number" ? rightRank : Number.POSITIVE_INFINITY;

    if (leftScore !== rightScore) {
      return leftScore - rightScore;
    }
    return 0;
  });
};

export const groupCommandPaletteItems = <T extends { group?: string }>(
  items: T[],
  fallbackGroup = "其他"
): CommandPaletteGroup<T>[] => {
  const grouped = new Map<string, T[]>();
  items.forEach((item) => {
    const group = item.group?.trim() || fallbackGroup;
    const bucket = grouped.get(group);
    if (bucket) {
      bucket.push(item);
      return;
    }
    grouped.set(group, [item]);
  });

  return Array.from(grouped.entries()).map(([group, groupedItems]) => ({
    group,
    items: groupedItems
  }));
};

export const buildCommandHighlightParts = (text: string, query: string): HighlightPart[] => {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) {
    return [{ text, matched: false }];
  }

  const normalizedText = text.toLowerCase();
  const index = normalizedText.indexOf(normalizedQuery);
  if (index < 0) {
    return [{ text, matched: false }];
  }

  const end = index + normalizedQuery.length;
  const parts: HighlightPart[] = [];
  if (index > 0) {
    parts.push({ text: text.slice(0, index), matched: false });
  }
  parts.push({ text: text.slice(index, end), matched: true });
  if (end < text.length) {
    parts.push({ text: text.slice(end), matched: false });
  }
  return parts;
};

const toNonMacToken = (token: string) => {
  switch (token) {
    case "mod":
    case "cmd":
    case "meta":
      return "Ctrl";
    case "ctrl":
      return "Ctrl";
    case "shift":
      return "Shift";
    case "alt":
    case "option":
      return "Alt";
    case "enter":
      return "Enter";
    default:
      return token.length === 1 ? token.toUpperCase() : token;
  }
};

const toMacToken = (token: string) => {
  switch (token) {
    case "mod":
    case "cmd":
    case "meta":
      return "⌘";
    case "ctrl":
      return "⌃";
    case "shift":
      return "⇧";
    case "alt":
    case "option":
      return "⌥";
    case "enter":
      return "↩";
    default:
      return token.length === 1 ? token.toUpperCase() : token;
  }
};

export const formatCommandShortcut = (shortcut: string, isMac: boolean) => {
  const tokens = shortcut
    .split("+")
    .map((token) => normalizeText(token))
    .filter(Boolean);

  if (!tokens.length) {
    return "";
  }

  if (isMac) {
    return tokens.map((token) => toMacToken(token)).join("");
  }

  return tokens.map((token) => toNonMacToken(token)).join("+");
};
