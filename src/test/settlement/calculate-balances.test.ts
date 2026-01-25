import { describe, it, expect } from "vitest";
import {
  calculateBalances,
  type Member,
  type Payment,
} from "@/lib/settlement/calculate-balances";

describe("calculateBalances - 残高計算（エクセル方式）", () => {
  // === 異常系（先に書く） ===

  describe("異常系", () => {
    it("メンバーが空配列の場合は空配列を返す", () => {
      const members: Member[] = [];
      const payments: Payment[] = [];
      const result = calculateBalances(members, payments);
      expect(result).toEqual([]);
    });

    it("支払いがない場合は全員残高0", () => {
      const members: Member[] = [
        { id: "user-1", displayName: "Alice" },
        { id: "user-2", displayName: "Bob" },
      ];
      const payments: Payment[] = [];
      const result = calculateBalances(members, payments);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        memberId: "user-1",
        displayName: "Alice",
        totalPaid: 0,
        totalOwed: 0,
        balance: 0,
      });
      expect(result[1]).toEqual({
        memberId: "user-2",
        displayName: "Bob",
        totalPaid: 0,
        totalOwed: 0,
        balance: 0,
      });
    });

    it("支払いに存在しないユーザーIDがあっても無視する", () => {
      const members: Member[] = [{ id: "user-1", displayName: "Alice" }];
      const payments: Payment[] = [
        {
          id: "pay-1",
          payerId: "unknown-user",
          amount: 1000,
        },
      ];
      const result = calculateBalances(members, payments);

      // unknown-user の支払いは無視される（totalPaidには加算されない）
      // ただし totalOwed は全支払い合計から計算される
      expect(result[0].totalPaid).toBe(0);
      expect(result[0].totalOwed).toBe(1000); // 1000 ÷ 1人 = 1000
      expect(result[0].balance).toBe(-1000);
    });
  });

  // === 正常系 ===

  describe("正常系 - 2人のケース", () => {
    it("Aが1000円払い、2人で均等割り → A:+500, B:-500", () => {
      const members: Member[] = [
        { id: "user-a", displayName: "A" },
        { id: "user-b", displayName: "B" },
      ];
      const payments: Payment[] = [
        {
          id: "pay-1",
          payerId: "user-a",
          amount: 1000,
        },
      ];

      const result = calculateBalances(members, payments);

      const balanceA = result.find((b) => b.memberId === "user-a")!;
      const balanceB = result.find((b) => b.memberId === "user-b")!;

      expect(balanceA.totalPaid).toBe(1000);
      expect(balanceA.totalOwed).toBe(500); // 1000 ÷ 2 = 500
      expect(balanceA.balance).toBe(500); // +500（もらえる）

      expect(balanceB.totalPaid).toBe(0);
      expect(balanceB.totalOwed).toBe(500);
      expect(balanceB.balance).toBe(-500); // -500（払う必要あり）
    });

    it("お互いに払い合う場合の相殺", () => {
      const members: Member[] = [
        { id: "user-a", displayName: "A" },
        { id: "user-b", displayName: "B" },
      ];
      const payments: Payment[] = [
        {
          id: "pay-1",
          payerId: "user-a",
          amount: 1000,
        },
        {
          id: "pay-2",
          payerId: "user-b",
          amount: 1000,
        },
      ];

      const result = calculateBalances(members, payments);

      // 合計2000円 ÷ 2人 = 1000円ずつ
      // A: paid=1000, owed=1000 → balance=0
      // B: paid=1000, owed=1000 → balance=0
      expect(result.find((b) => b.memberId === "user-a")!.balance).toBe(0);
      expect(result.find((b) => b.memberId === "user-b")!.balance).toBe(0);
    });
  });

  describe("正常系 - 3人のケース", () => {
    it("設計書の例: Aが6000円払い、3人で均等割り", () => {
      const members: Member[] = [
        { id: "user-a", displayName: "A" },
        { id: "user-b", displayName: "B" },
        { id: "user-c", displayName: "C" },
      ];
      const payments: Payment[] = [
        {
          id: "pay-1",
          payerId: "user-a",
          amount: 6000,
        },
      ];

      const result = calculateBalances(members, payments);

      // 6000 ÷ 3 = 2000円ずつ
      expect(result.find((b) => b.memberId === "user-a")!.balance).toBe(4000); // 6000-2000
      expect(result.find((b) => b.memberId === "user-b")!.balance).toBe(-2000);
      expect(result.find((b) => b.memberId === "user-c")!.balance).toBe(-2000);
    });

    it("複数支払いの累計", () => {
      const members: Member[] = [
        { id: "user-a", displayName: "A" },
        { id: "user-b", displayName: "B" },
        { id: "user-c", displayName: "C" },
      ];
      const payments: Payment[] = [
        {
          id: "pay-1",
          payerId: "user-a",
          amount: 3000,
        },
        {
          id: "pay-2",
          payerId: "user-b",
          amount: 1500,
        },
      ];

      const result = calculateBalances(members, payments);

      // 合計 4500円 ÷ 3人 = 1500円ずつ
      // A: paid=3000, owed=1500 → balance=1500
      // B: paid=1500, owed=1500 → balance=0
      // C: paid=0, owed=1500 → balance=-1500
      expect(result.find((b) => b.memberId === "user-a")!.balance).toBe(1500);
      expect(result.find((b) => b.memberId === "user-b")!.balance).toBe(0);
      expect(result.find((b) => b.memberId === "user-c")!.balance).toBe(-1500);
    });
  });

  // === エクセル方式 - 端数処理のテスト ===

  describe("エクセル方式 - 全支払い合計後に1回だけ切り捨て", () => {
    it("5166円を2人で割る → 各2583円（端数持ち越し）", () => {
      const members: Member[] = [
        { id: "user-a", displayName: "たる" },
        { id: "user-b", displayName: "まみ" },
      ];
      const payments: Payment[] = [
        { id: "pay-1", payerId: "user-a", amount: 5166 },
      ];

      const result = calculateBalances(members, payments);

      // 5166 ÷ 2 = 2583 (切り捨て)
      const balanceA = result.find((b) => b.memberId === "user-a")!;
      const balanceB = result.find((b) => b.memberId === "user-b")!;

      expect(balanceA.totalPaid).toBe(5166);
      expect(balanceA.totalOwed).toBe(2583);
      expect(balanceA.balance).toBe(2583); // 5166 - 2583

      expect(balanceB.totalPaid).toBe(0);
      expect(balanceB.totalOwed).toBe(2583);
      expect(balanceB.balance).toBe(-2583);
    });

    it("1000円を3人で割る → 各333円（合計で1円の端数）", () => {
      const members: Member[] = [
        { id: "user-a", displayName: "A" },
        { id: "user-b", displayName: "B" },
        { id: "user-c", displayName: "C" },
      ];
      const payments: Payment[] = [
        { id: "pay-1", payerId: "user-a", amount: 1000 },
      ];

      const result = calculateBalances(members, payments);

      // 1000 ÷ 3 = 333 (切り捨て)
      expect(result.find((b) => b.memberId === "user-a")!.totalOwed).toBe(333);
      expect(result.find((b) => b.memberId === "user-b")!.totalOwed).toBe(333);
      expect(result.find((b) => b.memberId === "user-c")!.totalOwed).toBe(333);

      // A: paid=1000, owed=333 → balance=667
      expect(result.find((b) => b.memberId === "user-a")!.balance).toBe(667);
    });

    it("複数支払いでも端数は最後に1回だけ発生", () => {
      const members: Member[] = [
        { id: "user-a", displayName: "A" },
        { id: "user-b", displayName: "B" },
        { id: "user-c", displayName: "C" },
      ];
      // 各支払いで端数が出るケース
      const payments: Payment[] = [
        { id: "pay-1", payerId: "user-a", amount: 1000 }, // 1000÷3=333.33...
        { id: "pay-2", payerId: "user-b", amount: 1000 }, // 1000÷3=333.33...
        { id: "pay-3", payerId: "user-c", amount: 1000 }, // 1000÷3=333.33...
      ];

      const result = calculateBalances(members, payments);

      // 合計 3000円 ÷ 3人 = 1000円ずつ（端数なし！）
      // 従来方式だと各支払いで1円ずつロスして累計3円の誤差
      // エクセル方式だと最後に1回だけ計算するので誤差なし
      expect(result.find((b) => b.memberId === "user-a")!.totalOwed).toBe(1000);
      expect(result.find((b) => b.memberId === "user-b")!.totalOwed).toBe(1000);
      expect(result.find((b) => b.memberId === "user-c")!.totalOwed).toBe(1000);

      // 全員同額払ったので残高0
      expect(result.find((b) => b.memberId === "user-a")!.balance).toBe(0);
      expect(result.find((b) => b.memberId === "user-b")!.balance).toBe(0);
      expect(result.find((b) => b.memberId === "user-c")!.balance).toBe(0);
    });

    it("10000円を7人で割る → 各1428円（端数4円持ち越し）", () => {
      const members: Member[] = [
        { id: "user-1", displayName: "M1" },
        { id: "user-2", displayName: "M2" },
        { id: "user-3", displayName: "M3" },
        { id: "user-4", displayName: "M4" },
        { id: "user-5", displayName: "M5" },
        { id: "user-6", displayName: "M6" },
        { id: "user-7", displayName: "M7" },
      ];
      const payments: Payment[] = [
        { id: "pay-1", payerId: "user-1", amount: 10000 },
      ];

      const result = calculateBalances(members, payments);

      // 10000 ÷ 7 = 1428.57... → 1428 (切り捨て)
      // 1428 × 7 = 9996 → 端数 4円
      for (const balance of result) {
        expect(balance.totalOwed).toBe(1428);
      }

      // M1: paid=10000, owed=1428 → balance=8572
      expect(result.find((b) => b.memberId === "user-1")!.balance).toBe(8572);
    });
  });

  describe("極端なケース - 1円を分ける", () => {
    it("1円を2人で割る → 各0円（全額が端数持ち越し）", () => {
      const members: Member[] = [
        { id: "user-a", displayName: "A" },
        { id: "user-b", displayName: "B" },
      ];
      const payments: Payment[] = [
        { id: "pay-1", payerId: "user-a", amount: 1 },
      ];

      const result = calculateBalances(members, payments);

      // 1 ÷ 2 = 0.5 → Math.floor(0.5) = 0
      // 各自の負担額は0円（整数）
      expect(result.find((b) => b.memberId === "user-a")!.totalOwed).toBe(0);
      expect(result.find((b) => b.memberId === "user-b")!.totalOwed).toBe(0);

      // A: paid=1, owed=0 → balance=1
      // B: paid=0, owed=0 → balance=0
      expect(result.find((b) => b.memberId === "user-a")!.balance).toBe(1);
      expect(result.find((b) => b.memberId === "user-b")!.balance).toBe(0);
    });

    it("1円を3人で割る → 各0円（全額が端数持ち越し）", () => {
      const members: Member[] = [
        { id: "user-a", displayName: "A" },
        { id: "user-b", displayName: "B" },
        { id: "user-c", displayName: "C" },
      ];
      const payments: Payment[] = [
        { id: "pay-1", payerId: "user-a", amount: 1 },
      ];

      const result = calculateBalances(members, payments);

      // 1 ÷ 3 = 0.33... → Math.floor = 0
      for (const balance of result) {
        expect(balance.totalOwed).toBe(0);
      }

      // 全額が端数持ち越し
      expect(result.find((b) => b.memberId === "user-a")!.balance).toBe(1);
    });

    it("3円を2人で割る → 各1円（1円が端数持ち越し）", () => {
      const members: Member[] = [
        { id: "user-a", displayName: "A" },
        { id: "user-b", displayName: "B" },
      ];
      const payments: Payment[] = [
        { id: "pay-1", payerId: "user-a", amount: 3 },
      ];

      const result = calculateBalances(members, payments);

      // 3 ÷ 2 = 1.5 → Math.floor = 1
      expect(result.find((b) => b.memberId === "user-a")!.totalOwed).toBe(1);
      expect(result.find((b) => b.memberId === "user-b")!.totalOwed).toBe(1);

      // A: paid=3, owed=1 → balance=2
      // B: paid=0, owed=1 → balance=-1
      expect(result.find((b) => b.memberId === "user-a")!.balance).toBe(2);
      expect(result.find((b) => b.memberId === "user-b")!.balance).toBe(-1);
    });
  });

  describe("残高合計の検証", () => {
    it("全メンバーの残高合計は端数分だけずれる（切り捨てによる）", () => {
      const members: Member[] = [
        { id: "user-a", displayName: "A" },
        { id: "user-b", displayName: "B" },
        { id: "user-c", displayName: "C" },
      ];
      const payments: Payment[] = [
        { id: "pay-1", payerId: "user-a", amount: 1000 },
      ];

      const result = calculateBalances(members, payments);

      // A: 1000-333=667, B: 0-333=-333, C: 0-333=-333
      // 合計: 667-333-333 = 1（端数分）
      const totalBalance = result.reduce((sum, b) => sum + b.balance, 0);
      expect(totalBalance).toBe(1); // 1000 - 333*3 = 1
    });
  });
});
