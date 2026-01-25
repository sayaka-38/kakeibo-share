/**
 * 割り勘計算ロジックのテスト
 *
 * TDD: Red-Green-Refactor
 * まず異常系から、次に正常系をテスト
 */

import { describe, it, expect } from "vitest";
import {
  calculateEqualSplit,
  calculateCustomSplits,
} from "@/lib/calculation/split";

describe("calculateEqualSplit - 均等割り計算", () => {
  // === 異常系（先に書く） ===

  describe("異常系", () => {
    it("メンバーが0人の場合は空配列を返す", () => {
      const result = calculateEqualSplit({
        paymentId: "payment-1",
        totalAmount: 1000,
        memberIds: [],
      });

      expect(result).toEqual([]);
    });

    it("金額が0の場合は全員0円", () => {
      const result = calculateEqualSplit({
        paymentId: "payment-1",
        totalAmount: 0,
        memberIds: ["user-1", "user-2"],
      });

      expect(result).toEqual([
        { payment_id: "payment-1", user_id: "user-1", amount: 0 },
        { payment_id: "payment-1", user_id: "user-2", amount: 0 },
      ]);
    });

    it("負の金額の場合は全員0円（不正入力の防御）", () => {
      const result = calculateEqualSplit({
        paymentId: "payment-1",
        totalAmount: -500,
        memberIds: ["user-1", "user-2"],
      });

      expect(result).toEqual([
        { payment_id: "payment-1", user_id: "user-1", amount: 0 },
        { payment_id: "payment-1", user_id: "user-2", amount: 0 },
      ]);
    });
  });

  // === 正常系 ===

  describe("正常系", () => {
    it("2人で1000円を割ると各500円", () => {
      const result = calculateEqualSplit({
        paymentId: "payment-1",
        totalAmount: 1000,
        memberIds: ["user-1", "user-2"],
      });

      expect(result).toEqual([
        { payment_id: "payment-1", user_id: "user-1", amount: 500 },
        { payment_id: "payment-1", user_id: "user-2", amount: 500 },
      ]);
    });

    it("3人で1000円を割ると各333円（端数切り捨て）", () => {
      const result = calculateEqualSplit({
        paymentId: "payment-1",
        totalAmount: 1000,
        memberIds: ["user-1", "user-2", "user-3"],
      });

      expect(result).toEqual([
        { payment_id: "payment-1", user_id: "user-1", amount: 333 },
        { payment_id: "payment-1", user_id: "user-2", amount: 333 },
        { payment_id: "payment-1", user_id: "user-3", amount: 333 },
      ]);
    });

    it("1人で1000円を割ると1000円", () => {
      const result = calculateEqualSplit({
        paymentId: "payment-1",
        totalAmount: 1000,
        memberIds: ["user-1"],
      });

      expect(result).toEqual([
        { payment_id: "payment-1", user_id: "user-1", amount: 1000 },
      ]);
    });

    it("小数点を含む金額は整数に切り捨て", () => {
      const result = calculateEqualSplit({
        paymentId: "payment-1",
        totalAmount: 1000.99,
        memberIds: ["user-1", "user-2"],
      });

      // 1000.99 / 2 = 500.495 → 500
      expect(result).toEqual([
        { payment_id: "payment-1", user_id: "user-1", amount: 500 },
        { payment_id: "payment-1", user_id: "user-2", amount: 500 },
      ]);
    });
  });
});

describe("calculateCustomSplits - カスタム割り計算", () => {
  // === 異常系（先に書く） ===

  describe("異常系", () => {
    it("空のカスタム分割の場合は空配列を返す", () => {
      const result = calculateCustomSplits({
        paymentId: "payment-1",
        customAmounts: {},
      });

      expect(result).toEqual([]);
    });

    it("金額が空文字列のメンバーはスキップ", () => {
      const result = calculateCustomSplits({
        paymentId: "payment-1",
        customAmounts: {
          "user-1": "500",
          "user-2": "",
          "user-3": "300",
        },
      });

      expect(result).toEqual([
        { payment_id: "payment-1", user_id: "user-1", amount: 500 },
        { payment_id: "payment-1", user_id: "user-3", amount: 300 },
      ]);
    });

    it("不正な文字列は0として扱う", () => {
      const result = calculateCustomSplits({
        paymentId: "payment-1",
        customAmounts: {
          "user-1": "abc",
          "user-2": "500",
        },
      });

      expect(result).toEqual([
        { payment_id: "payment-1", user_id: "user-1", amount: 0 },
        { payment_id: "payment-1", user_id: "user-2", amount: 500 },
      ]);
    });

    it("負の金額は0として扱う", () => {
      const result = calculateCustomSplits({
        paymentId: "payment-1",
        customAmounts: {
          "user-1": "-100",
          "user-2": "500",
        },
      });

      expect(result).toEqual([
        { payment_id: "payment-1", user_id: "user-1", amount: 0 },
        { payment_id: "payment-1", user_id: "user-2", amount: 500 },
      ]);
    });
  });

  // === 正常系 ===

  describe("正常系", () => {
    it("カスタム金額を正しく設定", () => {
      const result = calculateCustomSplits({
        paymentId: "payment-1",
        customAmounts: {
          "user-1": "600",
          "user-2": "400",
        },
      });

      expect(result).toEqual([
        { payment_id: "payment-1", user_id: "user-1", amount: 600 },
        { payment_id: "payment-1", user_id: "user-2", amount: 400 },
      ]);
    });

    it("小数点を含む金額は整数に切り捨て", () => {
      const result = calculateCustomSplits({
        paymentId: "payment-1",
        customAmounts: {
          "user-1": "333.33",
          "user-2": "666.67",
        },
      });

      expect(result).toEqual([
        { payment_id: "payment-1", user_id: "user-1", amount: 333 },
        { payment_id: "payment-1", user_id: "user-2", amount: 666 },
      ]);
    });
  });
});
