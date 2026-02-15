/**
 * Date grouping utilities for payment lists
 */

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

/**
 * Format a date string (YYYY-MM-DD) as a Japanese date header.
 * e.g. "2026-02-15" → "2月15日(日)"
 */
export function formatDateHeader(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const weekday = WEEKDAYS[date.getDay()];
  return `${month}月${day}日(${weekday})`;
}

/**
 * Group items by date, preserving the original sort order.
 */
export function groupByDate<T>(
  items: T[],
  getDate: (item: T) => string
): { dateOrder: string[]; byDate: Record<string, T[]> } {
  const dateOrder: string[] = [];
  const byDate: Record<string, T[]> = {};
  for (const item of items) {
    const date = getDate(item);
    if (!byDate[date]) {
      dateOrder.push(date);
      byDate[date] = [];
    }
    byDate[date]!.push(item);
  }
  return { dateOrder, byDate };
}
