const normalizeToken = (value: string) => value.trim().toLowerCase();

const MODIFIER_TOKENS = new Set(["mod", "meta", "cmd", "ctrl", "shift", "alt", "option"]);

const normalizeEventKey = (key: string) => {
  const normalized = normalizeToken(key);
  if (normalized === " ") {
    return "space";
  }
  if (normalized === "return") {
    return "enter";
  }
  return normalized;
};

export const detectIsMacPlatform = () => {
  if (typeof navigator === "undefined") {
    return false;
  }
  return /Mac|iPhone|iPad/i.test(navigator.platform);
};

export const isEditableEventTarget = (target: EventTarget | null) => {
  if (!target || typeof target !== "object") {
    return false;
  }

  const candidate = target as {
    tagName?: string;
    isContentEditable?: boolean;
    getAttribute?: (name: string) => string | null;
  };
  if (candidate.isContentEditable) {
    return true;
  }

  const tagName = typeof candidate.tagName === "string" ? candidate.tagName.toUpperCase() : "";
  if (tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT") {
    return true;
  }

  const role = candidate.getAttribute?.("role");
  return role === "textbox";
};

export const matchesShortcut = (
  event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey">,
  shortcut: string,
  isMac: boolean
) => {
  const tokens = shortcut
    .split("+")
    .map((token) => normalizeToken(token))
    .filter(Boolean);

  if (!tokens.length) {
    return false;
  }

  const required = {
    meta: false,
    ctrl: false,
    shift: false,
    alt: false
  };
  let keyToken: string | null = null;

  for (const token of tokens) {
    if (!MODIFIER_TOKENS.has(token)) {
      keyToken = token;
      continue;
    }

    if (token === "mod") {
      if (isMac) {
        required.meta = true;
      } else {
        required.ctrl = true;
      }
      continue;
    }
    if (token === "meta" || token === "cmd") {
      required.meta = true;
      continue;
    }
    if (token === "ctrl") {
      required.ctrl = true;
      continue;
    }
    if (token === "shift") {
      required.shift = true;
      continue;
    }
    if (token === "alt" || token === "option") {
      required.alt = true;
    }
  }

  if (!keyToken) {
    return false;
  }

  if (event.metaKey !== required.meta) {
    return false;
  }
  if (event.ctrlKey !== required.ctrl) {
    return false;
  }
  if (event.shiftKey !== required.shift) {
    return false;
  }
  if (event.altKey !== required.alt) {
    return false;
  }

  return normalizeEventKey(event.key) === keyToken;
};
