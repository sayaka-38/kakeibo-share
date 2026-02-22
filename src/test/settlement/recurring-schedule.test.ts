/**
 * recurring-schedule.ts 単体テスト
 *
 * shouldRuleFireInMonth, getActualDayOfMonth, computeRuleDatesInPeriod の
 * 正常系・境界値・異常系を検証。
 */

import { describe, it, expect } from "vitest";
import {
  shouldRuleFireInMonth,
  getActualDayOfMonth,
  computeRuleDatesInPeriod,
} from "@/lib/settlement/recurring-schedule";

// =============================================================================
// shouldRuleFireInMonth
// =============================================================================
describe("shouldRuleFireInMonth", () => {
  const startDate = "2026-01-15T00:00:00Z"; // 2026年1月が開始月

  describe("正常系: 毎月 (interval=1)", () => {
    it("開始月に発生する", () => {
      expect(shouldRuleFireInMonth(startDate, 1, 2026, 1)).toBe(true);
    });

    it("翌月に発生する", () => {
      expect(shouldRuleFireInMonth(startDate, 1, 2026, 2)).toBe(true);
    });

    it("12ヶ月後に発生する", () => {
      expect(shouldRuleFireInMonth(startDate, 1, 2027, 1)).toBe(true);
    });
  });

  describe("正常系: 隔月 (interval=2)", () => {
    it("開始月に発生する", () => {
      expect(shouldRuleFireInMonth(startDate, 2, 2026, 1)).toBe(true);
    });

    it("2ヶ月後に発生する", () => {
      expect(shouldRuleFireInMonth(startDate, 2, 2026, 3)).toBe(true);
    });

    it("1ヶ月後には発生しない", () => {
      expect(shouldRuleFireInMonth(startDate, 2, 2026, 2)).toBe(false);
    });

    it("3ヶ月後には発生しない", () => {
      expect(shouldRuleFireInMonth(startDate, 2, 2026, 4)).toBe(false);
    });
  });

  describe("正常系: 四半期 (interval=3)", () => {
    it("開始月に発生する", () => {
      expect(shouldRuleFireInMonth(startDate, 3, 2026, 1)).toBe(true);
    });

    it("3ヶ月後に発生する", () => {
      expect(shouldRuleFireInMonth(startDate, 3, 2026, 4)).toBe(true);
    });

    it("6ヶ月後に発生する", () => {
      expect(shouldRuleFireInMonth(startDate, 3, 2026, 7)).toBe(true);
    });

    it("2ヶ月後には発生しない", () => {
      expect(shouldRuleFireInMonth(startDate, 3, 2026, 3)).toBe(false);
    });
  });

  describe("境界値: 年越し", () => {
    it("interval=2 で12月→翌年2月に発生する", () => {
      const novStart = "2025-11-01T00:00:00Z";
      expect(shouldRuleFireInMonth(novStart, 2, 2026, 1)).toBe(true);
      expect(shouldRuleFireInMonth(novStart, 2, 2026, 3)).toBe(true);
    });

    it("interval=12 で年1回発生する", () => {
      expect(shouldRuleFireInMonth(startDate, 12, 2027, 1)).toBe(true);
      expect(shouldRuleFireInMonth(startDate, 12, 2027, 2)).toBe(false);
      expect(shouldRuleFireInMonth(startDate, 12, 2028, 1)).toBe(true);
    });
  });

  describe("境界値: 開始月以前", () => {
    it("start_date の月より前の月には発生しない", () => {
      expect(shouldRuleFireInMonth(startDate, 1, 2025, 12)).toBe(false);
    });
  });

  describe("遡り清算: start_date が過去でも正しく判定できる", () => {
    it("2月作成のルールに start_date=1/1 を設定すれば1月に発生する", () => {
      // ルール自体は2月に作成されたが start_date を1/1に設定
      const retroStartDate = "2026-01-01";
      expect(shouldRuleFireInMonth(retroStartDate, 1, 2026, 1)).toBe(true);
    });

    it("start_date=1/1 のルールが2月にも発生する", () => {
      const retroStartDate = "2026-01-01";
      expect(shouldRuleFireInMonth(retroStartDate, 1, 2026, 2)).toBe(true);
    });
  });

  describe("end_date: 終了月以降は発生しない", () => {
    it("end_date の月には発生する", () => {
      expect(shouldRuleFireInMonth(startDate, 1, 2026, 3, "2026-03-31")).toBe(true);
    });

    it("end_date の翌月には発生しない", () => {
      expect(shouldRuleFireInMonth(startDate, 1, 2026, 4, "2026-03-31")).toBe(false);
    });

    it("end_date=null は無期限として扱う", () => {
      expect(shouldRuleFireInMonth(startDate, 1, 2030, 1, null)).toBe(true);
    });

    it("end_date 未指定は無期限として扱う", () => {
      expect(shouldRuleFireInMonth(startDate, 1, 2030, 1)).toBe(true);
    });
  });

  describe("異常系", () => {
    it("interval ≤ 0 は false を返す", () => {
      expect(shouldRuleFireInMonth(startDate, 0, 2026, 1)).toBe(false);
      expect(shouldRuleFireInMonth(startDate, -1, 2026, 1)).toBe(false);
    });

    it("不正な月 (0, 13) は false を返す", () => {
      expect(shouldRuleFireInMonth(startDate, 1, 2026, 0)).toBe(false);
      expect(shouldRuleFireInMonth(startDate, 1, 2026, 13)).toBe(false);
    });
  });
});

// =============================================================================
// getActualDayOfMonth
// =============================================================================
describe("getActualDayOfMonth", () => {
  it("通常の日はそのまま返す", () => {
    expect(getActualDayOfMonth(15, 2026, 3)).toBe(15);
  });

  it("31日 → 2月は28日を返す（非閏年）", () => {
    expect(getActualDayOfMonth(31, 2026, 2)).toBe(28);
  });

  it("31日 → 2月は29日を返す（閏年）", () => {
    expect(getActualDayOfMonth(31, 2024, 2)).toBe(29);
  });

  it("31日 → 4月は30日を返す", () => {
    expect(getActualDayOfMonth(31, 2026, 4)).toBe(30);
  });

  it("31日 → 1月は31日を返す", () => {
    expect(getActualDayOfMonth(31, 2026, 1)).toBe(31);
  });

  it("30日 → 2月は28日を返す（非閏年）", () => {
    expect(getActualDayOfMonth(30, 2026, 2)).toBe(28);
  });

  it("1日はどの月でも1日", () => {
    expect(getActualDayOfMonth(1, 2026, 2)).toBe(1);
  });
});

// =============================================================================
// computeRuleDatesInPeriod
// =============================================================================
describe("computeRuleDatesInPeriod", () => {
  describe("毎月 (interval=1)", () => {
    it("3ヶ月期間で3つの日付を返す", () => {
      const dates = computeRuleDatesInPeriod(
        { start_date: "2026-01-01", interval_months: 1, day_of_month: 15 },
        "2026-01-01",
        "2026-03-31"
      );
      expect(dates).toHaveLength(3);
      expect(dates[0].getMonth()).toBe(0); // Jan
      expect(dates[0].getDate()).toBe(15);
      expect(dates[1].getMonth()).toBe(1); // Feb
      expect(dates[2].getMonth()).toBe(2); // Mar
    });
  });

  describe("隔月 (interval=2)", () => {
    it("4ヶ月期間で2つの日付を返す", () => {
      const dates = computeRuleDatesInPeriod(
        { start_date: "2026-01-01", interval_months: 2, day_of_month: 10 },
        "2026-01-01",
        "2026-04-30"
      );
      expect(dates).toHaveLength(2); // Jan, Mar
      expect(dates[0].getMonth()).toBe(0); // Jan
      expect(dates[1].getMonth()).toBe(2); // Mar
    });
  });

  describe("末日対応", () => {
    it("day_of_month=31 で2月は28日に補正される", () => {
      const dates = computeRuleDatesInPeriod(
        { start_date: "2026-01-01", interval_months: 1, day_of_month: 31 },
        "2026-02-01",
        "2026-02-28"
      );
      expect(dates).toHaveLength(1);
      expect(dates[0].getDate()).toBe(28);
    });
  });

  describe("期間外除外", () => {
    it("期間開始日より前の日付は含まれない", () => {
      const dates = computeRuleDatesInPeriod(
        { start_date: "2026-01-01", interval_months: 1, day_of_month: 5 },
        "2026-01-10",
        "2026-02-28"
      );
      // 1月5日は除外、2月5日のみ
      expect(dates).toHaveLength(1);
      expect(dates[0].getMonth()).toBe(1);
    });

    it("期間終了日より後の日付は含まれない", () => {
      const dates = computeRuleDatesInPeriod(
        { start_date: "2026-01-01", interval_months: 1, day_of_month: 25 },
        "2026-01-01",
        "2026-02-20"
      );
      // 1月25日のみ、2月25日は除外
      expect(dates).toHaveLength(1);
      expect(dates[0].getMonth()).toBe(0);
    });
  });

  describe("start_date 月より前の期間", () => {
    it("start_date の月より前の月は含まれない", () => {
      const dates = computeRuleDatesInPeriod(
        { start_date: "2026-03-01", interval_months: 1, day_of_month: 15 },
        "2026-01-01",
        "2026-04-30"
      );
      // 3月と4月のみ（1月2月はstart_date前）
      expect(dates).toHaveLength(2);
      expect(dates[0].getMonth()).toBe(2); // Mar
      expect(dates[1].getMonth()).toBe(3); // Apr
    });
  });

  describe("遡り清算: start_date が期間より前", () => {
    it("start_date=1/1 のルールを1月期間に適用できる", () => {
      const dates = computeRuleDatesInPeriod(
        { start_date: "2026-01-01", interval_months: 1, day_of_month: 15 },
        "2026-01-01",
        "2026-01-31"
      );
      // 1月に発生
      expect(dates).toHaveLength(1);
      expect(dates[0].getMonth()).toBe(0); // Jan
      expect(dates[0].getDate()).toBe(15);
    });
  });

  describe("end_date による終了", () => {
    it("end_date 以降の月は含まれない", () => {
      const dates = computeRuleDatesInPeriod(
        { start_date: "2026-01-01", end_date: "2026-02-28", interval_months: 1, day_of_month: 15 },
        "2026-01-01",
        "2026-04-30"
      );
      // 1月・2月のみ（3月4月は end_date 後）
      expect(dates).toHaveLength(2);
      expect(dates[0].getMonth()).toBe(0); // Jan
      expect(dates[1].getMonth()).toBe(1); // Feb
    });

    it("end_date=null は無期限として扱う", () => {
      const dates = computeRuleDatesInPeriod(
        { start_date: "2026-01-01", end_date: null, interval_months: 1, day_of_month: 15 },
        "2026-01-01",
        "2026-03-31"
      );
      expect(dates).toHaveLength(3);
    });
  });

  describe("空の期間", () => {
    it("期間に該当なしの場合は空配列", () => {
      const dates = computeRuleDatesInPeriod(
        { start_date: "2026-01-01", interval_months: 6, day_of_month: 15 },
        "2026-02-01",
        "2026-06-30"
      );
      // interval=6: Jan, Jul — 期間 Feb-Jun には該当なし
      expect(dates).toHaveLength(0);
    });
  });
});
