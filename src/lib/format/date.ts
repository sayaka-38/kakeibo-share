/**
 * 日付文字列をスマートにフォーマットする。
 * 当年度は MM-DD 形式、それ以外は YYYY-MM-DD 形式を返す。
 */
export function formatDateSmart(dateStr: string): string {
  const currentYear = new Date().getFullYear().toString();
  return dateStr.startsWith(currentYear) ? dateStr.slice(5) : dateStr;
}
