import { describe, it, expect } from "vitest";

/**
 * 期間計算ロジックのテスト
 *
 * RPC `get_settlement_period_suggestion` (Migration 020) の仕様をテストする。
 * 実際の RPC は PostgreSQL で実行されるため、ここではロジックの仕様を
 * TypeScript で再現し、境界値テストを行う。
 *
 * ルール:
 *   - 終了日: DB内の未清算データの最新日付。データがなければ今日
 *   - 開始日:
 *     - 前回清算日がある場合: 前回清算日の翌日
 *     - 前回清算日当日に未清算データがある場合: その日を含む
 *     - 前回清算日がない場合: 未清算の最古日 or 今月1日
 *   - 安全装置: 常に開始日 ≦ 終了日
 */

type PeriodSuggestionInput = {
  /** 未清算支払いの最古日（null = データなし） */
  oldestUnsettledDate: string | null;
  /** 未清算支払いの最新日（null = データなし） */
  newestUnsettledDate: string | null;
  /** 未清算支払いの件数 */
  unsettledCount: number;
  /** 前回確定済みセッションの終了日（null = 過去の清算なし） */
  lastConfirmedEnd: string | null;
  /** 前回清算日当日に未清算データがあるか */
  hasUnsettledOnLastConfirmed: boolean;
  /** 今日の日付 */
  today: string;
};

type PeriodSuggestionResult = {
  suggestedStart: string;
  suggestedEnd: string;
};

/**
 * get_settlement_period_suggestion の TypeScript 再現
 * (Migration 020 の SQL ロジックと同等)
 */
function calculatePeriodSuggestion(
  input: PeriodSuggestionInput
): PeriodSuggestionResult {
  const {
    oldestUnsettledDate,
    newestUnsettledDate,
    lastConfirmedEnd,
    hasUnsettledOnLastConfirmed,
    today,
  } = input;

  // 終了日: 未清算データの最新日付。データがなければ今日
  const suggestedEnd = newestUnsettledDate ?? today;

  // 開始日を計算
  let suggestedStart: string;

  if (lastConfirmedEnd) {
    if (hasUnsettledOnLastConfirmed) {
      // 前回清算日当日に未清算データがある → その日を含む
      suggestedStart = lastConfirmedEnd;
    } else {
      // 通常: 前回清算日の翌日
      const d = new Date(lastConfirmedEnd);
      d.setDate(d.getDate() + 1);
      suggestedStart = d.toISOString().split("T")[0];
    }
  } else {
    // 前回清算なし: 未清算の最古日 or 今月1日
    suggestedStart = oldestUnsettledDate ?? today.slice(0, 7) + "-01";
  }

  // 安全装置: 未清算の最古日が開始日より前なら最古日を使う
  // （前回清算後に過去日付の支払いが追加された場合）
  if (oldestUnsettledDate && suggestedStart > oldestUnsettledDate) {
    suggestedStart = oldestUnsettledDate;
  }

  // 安全装置: 開始日 ≦ 終了日
  if (suggestedStart > suggestedEnd) {
    suggestedStart = suggestedEnd;
  }

  return { suggestedStart, suggestedEnd };
}

// =============================================================================
// テスト
// =============================================================================

describe("期間計算ロジック (get_settlement_period_suggestion)", () => {
  // =========================================================================
  // 前回清算日がない場合
  // =========================================================================
  describe("前回清算日がない場合", () => {
    it("未清算データがある場合: 開始日=最古日、終了日=最新日", () => {
      const result = calculatePeriodSuggestion({
        oldestUnsettledDate: "2026-01-05",
        newestUnsettledDate: "2026-01-25",
        unsettledCount: 5,
        lastConfirmedEnd: null,
        hasUnsettledOnLastConfirmed: false,
        today: "2026-02-07",
      });

      expect(result.suggestedStart).toBe("2026-01-05");
      expect(result.suggestedEnd).toBe("2026-01-25");
    });

    it("未清算データがない場合: 開始日=今月1日、終了日=今日", () => {
      const result = calculatePeriodSuggestion({
        oldestUnsettledDate: null,
        newestUnsettledDate: null,
        unsettledCount: 0,
        lastConfirmedEnd: null,
        hasUnsettledOnLastConfirmed: false,
        today: "2026-02-07",
      });

      expect(result.suggestedStart).toBe("2026-02-01");
      expect(result.suggestedEnd).toBe("2026-02-07");
    });

    it("未清算データが1件だけの場合: 開始日=終了日=その日", () => {
      const result = calculatePeriodSuggestion({
        oldestUnsettledDate: "2026-01-15",
        newestUnsettledDate: "2026-01-15",
        unsettledCount: 1,
        lastConfirmedEnd: null,
        hasUnsettledOnLastConfirmed: false,
        today: "2026-02-07",
      });

      expect(result.suggestedStart).toBe("2026-01-15");
      expect(result.suggestedEnd).toBe("2026-01-15");
    });

    it("今日に未清算データがある場合: 終了日は今日", () => {
      const result = calculatePeriodSuggestion({
        oldestUnsettledDate: "2026-02-01",
        newestUnsettledDate: "2026-02-07",
        unsettledCount: 3,
        lastConfirmedEnd: null,
        hasUnsettledOnLastConfirmed: false,
        today: "2026-02-07",
      });

      expect(result.suggestedEnd).toBe("2026-02-07");
    });
  });

  // =========================================================================
  // 前回清算日がある場合
  // =========================================================================
  describe("前回清算日がある場合", () => {
    it("通常ケース: 開始日=前回清算日の翌日", () => {
      const result = calculatePeriodSuggestion({
        oldestUnsettledDate: "2026-02-01",
        newestUnsettledDate: "2026-02-05",
        unsettledCount: 3,
        lastConfirmedEnd: "2026-01-31",
        hasUnsettledOnLastConfirmed: false,
        today: "2026-02-07",
      });

      expect(result.suggestedStart).toBe("2026-02-01");
      expect(result.suggestedEnd).toBe("2026-02-05");
    });

    it("前回清算日当日に未清算データがある場合: その日を含む", () => {
      const result = calculatePeriodSuggestion({
        oldestUnsettledDate: "2026-01-31",
        newestUnsettledDate: "2026-02-05",
        unsettledCount: 4,
        lastConfirmedEnd: "2026-01-31",
        hasUnsettledOnLastConfirmed: true,
        today: "2026-02-07",
      });

      // 前回清算日当日を含むので1/31が開始日
      expect(result.suggestedStart).toBe("2026-01-31");
      expect(result.suggestedEnd).toBe("2026-02-05");
    });

    it("前回清算日当日に未清算データがない場合: 翌日が開始日", () => {
      const result = calculatePeriodSuggestion({
        oldestUnsettledDate: "2026-02-01",
        newestUnsettledDate: "2026-02-05",
        unsettledCount: 3,
        lastConfirmedEnd: "2026-01-31",
        hasUnsettledOnLastConfirmed: false,
        today: "2026-02-07",
      });

      expect(result.suggestedStart).toBe("2026-02-01");
    });

    it("月末境界: 前回清算が1/31、翌日は2/1", () => {
      const result = calculatePeriodSuggestion({
        oldestUnsettledDate: "2026-02-01",
        newestUnsettledDate: "2026-02-15",
        unsettledCount: 5,
        lastConfirmedEnd: "2026-01-31",
        hasUnsettledOnLastConfirmed: false,
        today: "2026-02-15",
      });

      expect(result.suggestedStart).toBe("2026-02-01");
    });

    it("年末境界: 前回清算が12/31、翌日は翌年1/1", () => {
      const result = calculatePeriodSuggestion({
        oldestUnsettledDate: "2027-01-01",
        newestUnsettledDate: "2027-01-10",
        unsettledCount: 3,
        lastConfirmedEnd: "2026-12-31",
        hasUnsettledOnLastConfirmed: false,
        today: "2027-01-10",
      });

      expect(result.suggestedStart).toBe("2027-01-01");
    });

    it("2月末境界: 前回清算が2/28（非閏年）、翌日は3/1", () => {
      const result = calculatePeriodSuggestion({
        oldestUnsettledDate: "2027-03-01",
        newestUnsettledDate: "2027-03-10",
        unsettledCount: 2,
        lastConfirmedEnd: "2027-02-28",
        hasUnsettledOnLastConfirmed: false,
        today: "2027-03-10",
      });

      expect(result.suggestedStart).toBe("2027-03-01");
    });
  });

  // =========================================================================
  // 過去日付の未清算支払い（retroactive）
  // =========================================================================
  describe("過去日付の未清算支払い", () => {
    it("前回清算後に過去日付の支払いが追加された場合: 開始日=最古未清算日", () => {
      // 前回清算は2/6まで確定済み。翌日=2/7が通常の開始日
      // しかし 2/5 の未清算支払いが後から追加された
      const result = calculatePeriodSuggestion({
        oldestUnsettledDate: "2026-02-05",
        newestUnsettledDate: "2026-02-07",
        unsettledCount: 3,
        lastConfirmedEnd: "2026-02-06",
        hasUnsettledOnLastConfirmed: false,
        today: "2026-02-07",
      });

      // 開始日は 2/7 ではなく 2/5（最古未清算日）
      expect(result.suggestedStart).toBe("2026-02-05");
      expect(result.suggestedEnd).toBe("2026-02-07");
    });

    it("前回清算前の日付に未清算がある場合も最古日を使う", () => {
      const result = calculatePeriodSuggestion({
        oldestUnsettledDate: "2026-01-20",
        newestUnsettledDate: "2026-02-05",
        unsettledCount: 5,
        lastConfirmedEnd: "2026-01-31",
        hasUnsettledOnLastConfirmed: false,
        today: "2026-02-07",
      });

      // 通常なら 2/1 だが、1/20 の未清算があるので 1/20
      expect(result.suggestedStart).toBe("2026-01-20");
      expect(result.suggestedEnd).toBe("2026-02-05");
    });
  });

  // =========================================================================
  // 安全装置: 開始日 ≦ 終了日
  // =========================================================================
  describe("安全装置: 開始日 ≦ 終了日", () => {
    it("開始日 > 終了日 になりそうな場合: 開始日を終了日に揃える", () => {
      // 前回清算が2/5、未清算データが2/3にしかない（過去の支払い）
      const result = calculatePeriodSuggestion({
        oldestUnsettledDate: "2026-02-03",
        newestUnsettledDate: "2026-02-03",
        unsettledCount: 1,
        lastConfirmedEnd: "2026-02-05",
        hasUnsettledOnLastConfirmed: false,
        today: "2026-02-07",
      });

      // 前回清算翌日 = 2/6 だが、終了日 = 2/3（未清算最新日）
      // 安全装置発動: 開始日 = 終了日 = 2/3
      expect(result.suggestedStart).toBe("2026-02-03");
      expect(result.suggestedEnd).toBe("2026-02-03");
      expect(result.suggestedStart <= result.suggestedEnd).toBe(true);
    });

    it("正常ケースでは安全装置は発動しない", () => {
      const result = calculatePeriodSuggestion({
        oldestUnsettledDate: "2026-02-01",
        newestUnsettledDate: "2026-02-07",
        unsettledCount: 5,
        lastConfirmedEnd: "2026-01-31",
        hasUnsettledOnLastConfirmed: false,
        today: "2026-02-07",
      });

      expect(result.suggestedStart <= result.suggestedEnd).toBe(true);
      expect(result.suggestedStart).toBe("2026-02-01");
      expect(result.suggestedEnd).toBe("2026-02-07");
    });
  });
});
