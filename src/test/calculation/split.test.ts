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
  calculateProxySplit,
  isCustomSplit,
  isProxySplit,
  getProxyBeneficiaryId,
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

    it("3人で1000円を割ると各333円（payerId未指定時は端数切り捨て）", () => {
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

  // === 端数処理（payerId指定時: 支払者吸収方式） ===

  describe("端数処理 - 支払者吸収方式", () => {
    it("1000÷3 → payer=334, others=333 (remainder=1)", () => {
      const result = calculateEqualSplit({
        paymentId: "payment-1",
        totalAmount: 1000,
        memberIds: ["payer", "user-2", "user-3"],
        payerId: "payer",
      });

      expect(result).toEqual([
        { payment_id: "payment-1", user_id: "payer", amount: 334 },
        { payment_id: "payment-1", user_id: "user-2", amount: 333 },
        { payment_id: "payment-1", user_id: "user-3", amount: 333 },
      ]);
      // sum === totalAmount
      const sum = result.reduce((s, r) => s + r.amount, 0);
      expect(sum).toBe(1000);
    });

    it("1000÷2 → 各500 (remainder=0)", () => {
      const result = calculateEqualSplit({
        paymentId: "payment-1",
        totalAmount: 1000,
        memberIds: ["payer", "user-2"],
        payerId: "payer",
      });

      expect(result).toEqual([
        { payment_id: "payment-1", user_id: "payer", amount: 500 },
        { payment_id: "payment-1", user_id: "user-2", amount: 500 },
      ]);
    });

    it("1÷3 → payer=1, others=0 (remainder=1)", () => {
      const result = calculateEqualSplit({
        paymentId: "payment-1",
        totalAmount: 1,
        memberIds: ["payer", "user-2", "user-3"],
        payerId: "payer",
      });

      expect(result).toEqual([
        { payment_id: "payment-1", user_id: "payer", amount: 1 },
        { payment_id: "payment-1", user_id: "user-2", amount: 0 },
        { payment_id: "payment-1", user_id: "user-3", amount: 0 },
      ]);
      const sum = result.reduce((s, r) => s + r.amount, 0);
      expect(sum).toBe(1);
    });

    it("10000÷7 → payer=1432, others=1428 (remainder=4)", () => {
      const result = calculateEqualSplit({
        paymentId: "payment-1",
        totalAmount: 10000,
        memberIds: ["payer", "u2", "u3", "u4", "u5", "u6", "u7"],
        payerId: "payer",
      });

      const payerSplit = result.find((r) => r.user_id === "payer")!;
      const otherSplits = result.filter((r) => r.user_id !== "payer");

      expect(payerSplit.amount).toBe(1432); // 1428 + 4
      for (const s of otherSplits) {
        expect(s.amount).toBe(1428);
      }
      const sum = result.reduce((s, r) => s + r.amount, 0);
      expect(sum).toBe(10000);
    });

    it("payerがmemberIdsの中間にいても正しく端数を吸収する", () => {
      const result = calculateEqualSplit({
        paymentId: "payment-1",
        totalAmount: 1000,
        memberIds: ["user-1", "payer", "user-3"],
        payerId: "payer",
      });

      expect(result).toEqual([
        { payment_id: "payment-1", user_id: "user-1", amount: 333 },
        { payment_id: "payment-1", user_id: "payer", amount: 334 },
        { payment_id: "payment-1", user_id: "user-3", amount: 333 },
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

describe("calculateProxySplit - 代理購入割り", () => {
  // === 異常系 ===

  describe("異常系", () => {
    it("beneficiary === payer → エラー", () => {
      expect(() =>
        calculateProxySplit({
          paymentId: "payment-1",
          totalAmount: 1000,
          payerId: "user-1",
          beneficiaryId: "user-1",
          allMemberIds: ["user-1", "user-2"],
        })
      ).toThrow("Beneficiary must be different from payer");
    });

    it("beneficiary が memberIds にない → エラー", () => {
      expect(() =>
        calculateProxySplit({
          paymentId: "payment-1",
          totalAmount: 1000,
          payerId: "user-1",
          beneficiaryId: "user-999",
          allMemberIds: ["user-1", "user-2"],
        })
      ).toThrow("Beneficiary must be a group member");
    });
  });

  // === 正常系 ===

  describe("正常系", () => {
    it("2人グループ: payer=0, other=1000", () => {
      const result = calculateProxySplit({
        paymentId: "payment-1",
        totalAmount: 1000,
        payerId: "user-1",
        beneficiaryId: "user-2",
        allMemberIds: ["user-1", "user-2"],
      });

      expect(result).toEqual([
        { payment_id: "payment-1", user_id: "user-1", amount: 0 },
        { payment_id: "payment-1", user_id: "user-2", amount: 1000 },
      ]);
      const sum = result.reduce((s, r) => s + r.amount, 0);
      expect(sum).toBe(1000);
    });

    it("3人グループ: payer=0, beneficiary=1000, other=0", () => {
      const result = calculateProxySplit({
        paymentId: "payment-1",
        totalAmount: 1000,
        payerId: "user-1",
        beneficiaryId: "user-2",
        allMemberIds: ["user-1", "user-2", "user-3"],
      });

      expect(result).toEqual([
        { payment_id: "payment-1", user_id: "user-1", amount: 0 },
        { payment_id: "payment-1", user_id: "user-2", amount: 1000 },
        { payment_id: "payment-1", user_id: "user-3", amount: 0 },
      ]);
    });

    it("allMemberIdsの順序を維持する", () => {
      const result = calculateProxySplit({
        paymentId: "payment-1",
        totalAmount: 500,
        payerId: "user-3",
        beneficiaryId: "user-1",
        allMemberIds: ["user-1", "user-2", "user-3"],
      });

      expect(result).toEqual([
        { payment_id: "payment-1", user_id: "user-1", amount: 500 },
        { payment_id: "payment-1", user_id: "user-2", amount: 0 },
        { payment_id: "payment-1", user_id: "user-3", amount: 0 },
      ]);
    });
  });
});

describe("isCustomSplit - カスタム割り勘判定", () => {
  describe("均等割りと判定するケース", () => {
    it("2人で均等割り → false", () => {
      const splits = [
        { user_id: "payer", amount: 500 },
        { user_id: "user-2", amount: 500 },
      ];
      expect(isCustomSplit(splits, "payer", 1000)).toBe(false);
    });

    it("3人で均等割り（端数あり） → false", () => {
      // 1000 / 3 = 333, payer = 334
      const splits = [
        { user_id: "payer", amount: 334 },
        { user_id: "user-2", amount: 333 },
        { user_id: "user-3", amount: 333 },
      ];
      expect(isCustomSplit(splits, "payer", 1000)).toBe(false);
    });

    it("空の splits → false", () => {
      expect(isCustomSplit([], "payer", 1000)).toBe(false);
    });
  });

  describe("代理購入と判定するケース", () => {
    it("payer の amount が 0 → false（代理購入として扱われる）", () => {
      const splits = [
        { user_id: "payer", amount: 0 },
        { user_id: "user-2", amount: 1000 },
      ];
      expect(isCustomSplit(splits, "payer", 1000)).toBe(false);
    });
  });

  describe("カスタム割り勘と判定するケース", () => {
    it("2人で不均等な分割 → true", () => {
      const splits = [
        { user_id: "payer", amount: 700 },
        { user_id: "user-2", amount: 300 },
      ];
      expect(isCustomSplit(splits, "payer", 1000)).toBe(true);
    });

    it("3人でカスタム金額 → true", () => {
      const splits = [
        { user_id: "payer", amount: 500 },
        { user_id: "user-2", amount: 300 },
        { user_id: "user-3", amount: 200 },
      ];
      expect(isCustomSplit(splits, "payer", 1000)).toBe(true);
    });

    it("均等割りの端数処理と微妙に異なる金額 → true", () => {
      // 均等なら payer=334, others=333 だが、実際は payer=335, user-2=332
      const splits = [
        { user_id: "payer", amount: 335 },
        { user_id: "user-2", amount: 332 },
        { user_id: "user-3", amount: 333 },
      ];
      expect(isCustomSplit(splits, "payer", 1000)).toBe(true);
    });
  });
});

describe("isProxySplit - 代理購入判定", () => {
  describe("代理購入と判定するケース", () => {
    it("payer の amount が 0 → true", () => {
      const splits = [
        { user_id: "payer", amount: 0 },
        { user_id: "user-2", amount: 1000 },
      ];
      expect(isProxySplit(splits, "payer")).toBe(true);
    });

    it("3人グループで payer の amount が 0 → true", () => {
      const splits = [
        { user_id: "payer", amount: 0 },
        { user_id: "user-2", amount: 1000 },
        { user_id: "user-3", amount: 0 },
      ];
      expect(isProxySplit(splits, "payer")).toBe(true);
    });
  });

  describe("代理購入でないケース", () => {
    it("均等割り → false", () => {
      const splits = [
        { user_id: "payer", amount: 500 },
        { user_id: "user-2", amount: 500 },
      ];
      expect(isProxySplit(splits, "payer")).toBe(false);
    });

    it("空の splits → false", () => {
      expect(isProxySplit([], "payer")).toBe(false);
    });

    it("payer が splits に含まれない → false", () => {
      const splits = [
        { user_id: "user-1", amount: 500 },
        { user_id: "user-2", amount: 500 },
      ];
      expect(isProxySplit(splits, "payer")).toBe(false);
    });
  });
});

describe("getProxyBeneficiaryId - 代理購入受益者ID取得", () => {
  describe("正常系", () => {
    it("2人グループ: 受益者IDを返す", () => {
      const splits = [
        { user_id: "payer", amount: 0 },
        { user_id: "user-2", amount: 1000 },
      ];
      expect(getProxyBeneficiaryId(splits, "payer")).toBe("user-2");
    });

    it("3人グループ: amount > 0 の受益者IDを返す", () => {
      const splits = [
        { user_id: "payer", amount: 0 },
        { user_id: "user-2", amount: 1000 },
        { user_id: "user-3", amount: 0 },
      ];
      expect(getProxyBeneficiaryId(splits, "payer")).toBe("user-2");
    });
  });

  describe("代理購入でないケース", () => {
    it("均等割り → null", () => {
      const splits = [
        { user_id: "payer", amount: 500 },
        { user_id: "user-2", amount: 500 },
      ];
      expect(getProxyBeneficiaryId(splits, "payer")).toBeNull();
    });

    it("空の splits → null", () => {
      expect(getProxyBeneficiaryId([], "payer")).toBeNull();
    });
  });
});
