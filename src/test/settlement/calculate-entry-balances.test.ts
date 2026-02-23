import { describe, it, expect } from "vitest";
import {
  calculateEntryBalances,
  type EntryMember,
} from "@/lib/settlement/calculate-entry-balances";
import type { EntryData } from "@/types/domain";

/** テスト用の最小限 EntryData を生成するヘルパー */
function makeEntry(
  id: string,
  payerId: string,
  amount: number,
  splits?: { id: string; user_id: string; amount: number }[]
): EntryData {
  return {
    id,
    session_id: "session-1",
    rule_id: null,
    payment_id: null,
    description: "テスト",
    category_id: null,
    expected_amount: amount,
    actual_amount: amount,
    payer_id: payerId,
    payment_date: "2026-01-31",
    status: "filled",
    split_type: splits ? "custom" : "equal",
    entry_type: "recurring",
    filled_by: null,
    filled_at: null,
    source_payment_id: null,
    splits,
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

  // === 基本ケース ===

  describe("splits なし（均等割り）", () => {
    it("1000円を2人で均等割り → 各500円", () => {
      const entries = [makeEntry("e1", YOU, 1000)];
      const result = calculateEntryBalances(entries, twoMembers);

      const you = result.find((b) => b.id === YOU)!;
      const partner = result.find((b) => b.id === PARTNER)!;

      expect(you.paid).toBe(1000);
      expect(you.owed).toBe(500);
      expect(you.balance).toBe(500);

      expect(partner.paid).toBe(0);
      expect(partner.owed).toBe(500);
      expect(partner.balance).toBe(-500);
    });

    it("奇数金額（1001円）を2人で割る → 余りは最大 payer（あなた）へ", () => {
      const entries = [makeEntry("e1", YOU, 1001)];
      const result = calculateEntryBalances(entries, twoMembers);

      const you = result.find((b) => b.id === YOU)!;
      const partner = result.find((b) => b.id === PARTNER)!;

      // 1001 / 2 = 500 余り 1 → あなた（最大 payer）が 501 負担
      expect(you.owed).toBe(501); // 500 + 1（余り）
      expect(partner.owed).toBe(500);

      // 合計が一致することを検証
      expect(you.owed + partner.owed).toBe(1001);
    });

    it("合計奇数（3円）を2人で割る → 余りは最大 payer へ", () => {
      const entries = [makeEntry("e1", YOU, 3)];
      const result = calculateEntryBalances(entries, twoMembers);

      const you = result.find((b) => b.id === YOU)!;
      const partner = result.find((b) => b.id === PARTNER)!;

      // 3 / 2 = 1 余り 1 → あなたが 2 負担
      expect(you.owed).toBe(2);
      expect(partner.owed).toBe(1);
      expect(you.owed + partner.owed).toBe(3);
    });
  });

  // === 実データ再現ケース ===

  describe("実データ再現: 191,148 円のケース（1円の狂いもなく）", () => {
    it("総支出 191,148 / あなた支払 181,148 / 相手立替 10,000 → 負担 100,574 / 差額 +80,574", () => {
      /**
       * シナリオ:
       * - あなた: 181,148円の支払い（splits なし = 均等割り対象）
       * - パートナー: 10,000円の立替（Proxy, splits=[あなた=10,000, パートナー=0]）
       *
       * 期待値:
       * - noSplitTotal = 181,148
       * - noSplitPerPerson = Math.floor(181,148 / 2) = 90,574
       * - remainder = 181,148 % 2 = 0（端数なし）
       * - owedFromSplits(あなた) = 10,000
       * - あなたの負担分 = 90,574 + 0 + 10,000 = 100,574
       * - あなたの差額 = 181,148 - 100,574 = +80,574
       */
      const entries = [
        // あなたの支払い: splits なし（均等割り）
        makeEntry("e1", YOU, 181_148),
        // パートナーの立替: あなたが 100% 負担（Proxy）
        makeEntry("e2", PARTNER, 10_000, [
          { id: "s1", user_id: YOU, amount: 10_000 },
          { id: "s2", user_id: PARTNER, amount: 0 },
        ]),
      ];

      const result = calculateEntryBalances(entries, twoMembers);
      const you = result.find((b) => b.id === YOU)!;
      const partner = result.find((b) => b.id === PARTNER)!;

      // 支払い
      expect(you.paid).toBe(181_148);
      expect(partner.paid).toBe(10_000);

      // 負担分
      expect(you.owed).toBe(100_574); // 90,574 + 10,000
      expect(partner.owed).toBe(90_574); // 90,574 + 0

      // 差額
      expect(you.balance).toBe(80_574); // +80,574（もらう）
      expect(partner.balance).toBe(-80_574); // -80,574（払う）

      // 残高合計 = 0
      expect(you.balance + partner.balance).toBe(0);

      // 負担合計 = 総支出
      expect(you.owed + partner.owed).toBe(191_148);
    });

    it("奇数ケースでも sum(owed) = sum(paid) を保証", () => {
      // noSplitTotal が奇数の場合の検証
      const entries = [
        makeEntry("e1", YOU, 181_149), // 奇数
        makeEntry("e2", PARTNER, 10_000, [
          { id: "s1", user_id: YOU, amount: 10_000 },
          { id: "s2", user_id: PARTNER, amount: 0 },
        ]),
      ];

      const result = calculateEntryBalances(entries, twoMembers);
      const you = result.find((b) => b.id === YOU)!;
      const partner = result.find((b) => b.id === PARTNER)!;

      // 181,149 / 2 = 90,574 余り 1 → あなた（最大 payer）が余り 1 を負担
      expect(you.owed).toBe(100_575); // 90,574 + 1 + 10,000
      expect(partner.owed).toBe(90_574); // 90,574 + 0

      // 負担合計 = 総支出
      expect(you.owed + partner.owed).toBe(191_149);
    });
  });

  // === splits あり（Proxy）===

  describe("splits あり（Proxy）", () => {
    it("全額 proxy → あなたが全額負担", () => {
      const entries = [
        makeEntry("e1", PARTNER, 5_000, [
          { id: "s1", user_id: YOU, amount: 5_000 },
          { id: "s2", user_id: PARTNER, amount: 0 },
        ]),
      ];
      const result = calculateEntryBalances(entries, twoMembers);
      const you = result.find((b) => b.id === YOU)!;
      const partner = result.find((b) => b.id === PARTNER)!;

      expect(you.paid).toBe(0);
      expect(you.owed).toBe(5_000);
      expect(you.balance).toBe(-5_000);

      expect(partner.paid).toBe(5_000);
      expect(partner.owed).toBe(0);
      expect(partner.balance).toBe(5_000);
    });
  });

  // === 混在（splits あり/なし）===

  describe("splits あり/なし 混在", () => {
    it("均等割り + proxy が混在する場合", () => {
      const entries = [
        makeEntry("e1", YOU, 2_000), // 均等割り（splits なし）
        makeEntry("e2", YOU, 1_000, [
          { id: "s1", user_id: YOU, amount: 0 },
          { id: "s2", user_id: PARTNER, amount: 1_000 },
        ]), // proxy: パートナーが全額負担
      ];

      const result = calculateEntryBalances(entries, twoMembers);
      const you = result.find((b) => b.id === YOU)!;
      const partner = result.find((b) => b.id === PARTNER)!;

      // noSplitTotal = 2,000 → perPerson = 1,000, remainder = 0
      // あなたの owedFromSplits = 0（proxy のあなた splits = 0）
      // パートナーの owedFromSplits = 1,000
      expect(you.owed).toBe(1_000); // 1,000 + 0
      expect(partner.owed).toBe(2_000); // 1,000 + 1,000

      // あなた: paid=3,000, owed=1,000 → balance=2,000
      expect(you.balance).toBe(2_000);
      // パートナー: paid=0, owed=2,000 → balance=-2,000
      expect(partner.balance).toBe(-2_000);

      // 残高合計 = 0
      expect(you.balance + partner.balance).toBe(0);
    });

    it("splits なしのみ: 複数エントリを一括集計（誤差累積なし）", () => {
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
});
