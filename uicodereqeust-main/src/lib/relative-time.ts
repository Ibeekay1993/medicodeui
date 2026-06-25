// Centralized relative-time formatter for chat timestamps and notification badges.
const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export function formatRelativeTime(value: string | number | Date | null | undefined): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const diff = Date.now() - date.getTime();
  if (diff < 0) return "just now";
  if (diff < 45 * 1000) return "just now";
  if (diff < HOUR) {
    const minutes = Math.max(1, Math.round(diff / MIN));
    return `${minutes}m ago`;
  }
  if (diff < DAY) {
    const hours = Math.round(diff / HOUR);
    return `${hours}h ago`;
  }
  if (diff < 7 * DAY) {
    const days = Math.round(diff / DAY);
    return `${days}d ago`;
  }
  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  });
}

export function formatAbsoluteTime(value: string | number | Date | null | undefined): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
