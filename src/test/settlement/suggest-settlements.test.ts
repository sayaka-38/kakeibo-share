import { describe, it, expect } from "vitest";
import {
  suggestSettlements,
  type SettlementSuggestion,
  type SettlementResult,
} from "@/lib/settlement/suggest-settlements";
import type { Balance } from "@/lib/settlement/calculate-balances";

describe("suggestSettlements - 清算提案", () => {
  // === 異常系（先に書く） ===

  describe("異常系", () => {
    it("空配列の場合は清算不要", () => {
      const result = suggestSettlements([]);
      expect(result.settlements).toEqual([]);
      expect(result.unsettledRemainder).toBe(0);
    });

    it("1人しかいない場合は清算不要", () => {
      const balances: Balance[] = [
        {
          memberId: "user-a",
          displayName: "A",
          totalPaid: 1000,
          totalOwed: 1000,
          balance: 0,
        },
      ];
      const result = suggestSettlements(balances);
      expect(result.settlements).toEqual([]);
      expect(result.unsettledRemainder).toBe(0);
    });

    it("全員残高0なら清算不要", () => {
      const balances: Balance[] = [
        {
          memberId: "user-a",
          displayName: "A",
          totalPaid: 500,
          totalOwed: 500,
          balance: 0,
        },
        {
          memberId: "user-b",
          displayName: "B",
          totalPaid: 500,
          totalOwed: 500,
          balance: 0,
        },
      ];
      const result = suggestSettlements(balances);
      expect(result.settlements).toEqual([]);
      expect(result.unsettledRemainder).toBe(0);
    });
  });

  // === 正常系 ===

  describe("正常系 - 2人の単純ケース", () => {
    it("A+500, B-500 → B→A:500", () => {
      const balances: Balance[] = [
        {
          memberId: "user-a",
          displayName: "A",
          totalPaid: 1000,
          totalOwed: 500,
          balance: 500,
        },
        {
          memberId: "user-b",
          displayName: "B",
          totalPaid: 0,
          totalOwed: 500,
          balance: -500,
        },
      ];

      const result = suggestSettlements(balances);

      expect(result.settlements).toHaveLength(1);
      expect(result.settlements[0]).toEqual({
        fromId: "user-b",
        fromName: "B",
        toId: "user-a",
        toName: "A",
        amount: 500,
      });
      expect(result.unsettledRemainder).toBe(0);
    });
  });

  describe("正常系 - 3人の最小回数", () => {
    it("A+600, B-400, C-200 → B→A:400, C→A:200（2回で完了）", () => {
      const balances: Balance[] = [
        {
          memberId: "user-a",
          displayName: "A",
          totalPaid: 1200,
          totalOwed: 600,
          balance: 600,
        },
        {
          memberId: "user-b",
          displayName: "B",
          totalPaid: 0,
          totalOwed: 400,
          balance: -400,
        },
        {
          memberId: "user-c",
          displayName: "C",
          totalPaid: 0,
          totalOwed: 200,
          balance: -200,
        },
      ];

      const result = suggestSettlements(balances);

      expect(result.settlements).toHaveLength(2);
      // B(-400) → A(+600) = 400
      // C(-200) → A(+200残り) = 200
      const totalSettled = result.settlements.reduce(
        (sum, s) => sum + s.amount,
        0
      );
      expect(totalSettled).toBe(600);
      expect(result.unsettledRemainder).toBe(0);
    });

    it("設計書の例: A+3000, B-2000, C-1000 → B→A:2000, C→A:1000", () => {
      // Aが6000円払い、各自2000円負担
      // A: paid=6000, owed=2000, balance=+4000 ... あれ、設計書と違う
      // 設計書: A(+3000), B(-2000), C(-1000) なので
      // A: paid=4500, owed=1500, balance=+3000
      // B: paid=0, owed=2000 balance=-2000
      // C: paid=0, owed=1000 balance=-1000
      const balances: Balance[] = [
        {
          memberId: "user-a",
          displayName: "A",
          totalPaid: 4500,
          totalOwed: 1500,
          balance: 3000,
        },
        {
          memberId: "user-b",
          displayName: "B",
          totalPaid: 0,
          totalOwed: 2000,
          balance: -2000,
        },
        {
          memberId: "user-c",
          displayName: "C",
          totalPaid: 0,
          totalOwed: 1000,
          balance: -1000,
        },
      ];

      const result = suggestSettlements(balances);

      expect(result.settlements).toHaveLength(2);

      // 債務者（負債が大きい順）: B(-2000), C(-1000)
      // 債権者（債権が大きい順）: A(+3000)
      // B → A: 2000
      // C → A: 1000
      expect(result.settlements).toContainEqual({
        fromId: "user-b",
        fromName: "B",
        toId: "user-a",
        toName: "A",
        amount: 2000,
      });
      expect(result.settlements).toContainEqual({
        fromId: "user-c",
        fromName: "C",
        toId: "user-a",
        toName: "A",
        amount: 1000,
      });
      expect(result.unsettledRemainder).toBe(0);
    });
  });

  describe("端数処理 - 切り捨てと未清算残高", () => {
    it("端数がある場合は切り捨て、余りを未清算残高として返す", () => {
      // A: +333.5, B: -333.5 の場合
      // 切り捨てで 333円を清算、0.5円 × 2 = 1円が未清算
      const balances: Balance[] = [
        {
          memberId: "user-a",
          displayName: "A",
          totalPaid: 667,
          totalOwed: 333.5,
          balance: 333.5,
        },
        {
          memberId: "user-b",
          displayName: "B",
          totalPaid: 0,
          totalOwed: 333.5,
          balance: -333.5,
        },
      ];

      const result = suggestSettlements(balances);

      expect(result.settlements).toHaveLength(1);
      expect(result.settlements[0].amount).toBe(333); // 切り捨て
      // 未清算残高: 333.5 - 333 = 0.5 (債権者側の余り)
      // ただし実際は両者の端数の影響があるので...
      // creditor: 333.5 → 333 で清算、残り 0.5
      expect(result.unsettledRemainder).toBeCloseTo(0.5, 5);
    });

    it("1000円を3人で割った場合の未清算残高", () => {
      // 1000 / 3 = 333.33...
      // A が払って、3人で割る
      // A: paid=1000, owed=333.33, balance=+666.67
      // B: paid=0, owed=333.33, balance=-333.33
      // C: paid=0, owed=333.33, balance=-333.33
      const balances: Balance[] = [
        {
          memberId: "user-a",
          displayName: "A",
          totalPaid: 1000,
          totalOwed: 333.33,
          balance: 666.67,
        },
        {
          memberId: "user-b",
          displayName: "B",
          totalPaid: 0,
          totalOwed: 333.33,
          balance: -333.33,
        },
        {
          memberId: "user-c",
          displayName: "C",
          totalPaid: 0,
          totalOwed: 333.33,
          balance: -333.33,
        },
      ];

      const result = suggestSettlements(balances);

      // B → A: 333円（切り捨て）
      // C → A: 333円（切り捨て）
      // 清算合計: 666円
      // 未清算残高: 666.67 - 666 = 0.67円
      expect(result.settlements).toHaveLength(2);
      result.settlements.forEach((s) => {
        expect(s.amount).toBe(333);
      });
      expect(result.unsettledRemainder).toBeCloseTo(0.67, 2);
    });
  });

  describe("複雑なケース", () => {
    it("債権者・債務者が複数いる場合の最小回数清算", () => {
      // A: +300, B: +200, C: -250, D: -250
      const balances: Balance[] = [
        {
          memberId: "user-a",
          displayName: "A",
          totalPaid: 300,
          totalOwed: 0,
          balance: 300,
        },
        {
          memberId: "user-b",
          displayName: "B",
          totalPaid: 200,
          totalOwed: 0,
          balance: 200,
        },
        {
          memberId: "user-c",
          displayName: "C",
          totalPaid: 0,
          totalOwed: 250,
          balance: -250,
        },
        {
          memberId: "user-d",
          displayName: "D",
          totalPaid: 0,
          totalOwed: 250,
          balance: -250,
        },
      ];

      const result = suggestSettlements(balances);

      // 最小回数で清算できることを確認
      // 可能な清算パターン:
      // C(-250) → A(+300): 250円 → A残り50
      // D(-250) → B(+200): 200円 → D残り-50
      // D(-50) → A(+50): 50円
      // = 3回
      expect(result.settlements.length).toBeLessThanOrEqual(3);

      // 清算合計が残高合計と一致
      const totalSettled = result.settlements.reduce(
        (sum, s) => sum + s.amount,
        0
      );
      expect(totalSettled).toBe(500);
      expect(result.unsettledRemainder).toBe(0);
    });
  });
});
