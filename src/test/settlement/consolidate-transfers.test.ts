import { describe, it, expect } from "vitest";
import { consolidateTransfers } from "@/lib/settlement/consolidate";
import type { NetTransfer } from "@/types/database";

// =============================================================================
// テスト
// =============================================================================

const names = new Map([
  ["user-a", "Alice"],
  ["user-b", "Bob"],
  ["user-c", "Charlie"],
]);

describe("相殺統合ロジック (consolidateTransfers)", () => {
  // =========================================================================
  // 基本: 同一方向の統合
  // =========================================================================
  describe("同一方向の統合", () => {
    it("旧: B→A 3000, 新: B→A 2000 → B→A 5000", () => {
      const old: NetTransfer[] = [
        { from_id: "user-b", from_name: "Bob", to_id: "user-a", to_name: "Alice", amount: 3000 },
      ];
      const newT: NetTransfer[] = [
        { from_id: "user-b", from_name: "Bob", to_id: "user-a", to_name: "Alice", amount: 2000 },
      ];

      const result = consolidateTransfers([old, newT], names);

      expect(result.isZero).toBe(false);
      expect(result.transfers).toHaveLength(1);
      expect(result.transfers[0].from_id).toBe("user-b");
      expect(result.transfers[0].to_id).toBe("user-a");
      expect(result.transfers[0].amount).toBe(5000);
    });
  });

  // =========================================================================
  // 相殺: 逆方向で打ち消し
  // =========================================================================
  describe("逆方向の相殺", () => {
    it("旧: B→A 3000, 新: A→B 3000 → 0円（完全相殺）", () => {
      const old: NetTransfer[] = [
        { from_id: "user-b", from_name: "Bob", to_id: "user-a", to_name: "Alice", amount: 3000 },
      ];
      const newT: NetTransfer[] = [
        { from_id: "user-a", from_name: "Alice", to_id: "user-b", to_name: "Bob", amount: 3000 },
      ];

      const result = consolidateTransfers([old, newT], names);

      expect(result.isZero).toBe(true);
      expect(result.transfers).toHaveLength(0);
    });

    it("旧: B→A 5000, 新: A→B 2000 → B→A 3000（部分相殺）", () => {
      const old: NetTransfer[] = [
        { from_id: "user-b", from_name: "Bob", to_id: "user-a", to_name: "Alice", amount: 5000 },
      ];
      const newT: NetTransfer[] = [
        { from_id: "user-a", from_name: "Alice", to_id: "user-b", to_name: "Bob", amount: 2000 },
      ];

      const result = consolidateTransfers([old, newT], names);

      expect(result.isZero).toBe(false);
      expect(result.transfers).toHaveLength(1);
      expect(result.transfers[0].from_id).toBe("user-b");
      expect(result.transfers[0].to_id).toBe("user-a");
      expect(result.transfers[0].amount).toBe(3000);
    });

    it("旧: B→A 2000, 新: A→B 5000 → A→B 3000（方向反転）", () => {
      const old: NetTransfer[] = [
        { from_id: "user-b", from_name: "Bob", to_id: "user-a", to_name: "Alice", amount: 2000 },
      ];
      const newT: NetTransfer[] = [
        { from_id: "user-a", from_name: "Alice", to_id: "user-b", to_name: "Bob", amount: 5000 },
      ];

      const result = consolidateTransfers([old, newT], names);

      expect(result.isZero).toBe(false);
      expect(result.transfers).toHaveLength(1);
      expect(result.transfers[0].from_id).toBe("user-a");
      expect(result.transfers[0].to_id).toBe("user-b");
      expect(result.transfers[0].amount).toBe(3000);
    });
  });

  // =========================================================================
  // 3人: 複雑な統合
  // =========================================================================
  describe("3人の統合", () => {
    it("旧: B→A 3000, C→A 1000, 新: A→B 2000, A→C 500", () => {
      const old: NetTransfer[] = [
        { from_id: "user-b", from_name: "Bob", to_id: "user-a", to_name: "Alice", amount: 3000 },
        { from_id: "user-c", from_name: "Charlie", to_id: "user-a", to_name: "Alice", amount: 1000 },
      ];
      const newT: NetTransfer[] = [
        { from_id: "user-a", from_name: "Alice", to_id: "user-b", to_name: "Bob", amount: 2000 },
        { from_id: "user-a", from_name: "Alice", to_id: "user-c", to_name: "Charlie", amount: 500 },
      ];

      // Balance:
      // A: old +3000+1000 = +4000, new -2000-500 = -2500 → net +1500 (creditor)
      // B: old -3000, new +2000 → net -1000 (debtor)
      // C: old -1000, new +500 → net -500 (debtor)
      const result = consolidateTransfers([old, newT], names);

      expect(result.isZero).toBe(false);

      const totalFromB = result.transfers
        .filter((t) => t.from_id === "user-b")
        .reduce((sum, t) => sum + t.amount, 0);
      const totalFromC = result.transfers
        .filter((t) => t.from_id === "user-c")
        .reduce((sum, t) => sum + t.amount, 0);

      expect(totalFromB).toBe(1000);
      expect(totalFromC).toBe(500);
    });
  });

  // =========================================================================
  // 複数旧セッションの統合
  // =========================================================================
  describe("複数旧セッションの統合", () => {
    it("旧1: B→A 2000, 旧2: B→A 1000, 新: B→A 500 → B→A 3500", () => {
      const old1: NetTransfer[] = [
        { from_id: "user-b", from_name: "Bob", to_id: "user-a", to_name: "Alice", amount: 2000 },
      ];
      const old2: NetTransfer[] = [
        { from_id: "user-b", from_name: "Bob", to_id: "user-a", to_name: "Alice", amount: 1000 },
      ];
      const newT: NetTransfer[] = [
        { from_id: "user-b", from_name: "Bob", to_id: "user-a", to_name: "Alice", amount: 500 },
      ];

      const result = consolidateTransfers([old1, old2, newT], names);

      expect(result.isZero).toBe(false);
      expect(result.transfers).toHaveLength(1);
      expect(result.transfers[0].amount).toBe(3500);
    });
  });

  // =========================================================================
  // エッジケース
  // =========================================================================
  describe("エッジケース", () => {
    it("空の transfers → isZero", () => {
      const result = consolidateTransfers([[], []], names);
      expect(result.isZero).toBe(true);
      expect(result.transfers).toHaveLength(0);
    });

    it("片方だけ空 → もう片方がそのまま", () => {
      const transfers: NetTransfer[] = [
        { from_id: "user-b", from_name: "Bob", to_id: "user-a", to_name: "Alice", amount: 1000 },
      ];

      const result = consolidateTransfers([[], transfers], names);

      expect(result.isZero).toBe(false);
      expect(result.transfers).toHaveLength(1);
      expect(result.transfers[0].amount).toBe(1000);
    });
  });

  // =========================================================================
  // 保全性: balance の合計は常に 0
  // =========================================================================
  describe("保全性", () => {
    it("統合後の transfers の from 合計 = to 合計", () => {
      const old: NetTransfer[] = [
        { from_id: "user-b", from_name: "Bob", to_id: "user-a", to_name: "Alice", amount: 7777 },
        { from_id: "user-c", from_name: "Charlie", to_id: "user-a", to_name: "Alice", amount: 3333 },
      ];
      const newT: NetTransfer[] = [
        { from_id: "user-a", from_name: "Alice", to_id: "user-c", to_name: "Charlie", amount: 2222 },
      ];

      const result = consolidateTransfers([old, newT], names);

      // from 側の合計 = to 側の合計（送金ゼロサム）
      const fromMap = new Map<string, number>();
      const toMap = new Map<string, number>();
      for (const t of result.transfers) {
        fromMap.set(t.from_id, (fromMap.get(t.from_id) || 0) + t.amount);
        toMap.set(t.to_id, (toMap.get(t.to_id) || 0) + t.amount);
      }

      let totalFrom = 0;
      let totalTo = 0;
      for (const v of fromMap.values()) totalFrom += v;
      for (const v of toMap.values()) totalTo += v;

      expect(totalFrom).toBe(totalTo);
    });
  });
});
