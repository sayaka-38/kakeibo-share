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

/**
 * Group payment-like objects by payment_date.
 * Returns an array of { date, payments } sorted by original order (typically date descending).
 */
export function groupPaymentsByDate<T extends { payment_date: string }>(
  payments: T[]
): { date: string; payments: T[] }[] {
  const { dateOrder, byDate } = groupByDate(payments, (p) => p.payment_date);
  return dateOrder.map((date) => ({ date, payments: byDate[date]! }));
}

/**
 * Group payment-like objects by month (YYYY-MM), newest first.
 */
export function groupPaymentsByMonth<T extends { payment_date: string }>(
  payments: T[]
): { months: string[]; byMonth: Record<string, T[]> } {
  const { dateOrder, byDate } = groupByDate(
    payments,
    (p) => p.payment_date.substring(0, 7)
  );
  return { months: dateOrder.sort().reverse(), byMonth: byDate };
}
