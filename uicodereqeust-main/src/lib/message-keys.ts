// Tiny helper for stable localStorage keys so multiple hooks stay aligned.
const PREFIX = "ronsberger:support:";

export const supportLocalKey = {
  filters: `${PREFIX}inbox-filters`,
  lastSelectedConversation: `${PREFIX}last-selected-conversation`,
  inboxCollapsedLeft: `${PREFIX}inbox-left-collapsed`,
  inboxCollapsedRight: `${PREFIX}inbox-right-collapsed`,
  livechatDismissed: `${PREFIX}livechat-dismissed`,
  bulkSelection: `${PREFIX}bulk-selection`,
};

export function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJson<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore quota / privacy errors
  }
}
