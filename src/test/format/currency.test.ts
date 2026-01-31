/**
 * formatCurrency() 通貨フォーマット テスト
 *
 * Phase A-2: 通貨フォーマット共通化
 */

import { describe, it, expect } from "vitest";
import { formatCurrency } from "@/lib/format/currency";

describe("formatCurrency", () => {
  // ==========================================================================
  // 異常系
  // ==========================================================================
  describe("異常系", () => {
    it("NaN → '¥0' (安全なフォールバック)", () => {
      expect(formatCurrency(NaN)).toBe("¥0");
    });

    it("Infinity → '¥0'", () => {
      expect(formatCurrency(Infinity)).toBe("¥0");
    });

    it("-Infinity → '¥0'", () => {
      expect(formatCurrency(-Infinity)).toBe("¥0");
    });

    it("負の値 → 正しいマイナス表示", () => {
      expect(formatCurrency(-500)).toBe("¥-500");
    });

    it("大きな負の値 → カンマ区切り付きマイナス表示", () => {
      expect(formatCurrency(-1234)).toBe("¥-1,234");
    });
  });

  // ==========================================================================
  // 境界値
  // ==========================================================================
  describe("境界値", () => {
    it("0 → '¥0'", () => {
      expect(formatCurrency(0)).toBe("¥0");
    });

    it("1 → '¥1'", () => {
      expect(formatCurrency(1)).toBe("¥1");
    });

    it("999 → '¥999' (カンマなし)", () => {
      expect(formatCurrency(999)).toBe("¥999");
    });

    it("1000 → '¥1,000' (カンマ区切り開始)", () => {
      expect(formatCurrency(1000)).toBe("¥1,000");
    });

    it("999999 → '¥999,999'", () => {
      expect(formatCurrency(999999)).toBe("¥999,999");
    });
  });

  // ==========================================================================
  // 正常系
  // ==========================================================================
  describe("正常系", () => {
    it("1234 → '¥1,234'", () => {
      expect(formatCurrency(1234)).toBe("¥1,234");
    });

    it("100 → '¥100'", () => {
      expect(formatCurrency(100)).toBe("¥100");
    });

    it("1000000 → '¥1,000,000'", () => {
      expect(formatCurrency(1000000)).toBe("¥1,000,000");
    });
  });

  // ==========================================================================
  // showSign オプション
  // ==========================================================================
  describe("showSign オプション", () => {
    it("正の値 + showSign → '+¥1,234'", () => {
      expect(formatCurrency(1234, { showSign: true })).toBe("+¥1,234");
    });

    it("負の値 + showSign → '-¥500' (符号維持)", () => {
      expect(formatCurrency(-500, { showSign: true })).toBe("-¥500");
    });

    it("0 + showSign → '¥0' (符号なし)", () => {
      expect(formatCurrency(0, { showSign: true })).toBe("¥0");
    });

    it("大きな正の値 + showSign → '+¥10,000'", () => {
      expect(formatCurrency(10000, { showSign: true })).toBe("+¥10,000");
    });
  });

  // ==========================================================================
  // 小数（念のため）
  // ==========================================================================
  describe("小数", () => {
    it("100.5 → '¥101' (整数に丸め)", () => {
      expect(formatCurrency(100.5)).toBe("¥101");
    });

    it("99.4 → '¥99' (切り捨て方向)", () => {
      expect(formatCurrency(99.4)).toBe("¥99");
    });

    it("小数 + showSign → '+¥101'", () => {
      expect(formatCurrency(100.7, { showSign: true })).toBe("+¥101");
    });
  });
});
