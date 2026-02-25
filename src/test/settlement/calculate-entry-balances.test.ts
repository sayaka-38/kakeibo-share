import { describe, it, expect } from "vitest";
import {
  calculateEntryBalances,
  type EntryMember,
} from "@/lib/settlement/calculate-entry-balances";
import type { EntryData } from "@/types/domain";

/** テスト用の最小限 EntryData を生成するヘルパー（split_type="equal"） */
function makeEntry(
  id: string,
  payerId: string,
  amount: number
): EntryData {
  return {
    id,
    session_id: "session-1",
    rule_id: "rule-1",
    payment_id: null,
    description: "テスト",
    category_id: null,
    expected_amount: amount,
    actual_amount: amount,
    payer_id: payerId,
    payment_date: "2026-01-31",
    status: "filled",
    split_type: "equal",
    entry_type: "recurring",
    filled_by: null,
    filled_at: null,
    source_payment_id: null,
    splits: [],
  };
}

/**
 * カスタム内訳エントリを生成するヘルパー（split_type="custom"）。
 * splits の amount は確定した負担額をそのまま格納する（比率計算なし）。
 */
function makeCustomEntry(
  id: string,
  payerId: string,
  actualAmount: number,
  splitData: { user_id: string; storedAmount: number }[]
): EntryData {
  return {
    id,
    session_id: "session-1",
    rule_id: "rule-2",
    payment_id: null,
    description: "カスタムテスト",
    category_id: null,
    expected_amount: splitData.reduce((s, x) => s + x.storedAmount, 0),
    actual_amount: actualAmount,
    payer_id: payerId,
    payment_date: "2026-01-31",
    status: "filled",
    split_type: "custom",
    entry_type: "recurring",
    filled_by: null,
    filled_at: null,
    source_payment_id: null,
    splits: splitData.map((s, i) => ({
      id: `split-${id}-${i}`,
      user_id: s.user_id,
      amount: s.storedAmount,
    })),
  };
}

const YOU = "user-you";
const PARTNER = "user-partner";

const twoMembers: EntryMember[] = [
  { id: YOU, name: "あなた" },
  { id: PARTNER, name: "パートナー" },
];

describe("calculateEntryBalances", () => {
  // === 異常系 ===

  describe("異常系", () => {
    it("メンバーが空配列の場合は空配列を返す", () => {
      const result = calculateEntryBalances([], []);
      expect(result).toEqual([]);
    });

    it("エントリが空の場合は全員 paid=owed=balance=0", () => {
      const result = calculateEntryBalances([], twoMembers);
      expect(result).toHaveLength(2);
      for (const b of result) {
        expect(b.paid).toBe(0);
        expect(b.owed).toBe(0);
        expect(b.balance).toBe(0);
      }
    });
  });

  // === Group A: 均等割り ===

  describe("Group A: split_type='equal' → 一括集計・1回割り", () => {
    it("1000円を2人で均等割り → 各500円", () => {
      const entries = [makeEntry("e1", YOU, 1000)];
      const result = calculateEntryBalances(entries, twoMembers);

      const you = result.find((b) => b.id === YOU)!;
      const partner = result.find((b) => b.id === PARTNER)!;

      expect(you.paid).toBe(1000);
      expect(you.owed).toBe(500);
      expect(you.balance).toBe(500);
      expect(partner.owed).toBe(500);
      expect(partner.balance).toBe(-500);
    });

    it("奇数（1001円）を2人で割る → 余りは最大 payer（あなた）へ", () => {
      const entries = [makeEntry("e1", YOU, 1001)];
      const result = calculateEntryBalances(entries, twoMembers);

      const you = result.find((b) => b.id === YOU)!;
      const partner = result.find((b) => b.id === PARTNER)!;

      // 1001 / 2 = 500 余り 1 → あなた（最大 payer）が 501
      expect(you.owed).toBe(501);
      expect(partner.owed).toBe(500);
      expect(you.owed + partner.owed).toBe(1001);
    });

    it("複数エントリでも端数は最後に1回だけ発生（誤差累積なし）", () => {
      // 各エントリで端数が出るが、合計後に1回だけ割る
      const entries = [
        makeEntry("e1", YOU, 1_001),
        makeEntry("e2", YOU, 1_001),
        makeEntry("e3", YOU, 1_001),
      ];
      // noSplitTotal = 3,003 → perPerson = 1,501, remainder = 1 → あなた 1,502
      const result = calculateEntryBalances(entries, twoMembers);
      const you = result.find((b) => b.id === YOU)!;
      const partner = result.find((b) => b.id === PARTNER)!;

      expect(you.owed).toBe(1_502);
      expect(partner.owed).toBe(1_501);
      expect(you.owed + partner.owed).toBe(3_003);
    });
  });

  // ===================================================================
  // Group B: split_type='custom' → splits.amount をそのまま加算
  // ===================================================================

  describe("Group B: split_type='custom' → splits.amount を直接使用", () => {
    it("full proxy（あなた100%）: splits.amount をそのまま加算", () => {
      const entries = [
        makeCustomEntry("e1", PARTNER, 10_000, [
          { user_id: YOU, storedAmount: 10_000 },
          { user_id: PARTNER, storedAmount: 0 },
        ]),
      ];
      const result = calculateEntryBalances(entries, twoMembers);
      const you = result.find((b) => b.id === YOU)!;

      expect(you.owed).toBe(10_000);
      expect(you.balance).toBe(-10_000);
    });

    it("70/30 split: splits.amount をそのまま加算", () => {
      const entries = [
        makeCustomEntry("e1", YOU, 1_000, [
          { user_id: YOU, storedAmount: 700 },
          { user_id: PARTNER, storedAmount: 300 },
        ]),
      ];
      const result = calculateEntryBalances(entries, twoMembers);
      const you = result.find((b) => b.id === YOU)!;
      const partner = result.find((b) => b.id === PARTNER)!;

      expect(you.owed).toBe(700);
      expect(partner.owed).toBe(300);
      expect(you.owed + partner.owed).toBe(1_000);
    });

    it("手動内訳: 1001円をあなた701円・パートナー300円で設定", () => {
      // EntryEditModal でバリデーション済み: 701+300=1001
      const entries = [
        makeCustomEntry("e1", YOU, 1_001, [
          { user_id: YOU, storedAmount: 701 },
          { user_id: PARTNER, storedAmount: 300 },
        ]),
      ];
      const result = calculateEntryBalances(entries, twoMembers);
      const you = result.find((b) => b.id === YOU)!;
      const partner = result.find((b) => b.id === PARTNER)!;

      expect(you.owed).toBe(701);
      expect(partner.owed).toBe(300);
      expect(you.owed + partner.owed).toBe(1_001);
    });

    it("複数カスタムエントリを独立して加算", () => {
      const entries = [
        makeCustomEntry("e1", PARTNER, 1_000, [
          { user_id: YOU, storedAmount: 1_000 },
          { user_id: PARTNER, storedAmount: 0 },
        ]),
        makeCustomEntry("e2", PARTNER, 500, [
          { user_id: YOU, storedAmount: 300 },
          { user_id: PARTNER, storedAmount: 200 },
        ]),
        makeCustomEntry("e3", PARTNER, 800, [
          { user_id: YOU, storedAmount: 400 },
          { user_id: PARTNER, storedAmount: 400 },
        ]),
      ];
      const result = calculateEntryBalances(entries, twoMembers);
      const you = result.find((b) => b.id === YOU)!;
      const partner = result.find((b) => b.id === PARTNER)!;

      // YOU: 1000+300+400 = 1700, PARTNER: 0+200+400 = 600
      expect(you.owed).toBe(1_700);
      expect(partner.owed).toBe(600);
    });
  });

  // ===================================================================
  // 実データ再現ケース（1円の狂いもなく）
  // ===================================================================

  describe("実データ再現: 総支出 ¥191,148 のケース", () => {
    it("あなた支払 181,148（equal） + パートナー立替 10,000（full proxy） → 負担 100,574 / 差額 +80,574", () => {
      /**
       * シナリオ:
       * - あなた: ¥181,148 の equal-split エントリ（splits なし）
       * - パートナー: ¥10,000 の full proxy エントリ（splits=[YOU=10,000, PARTNER=0]）
       *
       * 期待値:
       *   Group A total = 181,148 → perPerson = 90,574 (余り 0)
       *   Group B: あなたの owed = 10,000
       *   あなたの総負担 = 90,574 + 10,000 = 100,574
       *   差額 = 181,148 - 100,574 = +80,574
       */
      const entries = [
        makeEntry("e1", YOU, 181_148),
        makeCustomEntry("e2", PARTNER, 10_000, [
          { user_id: YOU, storedAmount: 10_000 },
          { user_id: PARTNER, storedAmount: 0 },
        ]),
      ];

      const result = calculateEntryBalances(entries, twoMembers);
      const you = result.find((b) => b.id === YOU)!;
      const partner = result.find((b) => b.id === PARTNER)!;

      expect(you.paid).toBe(181_148);
      expect(partner.paid).toBe(10_000);

      expect(you.owed).toBe(100_574);
      expect(partner.owed).toBe(90_574);

      expect(you.balance).toBe(80_574);
      expect(partner.balance).toBe(-80_574);

      expect(you.balance + partner.balance).toBe(0);
      expect(you.owed + partner.owed).toBe(191_148);
    });

    it("均等割り6項目(合計¥181,148) + カスタム¥10,000(あなた100%) → 負担¥100,574 / 差額+¥80,574", () => {
      const entries = [
        makeEntry("e1", YOU, 15_463),
        makeEntry("e2", YOU, 10_105),
        makeEntry("e3", YOU, 128_000),
        makeEntry("e4", YOU, 4_950),
        makeEntry("e5", YOU, 8_355),
        makeEntry("e6", YOU, 14_275),
        makeCustomEntry("e7", PARTNER, 10_000, [
          { user_id: YOU, storedAmount: 10_000 },
          { user_id: PARTNER, storedAmount: 0 },
        ]),
      ];

      const result = calculateEntryBalances(entries, twoMembers);
      const you = result.find((b) => b.id === YOU)!;
      const partner = result.find((b) => b.id === PARTNER)!;

      expect(you.paid).toBe(181_148);
      expect(partner.paid).toBe(10_000);

      expect(you.owed).toBe(100_574);
      expect(partner.owed).toBe(90_574);

      expect(you.balance).toBe(80_574);
      expect(partner.balance).toBe(-80_574);

      expect(you.balance + partner.balance).toBe(0);
      expect(you.owed + partner.owed).toBe(191_148);
    });
  });

  // === Group A + Group B 混在 ===

  describe("Group A + Group B 混在", () => {
    it("均等割り + proxy が混在", () => {
      const entries = [
        makeEntry("e1", YOU, 2_000), // Group A
        makeCustomEntry("e2", YOU, 1_000, [
          { user_id: YOU, storedAmount: 0 },
          { user_id: PARTNER, storedAmount: 1_000 },
        ]), // Group B: あなたが立替、パートナー全額負担
      ];

      const result = calculateEntryBalances(entries, twoMembers);
      const you = result.find((b) => b.id === YOU)!;
      const partner = result.find((b) => b.id === PARTNER)!;

      // Group A: 2000/2 = 1000 each
      // Group B: YOU=0, PARTNER=1000
      expect(you.owed).toBe(1_000);
      expect(partner.owed).toBe(2_000); // 1000 + 1000
      expect(you.balance).toBe(2_000);  // paid=3000, owed=1000
      expect(partner.balance).toBe(-2_000);
      expect(you.balance + partner.balance).toBe(0);
    });
  });
});
