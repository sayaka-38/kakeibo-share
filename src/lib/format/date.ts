/**
 * 日付文字列をスマートにフォーマットする（日本仕様）。
 * 当年度は M/D 形式、それ以外は YYYY/M/D 形式を返す。
 * 先頭のゼロは除去する（例: 02-23 → 2/23）。
 */
export function formatDateSmart(dateStr: string): string {
  const [year, month, day] = dateStr.split("-");
  const m = String(Number(month));
  const d = String(Number(day));
  const currentYear = new Date().getFullYear().toString();
  return year === currentYear ? `${m}/${d}` : `${year}/${m}/${d}`;
}
