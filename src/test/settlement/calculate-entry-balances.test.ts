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
 * storedSplits は rule 生成時の金額（default_amount ベース）。
 * actualAmount を別途指定して「実際の填記金額 ≠ default」ケースを再現できる。
 */
function makeCustomEntry(
  id: string,
  payerId: string,
  actualAmount: number,
  storedSplits: { user_id: string; storedAmount: number }[]
): EntryData {
  return {
    id,
    session_id: "session-1",
    rule_id: "rule-2",
    payment_id: null,
    description: "カスタムテスト",
    category_id: null,
    expected_amount: storedSplits.reduce((s, x) => s + x.storedAmount, 0),
    actual_amount: actualAmount,
    payer_id: payerId,
    payment_date: "2026-01-31",
    status: "filled",
    split_type: "custom",
    entry_type: "recurring",
    filled_by: null,
    filled_at: null,
    source_payment_id: null,
    splits: storedSplits.map((s, i) => ({
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
  // Group B: split_type='custom' → actual_amount への正規化
  // ===================================================================

  describe("Group B: split_type='custom' → splits を actual_amount に正規化", () => {
    it("full proxy（100%）: stored=actual → そのまま加算", () => {
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

    it("full proxy: actual ≠ stored → actual_amount に正規化", () => {
      // ルールの default_amount=9_000 でエントリ生成、実際には10_001円払った
      const entries = [
        makeCustomEntry("e1", PARTNER, 10_001, [
          { user_id: YOU, storedAmount: 9_000 }, // stored は default ベース
          { user_id: PARTNER, storedAmount: 0 },
        ]),
      ];
      const result = calculateEntryBalances(entries, twoMembers);
      const you = result.find((b) => b.id === YOU)!;

      // 正規化: floor(10001 * 9000 / 9000) = 10001
      expect(you.owed).toBe(10_001);
      expect(you.balance).toBe(-10_001);
    });

    it("70/30 split: stored=actual → そのまま", () => {
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

    it("70/30 split: actual ≠ stored → actual_amount に正規化", () => {
      // default=1000 で生成、実際は 1001 円
      const entries = [
        makeCustomEntry("e1", YOU, 1_001, [
          { user_id: YOU, storedAmount: 700 }, // 70% based on default 1000
          { user_id: PARTNER, storedAmount: 300 }, // 30%
        ]),
      ];
      const result = calculateEntryBalances(entries, twoMembers);
      const you = result.find((b) => b.id === YOU)!;
      const partner = result.find((b) => b.id === PARTNER)!;

      // floor(1001*700/1000)=700, floor(1001*300/1000)=300 → assigned=1000, remainder=1
      // 余りは最大 stored（YOU=700）へ → YOU=701, PARTNER=300
      expect(you.owed).toBe(701);
      expect(partner.owed).toBe(300);
      expect(you.owed + partner.owed).toBe(1_001); // sum(owed) = actual_amount ✓
    });

    it("actual_amount > storedTotal: 12,000円 / stored=[A=5000, B=5000] → A=6,000, B=6,000", () => {
      /**
       * 50/50 ルールで default_amount=10,000 のエントリを 12,000 円で填記した場合。
       * stored splits の金額（5,000 + 5,000 = 10,000）ではなく、
       * 比率（50%/50%）を actual_amount=12,000 に掛け直す必要がある。
       *
       * 正規化:
       *   A: floor(12000 × 5000 / 10000) = 6000
       *   B: floor(12000 × 5000 / 10000) = 6000
       *   remainder = 12000 - 12000 = 0
       * → A=6,000, B=6,000（「5,000 ずつ」にはならない）
       */
      const MEMBER_A = "user-a";
      const MEMBER_B = "user-b";
      const twoEqual: EntryMember[] = [
        { id: MEMBER_A, name: "A" },
        { id: MEMBER_B, name: "B" },
      ];

      const entries = [
        makeCustomEntry("e1", MEMBER_A, 12_000, [
          { user_id: MEMBER_A, storedAmount: 5_000 }, // 50% 設定
          { user_id: MEMBER_B, storedAmount: 5_000 }, // 50% 設定
        ]),
      ];

      const result = calculateEntryBalances(entries, twoEqual);
      const a = result.find((b) => b.id === MEMBER_A)!;
      const b = result.find((b) => b.id === MEMBER_B)!;

      // stored 金額（5,000）ではなく比率再計算（6,000）になること
      expect(a.owed).toBe(6_000);
      expect(b.owed).toBe(6_000);
      expect(a.owed + b.owed).toBe(12_000); // 不変条件: sum(owed) = actual_amount
    });

    it("複数カスタムエントリで誤差が累積しない", () => {
      // 各エントリ: stored based on default=1000, actual=1001 (ズレあり)
      const entries = [
        makeCustomEntry("e1", PARTNER, 1_001, [
          { user_id: YOU, storedAmount: 1_000 },
          { user_id: PARTNER, storedAmount: 0 },
        ]),
        makeCustomEntry("e2", PARTNER, 1_001, [
          { user_id: YOU, storedAmount: 1_000 },
          { user_id: PARTNER, storedAmount: 0 },
        ]),
        makeCustomEntry("e3", PARTNER, 1_001, [
          { user_id: YOU, storedAmount: 1_000 },
          { user_id: PARTNER, storedAmount: 0 },
        ]),
      ];
      const result = calculateEntryBalances(entries, twoMembers);
      const you = result.find((b) => b.id === YOU)!;
      const partner = result.find((b) => b.id === PARTNER)!;

      // 各エントリ: actual=1001, stored=[YOU=1000,PARTNER=0]
      // normalize: YOU=floor(1001*1000/1000)=1001, PARTNER=0 → remainder=0
      // 3 entries: YOU owed = 3*1001=3003
      expect(you.owed).toBe(3_003);
      expect(partner.owed).toBe(0);
      // sum(owed) = total_expense
      expect(you.owed + partner.owed).toBe(3 * 1_001);
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
       * - パートナー: ¥10,000 の full proxy エントリ（storedAmount = actualAmount = 10,000）
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

      // 支払い
      expect(you.paid).toBe(181_148);
      expect(partner.paid).toBe(10_000);

      // 負担分（1円の狂いもなく）
      expect(you.owed).toBe(100_574);
      expect(partner.owed).toBe(90_574);

      // 差額
      expect(you.balance).toBe(80_574);
      expect(partner.balance).toBe(-80_574);

      // 不変条件: 残高合計 = 0
      expect(you.balance + partner.balance).toBe(0);

      // 不変条件: 負担合計 = 総支出
      expect(you.owed + partner.owed).toBe(191_148);
    });

    it("均等割り6項目(合計¥181,148) + カスタム¥10,000(あなた100%) → 負担¥100,574 / 差額+¥80,574", () => {
      /**
       * 実データ再現（6エントリ版）:
       *   均等割り: 15,463 + 10,105 + 128,000 + 4,950 + 8,355 + 14,275 = 181,148
       *   カスタム: パートナー立替¥10,000、あなたが100%負担
       *   合計支出: 191,148
       *
       *   Group A 計算（エントリ数によらず一括合算）:
       *     S_A = 181,148 → perPerson = 90,574, remainder = 0
       *   Group B 計算:
       *     YOU owed = 10,000, PARTNER owed = 0
       *   合算:
       *     YOU  owed = 90,574 + 10,000 = 100,574
       *     PARTNER owed = 90,574 + 0   =  90,574
       */
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

      // 支払い
      expect(you.paid).toBe(181_148);
      expect(partner.paid).toBe(10_000);

      // 負担分（1円の狂いもなく）
      expect(you.owed).toBe(100_574);
      expect(partner.owed).toBe(90_574);

      // 差額
      expect(you.balance).toBe(80_574);
      expect(partner.balance).toBe(-80_574);

      // 不変条件
      expect(you.balance + partner.balance).toBe(0);
      expect(you.owed + partner.owed).toBe(191_148);
    });

    it("stored と actual がズレた proxy が複数ある場合も数円単位のズレなし", () => {
      /**
       * シナリオ（実データに近いパターン）:
       * - あなた: ¥181,148 の equal-split エントリ
       * - パートナーの立替1: actual=10,001, stored=[YOU=9,999, PARTNER=0]
       * - パートナーの立替2: actual=5,001, stored=[YOU=5,000, PARTNER=0]
       *   （いずれも default ≠ actual のためストアドが古い）
       */
      const entries = [
        makeEntry("e1", YOU, 181_148),
        makeCustomEntry("e2", PARTNER, 10_001, [
          { user_id: YOU, storedAmount: 9_999 },
          { user_id: PARTNER, storedAmount: 0 },
        ]),
        makeCustomEntry("e3", PARTNER, 5_001, [
          { user_id: YOU, storedAmount: 5_000 },
          { user_id: PARTNER, storedAmount: 0 },
        ]),
      ];

      const result = calculateEntryBalances(entries, twoMembers);
      const you = result.find((b) => b.id === YOU)!;
      const partner = result.find((b) => b.id === PARTNER)!;

      // Group A: 181,148 / 2 = 90,574 余り 0
      // Group B proxy1: normalize(10001*9999/9999)=10001 → YOU=10001
      // Group B proxy2: normalize(5001*5000/5000)=5001 → YOU=5001
      expect(you.owed).toBe(90_574 + 10_001 + 5_001); // 105,576
      expect(partner.owed).toBe(90_574);

      // 不変条件
      const totalExpense = 181_148 + 10_001 + 5_001; // 196,150
      expect(you.owed + partner.owed).toBe(totalExpense);
      expect(you.balance + partner.balance).toBe(0);
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
