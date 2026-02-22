/**
 * 固定費ルールのスケジュール計算
 *
 * interval_months に基づいて、ルールが指定月に発生するか判定し、
 * 期間内の発生日一覧を生成する。
 */

/**
 * ルールが指定月に発生するか判定
 *
 * start_date をアンカー月として、interval_months 周期で発生するか判定。
 * 条件:
 *   1. start_date の月 <= 対象月
 *   2. end_date IS NULL または 対象月 <= end_date の月
 *   3. (対象月 - start_date月) % interval_months === 0
 */
export function shouldRuleFireInMonth(
  ruleStartDate: string,
  intervalMonths: number,
  targetYear: number,
  targetMonth: number,
  ruleEndDate?: string | null
): boolean {
  if (intervalMonths < 1) return false;
  if (targetMonth < 1 || targetMonth > 12) return false;

  const start = new Date(ruleStartDate);
  const startYear = start.getFullYear();
  const startMonth = start.getMonth() + 1; // 1-12

  const monthsDiff =
    (targetYear - startYear) * 12 + (targetMonth - startMonth);

  // start_date より前の月には発生しない
  if (monthsDiff < 0) return false;

  // end_date チェック: 対象月が end_date の月を超えてはならない
  if (ruleEndDate) {
    const end = new Date(ruleEndDate);
    const endYear = end.getFullYear();
    const endMonth = end.getMonth() + 1;
    const monthsAfterEnd =
      (targetYear - endYear) * 12 + (targetMonth - endMonth);
    if (monthsAfterEnd > 0) return false;
  }

  return monthsDiff % intervalMonths === 0;
}

/**
 * 月の実際の日を取得（末日対応）
 *
 * dayOfMonth が月の日数を超える場合は末日を返す。
 * 例: dayOfMonth=31, month=2, year=2024 → 29
 */
export function getActualDayOfMonth(
  dayOfMonth: number,
  year: number,
  month: number
): number {
  // month は 1-12
  const lastDay = new Date(year, month, 0).getDate();
  return Math.min(dayOfMonth, lastDay);
}

/**
 * 期間内のルール発生日一覧を生成
 *
 * periodStart〜periodEnd の各月を走査し、shouldRuleFireInMonth で判定。
 * 発生する月は getActualDayOfMonth で日付を確定し、期間内に収まるもののみ返す。
 */
export function computeRuleDatesInPeriod(
  rule: {
    start_date: string;
    end_date?: string | null;
    interval_months: number;
    day_of_month: number;
  },
  periodStart: string,
  periodEnd: string
): Date[] {
  const start = new Date(periodStart);
  const end = new Date(periodEnd);
  const dates: Date[] = [];

  // 開始月〜終了月を走査
  let year = start.getFullYear();
  let month = start.getMonth() + 1; // 1-12

  const endYear = end.getFullYear();
  const endMonth = end.getMonth() + 1;

  while (year < endYear || (year === endYear && month <= endMonth)) {
    if (
      shouldRuleFireInMonth(
        rule.start_date,
        rule.interval_months,
        year,
        month,
        rule.end_date
      )
    ) {
      const day = getActualDayOfMonth(rule.day_of_month, year, month);
      const date = new Date(year, month - 1, day);

      // 期間内チェック（日付のみ比較）
      const dateStr = formatDateLocal(date);
      const startStr = formatDateLocal(start);
      const endStr = formatDateLocal(end);

      if (dateStr >= startStr && dateStr <= endStr) {
        dates.push(date);
      }
    }

    // 次の月へ
    month++;
    if (month > 12) {
      month = 1;
      year++;
    }
  }

  return dates;
}

/** ローカルタイムゾーンで YYYY-MM-DD 文字列に変換 */
function formatDateLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
