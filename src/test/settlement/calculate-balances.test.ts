import { describe, it, expect } from "vitest";
import {
  calculateBalances,
  type Member,
  type Payment,
  type PaymentSplit,
  type Balance,
} from "@/lib/settlement/calculate-balances";

describe("calculateBalances - 残高計算", () => {
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
          splits: [{ userId: "user-1", amount: 500 }],
        },
      ];
      const result = calculateBalances(members, payments);

      // unknown-user の支払いは無視される
      expect(result[0].totalPaid).toBe(0);
      expect(result[0].totalOwed).toBe(500);
      expect(result[0].balance).toBe(-500);
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
          splits: [
            { userId: "user-a", amount: 500 },
            { userId: "user-b", amount: 500 },
          ],
        },
      ];

      const result = calculateBalances(members, payments);

      const balanceA = result.find((b) => b.memberId === "user-a")!;
      const balanceB = result.find((b) => b.memberId === "user-b")!;

      expect(balanceA.totalPaid).toBe(1000);
      expect(balanceA.totalOwed).toBe(500);
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
          splits: [
            { userId: "user-a", amount: 500 },
            { userId: "user-b", amount: 500 },
          ],
        },
        {
          id: "pay-2",
          payerId: "user-b",
          amount: 1000,
          splits: [
            { userId: "user-a", amount: 500 },
            { userId: "user-b", amount: 500 },
          ],
        },
      ];

      const result = calculateBalances(members, payments);

      // お互い同額払ったので残高0
      expect(result.find((b) => b.memberId === "user-a")!.balance).toBe(0);
      expect(result.find((b) => b.memberId === "user-b")!.balance).toBe(0);
    });
  });

  describe("正常系 - 3人のケース", () => {
    it("設計書の例: A+3000, B-2000, C-1000", () => {
      // Aが6000円払い、3人で2000円ずつ負担
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
          splits: [
            { userId: "user-a", amount: 2000 },
            { userId: "user-b", amount: 2000 },
            { userId: "user-c", amount: 2000 },
          ],
        },
      ];

      const result = calculateBalances(members, payments);

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
          splits: [
            { userId: "user-a", amount: 1000 },
            { userId: "user-b", amount: 1000 },
            { userId: "user-c", amount: 1000 },
          ],
        },
        {
          id: "pay-2",
          payerId: "user-b",
          amount: 1500,
          splits: [
            { userId: "user-a", amount: 500 },
            { userId: "user-b", amount: 500 },
            { userId: "user-c", amount: 500 },
          ],
        },
      ];

      const result = calculateBalances(members, payments);

      // A: paid=3000, owed=1500 → balance=1500
      // B: paid=1500, owed=1500 → balance=0
      // C: paid=0, owed=1500 → balance=-1500
      expect(result.find((b) => b.memberId === "user-a")!.balance).toBe(1500);
      expect(result.find((b) => b.memberId === "user-b")!.balance).toBe(0);
      expect(result.find((b) => b.memberId === "user-c")!.balance).toBe(-1500);
    });
  });

  describe("残高合計の検証", () => {
    it("全メンバーの残高合計は常に0（ゼロサム）", () => {
      const members: Member[] = [
        { id: "user-a", displayName: "A" },
        { id: "user-b", displayName: "B" },
        { id: "user-c", displayName: "C" },
      ];
      const payments: Payment[] = [
        {
          id: "pay-1",
          payerId: "user-a",
          amount: 3333,
          splits: [
            { userId: "user-a", amount: 1111 },
            { userId: "user-b", amount: 1111 },
            { userId: "user-c", amount: 1111 },
          ],
        },
      ];

      const result = calculateBalances(members, payments);
      const totalBalance = result.reduce((sum, b) => sum + b.balance, 0);

      expect(totalBalance).toBe(0);
    });
  });
});
