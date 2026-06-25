/** Local calendar date key (YYYY-MM-DD) — avoids UTC shift on en-NG weekdays. */
export function localDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function isoToLocalDateKey(iso: string): string {
  if (!iso) return "";
  return localDateKey(new Date(iso));
}

export type DayBucket = {
  /** Stable sort key — use as Recharts X axis dataKey (avoids weekday name reordering). */
  dateStr: string;
  /** Full label for tooltips, e.g. "Thu 21 May". */
  name: string;
  /** Short axis tick, e.g. "21 May". */
  tickLabel: string;
  volume: number;
  approved: number;
};

/** Last N calendar days including today (chronological, local timezone). */
export function buildLastNDayBuckets(days = 7): DayBucket[] {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return Array.from({ length: days }).map((_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (days - 1 - i));
    const weekday = d.toLocaleDateString("en-GB", { weekday: "short" });
    const dayMonth = d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    return {
      dateStr: localDateKey(d),
      name: `${weekday} ${dayMonth}`,
      tickLabel: dayMonth,
      volume: 0,
      approved: 0,
    };
  });
}

/** Chart counts by submission date (created_at), not migration updated_at. */
export function chartActivityDateKey(record: { created_at?: string | null }): string {
  return isoToLocalDateKey(record.created_at || "");
}

export function startOfDayLocal(daysAgo: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - daysAgo);
  return d;
}

/** Real desk activity — excludes bulk workbook / historical imports. */
export const LIVE_AUTH_SOURCES = ["web", "whatsapp"] as const;

export function isLiveAuthSource(source?: string | null): boolean {
  return LIVE_AUTH_SOURCES.includes((source || "") as (typeof LIVE_AUTH_SOURCES)[number]);
}
