/**
 * Payment list layout 堅牢化テスト
 *
 * バッジが独立カラムに配置され、title に truncate が適用されていることを
 * ソースコードのパターンスキャンで検証。
 *
 * PaymentRow.tsx が共通部品として両ページで使用されるため、
 * レイアウト検証はすべて PaymentRow.tsx をスキャン対象とする。
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const PAYMENT_ROW_PATH = path.join(
  process.cwd(),
  "src/components/payment-list/PaymentRow.tsx"
);

const RECENT_PAYMENT_LIST_PATH = path.join(
  process.cwd(),
  "src/components/payment-list/RecentPaymentList.tsx"
);

const PAYMENT_LIST_FILTER_PATH = path.join(
  process.cwd(),
  "src/app/(protected)/payments/PaymentListWithFilter.tsx"
);

describe("Payment list layout hardening", () => {
  describe("PaymentRow (shared component)", () => {
    it("title に truncate block が適用されている", () => {
      const content = fs.readFileSync(PAYMENT_ROW_PATH, "utf-8");
      expect(content).toContain("truncate block");
    });

    it("メインコンテナが CSS Grid (1fr auto) で構成されている", () => {
      const content = fs.readFileSync(PAYMENT_ROW_PATH, "utf-8");
      expect(content).toContain("grid grid-cols-[1fr_auto]");
    });

    it("右カラムが flex-col items-end で配置されている", () => {
      const content = fs.readFileSync(PAYMENT_ROW_PATH, "utf-8");
      expect(content).toContain("flex flex-col items-end");
    });

    it("アクションスロットが固定幅（w-16）で配置されている", () => {
      const content = fs.readFileSync(PAYMENT_ROW_PATH, "utf-8");
      expect(content).toContain("w-16 flex items-center justify-end gap-1");
    });

    it("複製ボタンが配置されている", () => {
      const content = fs.readFileSync(PAYMENT_ROW_PATH, "utf-8");
      expect(content).toContain("payments.duplicate");
    });

    it("左カラム全体に min-w-0 がある（truncate 有効化）", () => {
      const content = fs.readFileSync(PAYMENT_ROW_PATH, "utf-8");
      expect(content).toContain("min-w-0");
    });

    it("未分類アイコンが ❓ になっている", () => {
      const content = fs.readFileSync(PAYMENT_ROW_PATH, "utf-8");
      expect(content).toContain('"❓"');
    });

    it("カテゴリバッジに shrink-0 がある", () => {
      const content = fs.readFileSync(PAYMENT_ROW_PATH, "utf-8");
      expect(content).toContain("text-[10px] px-1.5 py-0.5 rounded shrink-0");
    });

    it("subtitle 行に overflow-hidden がある", () => {
      const content = fs.readFileSync(PAYMENT_ROW_PATH, "utf-8");
      expect(content).toContain("text-xs text-theme-muted overflow-hidden");
    });
  });

  describe("RecentPaymentList uses shared PaymentRow", () => {
    it("PaymentRow をインポートして使用している", () => {
      const content = fs.readFileSync(RECENT_PAYMENT_LIST_PATH, "utf-8");
      expect(content).toContain('import { PaymentRow } from "./PaymentRow"');
      expect(content).toContain("<PaymentRow");
    });
  });

  describe("PaymentListWithFilter uses shared PaymentRow", () => {
    it("PaymentRow をインポートして使用している", () => {
      const content = fs.readFileSync(PAYMENT_LIST_FILTER_PATH, "utf-8");
      expect(content).toContain('import { PaymentRow } from "@/components/payment-list/PaymentRow"');
      expect(content).toContain("<PaymentRow");
    });
  });
});
