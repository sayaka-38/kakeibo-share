import { describe, it, expect } from "vitest";
import {
  floorToYen,
  splitEqually,
  type SplitResult,
} from "@/lib/settlement/rounding";

describe("floorToYen - 円未満切り捨て", () => {
  // === 異常系（先に書く） ===

  describe("異常系", () => {
    it("負の金額はエラー", () => {
      expect(() => floorToYen(-100)).toThrow("金額は0以上である必要があります");
    });

    it("NaN はエラー", () => {
      expect(() => floorToYen(NaN)).toThrow("有効な数値ではありません");
    });

    it("Infinity はエラー", () => {
      expect(() => floorToYen(Infinity)).toThrow("有効な数値ではありません");
    });

    it("-Infinity はエラー", () => {
      expect(() => floorToYen(-Infinity)).toThrow("有効な数値ではありません");
    });
  });

  // === 正常系 ===

  describe("正常系", () => {
    it("0 → 0円", () => {
      expect(floorToYen(0)).toBe(0);
    });

    it("整数はそのまま返す", () => {
      expect(floorToYen(1000)).toBe(1000);
    });

    it("0.4 → 0円（切り捨て）", () => {
      expect(floorToYen(0.4)).toBe(0);
    });

    it("0.9 → 0円（切り捨て、四捨五入ではない）", () => {
      expect(floorToYen(0.9)).toBe(0);
    });

    it("333.33 → 333円", () => {
      expect(floorToYen(333.33)).toBe(333);
    });

    it("1234.99 → 1234円", () => {
      expect(floorToYen(1234.99)).toBe(1234);
    });
  });
});

describe("splitEqually - 均等割り（切り捨て + 余り）", () => {
  // === 異常系（先に書く） ===

  describe("異常系", () => {
    it("金額が負の場合はエラー", () => {
      expect(() => splitEqually(-1000, 3)).toThrow(
        "金額は0以上である必要があります"
      );
    });

    it("人数が0の場合はエラー", () => {
      expect(() => splitEqually(1000, 0)).toThrow(
        "人数は1以上である必要があります"
      );
    });

    it("人数が負の場合はエラー", () => {
      expect(() => splitEqually(1000, -2)).toThrow(
        "人数は1以上である必要があります"
      );
    });

    it("人数が小数の場合はエラー", () => {
      expect(() => splitEqually(1000, 2.5)).toThrow(
        "人数は整数である必要があります"
      );
    });

    it("金額がNaNの場合はエラー", () => {
      expect(() => splitEqually(NaN, 3)).toThrow("有効な数値ではありません");
    });
  });

  // === 正常系 ===

  describe("正常系", () => {
    it("1000円を2人で割る → 各500円、余り0円", () => {
      const result: SplitResult = splitEqually(1000, 2);
      expect(result.amountPerPerson).toBe(500);
      expect(result.remainder).toBe(0);
      expect(result.total).toBe(1000);
    });

    it("1000円を3人で割る → 各333円、余り1円", () => {
      const result = splitEqually(1000, 3);
      expect(result.amountPerPerson).toBe(333);
      expect(result.remainder).toBe(1); // 1000 - 333*3 = 1
      expect(result.total).toBe(999); // 実際に清算される金額
    });

    it("1円を3人で割る → 各0円、余り1円", () => {
      const result = splitEqually(1, 3);
      expect(result.amountPerPerson).toBe(0);
      expect(result.remainder).toBe(1);
      expect(result.total).toBe(0);
    });

    it("0円を3人で割る → 各0円、余り0円", () => {
      const result = splitEqually(0, 3);
      expect(result.amountPerPerson).toBe(0);
      expect(result.remainder).toBe(0);
      expect(result.total).toBe(0);
    });

    it("10000円を7人で割る → 各1428円、余り4円", () => {
      // 10000 / 7 = 1428.57...
      // 1428 * 7 = 9996
      // remainder = 10000 - 9996 = 4
      const result = splitEqually(10000, 7);
      expect(result.amountPerPerson).toBe(1428);
      expect(result.remainder).toBe(4);
      expect(result.total).toBe(9996);
    });

    it("1人で割る場合は全額、余り0円", () => {
      const result = splitEqually(1000, 1);
      expect(result.amountPerPerson).toBe(1000);
      expect(result.remainder).toBe(0);
      expect(result.total).toBe(1000);
    });
  });
});
