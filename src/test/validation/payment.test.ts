import { describe, it, expect } from "vitest";
import { validatePayment, type PaymentInput } from "@/lib/validation/payment";

describe("PaymentForm validation", () => {
  // ============================================
  // 異常系：金額（amount）
  // ============================================
  describe("金額のバリデーション", () => {
    it("金額が0の場合エラーを返す", () => {
      const input: PaymentInput = {
        amount: 0,
        description: "テスト支払い",
        paymentDate: new Date(),
      };
      const result = validatePayment(input);
      expect(result.success).toBe(false);
      expect(result.errors?.amount).toBe("金額は1円以上で入力してください");
    });

    it("金額が負の値の場合エラーを返す", () => {
      const input: PaymentInput = {
        amount: -100,
        description: "テスト支払い",
        paymentDate: new Date(),
      };
      const result = validatePayment(input);
      expect(result.success).toBe(false);
      expect(result.errors?.amount).toBe("金額は1円以上で入力してください");
    });

    it("金額が100万円を超える場合エラーを返す", () => {
      const input: PaymentInput = {
        amount: 1000001,
        description: "テスト支払い",
        paymentDate: new Date(),
      };
      const result = validatePayment(input);
      expect(result.success).toBe(false);
      expect(result.errors?.amount).toBe("金額は100万円以下で入力してください");
    });

    it("金額が小数の場合エラーを返す", () => {
      const input: PaymentInput = {
        amount: 100.5,
        description: "テスト支払い",
        paymentDate: new Date(),
      };
      const result = validatePayment(input);
      expect(result.success).toBe(false);
      expect(result.errors?.amount).toBe("金額は整数で入力してください");
    });
  });

  // ============================================
  // 異常系：説明（description）
  // ============================================
  describe("説明のバリデーション", () => {
    it("説明が空の場合エラーを返す", () => {
      const input: PaymentInput = {
        amount: 1000,
        description: "",
        paymentDate: new Date(),
      };
      const result = validatePayment(input);
      expect(result.success).toBe(false);
      expect(result.errors?.description).toBe("説明を入力してください");
    });

    it("説明が空白のみの場合エラーを返す", () => {
      const input: PaymentInput = {
        amount: 1000,
        description: "   ",
        paymentDate: new Date(),
      };
      const result = validatePayment(input);
      expect(result.success).toBe(false);
      expect(result.errors?.description).toBe("説明を入力してください");
    });

    it("説明が100文字を超える場合エラーを返す", () => {
      const input: PaymentInput = {
        amount: 1000,
        description: "あ".repeat(101),
        paymentDate: new Date(),
      };
      const result = validatePayment(input);
      expect(result.success).toBe(false);
      expect(result.errors?.description).toBe(
        "説明は100文字以内で入力してください"
      );
    });
  });

  // ============================================
  // 異常系：日付（paymentDate）
  // ============================================
  describe("日付のバリデーション", () => {
    it("未来の日付の場合エラーを返す", () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      const input: PaymentInput = {
        amount: 1000,
        description: "テスト支払い",
        paymentDate: tomorrow,
      };
      const result = validatePayment(input);
      expect(result.success).toBe(false);
      expect(result.errors?.paymentDate).toBe("未来の日付は指定できません");
    });

    it("1年以上前の日付の場合エラーを返す", () => {
      const overOneYearAgo = new Date();
      overOneYearAgo.setFullYear(overOneYearAgo.getFullYear() - 1);
      overOneYearAgo.setDate(overOneYearAgo.getDate() - 1);

      const input: PaymentInput = {
        amount: 1000,
        description: "テスト支払い",
        paymentDate: overOneYearAgo,
      };
      const result = validatePayment(input);
      expect(result.success).toBe(false);
      expect(result.errors?.paymentDate).toBe(
        "1年以上前の日付は指定できません"
      );
    });
  });

  // ============================================
  // 異常系：複数エラー
  // ============================================
  describe("複数フィールドのエラー", () => {
    it("複数のエラーがある場合すべて返す", () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      const input: PaymentInput = {
        amount: 0,
        description: "",
        paymentDate: tomorrow,
      };
      const result = validatePayment(input);
      expect(result.success).toBe(false);
      expect(result.errors?.amount).toBe("金額は1円以上で入力してください");
      expect(result.errors?.description).toBe("説明を入力してください");
      expect(result.errors?.paymentDate).toBe("未来の日付は指定できません");
    });
  });

  // ============================================
  // 正常系
  // ============================================
  describe("正常系", () => {
    it("有効な入力の場合成功を返す", () => {
      const input: PaymentInput = {
        amount: 1000,
        description: "スーパーで買い物",
        paymentDate: new Date(),
      };
      const result = validatePayment(input);
      expect(result.success).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it("金額が1円の場合成功を返す（境界値）", () => {
      const input: PaymentInput = {
        amount: 1,
        description: "テスト",
        paymentDate: new Date(),
      };
      const result = validatePayment(input);
      expect(result.success).toBe(true);
    });

    it("金額が100万円の場合成功を返す（境界値）", () => {
      const input: PaymentInput = {
        amount: 1000000,
        description: "テスト",
        paymentDate: new Date(),
      };
      const result = validatePayment(input);
      expect(result.success).toBe(true);
    });

    it("説明が100文字の場合成功を返す（境界値）", () => {
      const input: PaymentInput = {
        amount: 1000,
        description: "あ".repeat(100),
        paymentDate: new Date(),
      };
      const result = validatePayment(input);
      expect(result.success).toBe(true);
    });

    it("今日の日付の場合成功を返す", () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const input: PaymentInput = {
        amount: 1000,
        description: "テスト",
        paymentDate: today,
      };
      const result = validatePayment(input);
      expect(result.success).toBe(true);
    });

    it("ちょうど1年前の日付の場合成功を返す（境界値）", () => {
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

      const input: PaymentInput = {
        amount: 1000,
        description: "テスト",
        paymentDate: oneYearAgo,
      };
      const result = validatePayment(input);
      expect(result.success).toBe(true);
    });
  });
});
