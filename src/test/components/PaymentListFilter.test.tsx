/**
 * PaymentListWithFilter - グループフィルタのテスト
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import PaymentListWithFilter from "@/app/(protected)/payments/PaymentListWithFilter";

// Mock next/link
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// Mock i18n
vi.mock("@/lib/i18n", () => ({
  t: (key: string) => {
    const translations: Record<string, string> = {
      "payments.filter.all": "すべて",
      "payments.noPayments": "支払いがありません",
      "payments.addFirstPayment": "最初の支払いを追加",
      "payments.duplicate": "複製",
      "payments.edit": "編集",
      "payments.display.proxyBadge": "全額立替",
      "payments.display.customBadge": "内訳",
      "common.total": "合計",
      "categories.uncategorized": "未分類",
    };
    return translations[key] || key;
  },
}));

// Mock formatCurrency
vi.mock("@/lib/format/currency", () => ({
  formatCurrency: (n: number) => `¥${n.toLocaleString()}`,
}));

// Mock split calculation
vi.mock("@/lib/calculation/split", () => ({
  isCustomSplit: () => false,
  isProxySplit: () => false,
}));

// Mock DeletePaymentForm
vi.mock("@/components/DeletePaymentButton", () => ({
  DeletePaymentForm: () => <button>削除</button>,
}));

// Mock PaymentSplitAccordion
vi.mock("@/components/payment-list/PaymentSplitAccordion", () => ({
  SplitAccordionProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SplitBadge: () => <span>内訳</span>,
  SplitContent: () => <div>splits</div>,
}));

const makePayment = (overrides: Record<string, unknown> = {}) => ({
  id: "p-1",
  group_id: "group-1",
  payer_id: "user-1",
  amount: 3000,
  description: "スーパーで買い物",
  category_id: null,
  payment_date: "2026-01-15",
  created_at: "2026-01-15T00:00:00Z",
  updated_at: "2026-01-15T00:00:00Z",
  settlement_id: null,
  profiles: { display_name: "Alice", email: "alice@test.com" },
  categories: { name: "食費", icon: "🍽", color: null },
  groups: { name: "テスト共同生活" },
  payment_splits: [],
  ...overrides,
});

const groups = [
  { id: "group-1", name: "テスト共同生活" },
  { id: "group-2", name: "趣味サークル" },
];

describe("PaymentListWithFilter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("フィルタチップ表示", () => {
    it("グループが2つ以上ある場合にフィルタが表示される", () => {
      render(
        <PaymentListWithFilter
          payments={[makePayment()]}
          groups={groups}
          userId="user-1"
        />
      );

      expect(screen.getByRole("button", { name: "すべて" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "テスト共同生活" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "趣味サークル" })).toBeInTheDocument();
    });

    it("グループが1つの場合はフィルタが表示されない", () => {
      render(
        <PaymentListWithFilter
          payments={[makePayment()]}
          groups={[{ id: "group-1", name: "テスト共同生活" }]}
          userId="user-1"
        />
      );

      expect(screen.queryByText("すべて")).not.toBeInTheDocument();
    });
  });

  describe("フィルタリング", () => {
    it("「すべて」が初期状態で全支払いが表示される", () => {
      const payments = [
        makePayment({ id: "p-1", group_id: "group-1", description: "買い物A" }),
        makePayment({ id: "p-2", group_id: "group-2", description: "買い物B", groups: { name: "趣味サークル" } }),
      ];

      render(
        <PaymentListWithFilter
          payments={payments}
          groups={groups}
          userId="user-1"
        />
      );

      expect(screen.getByText("買い物A")).toBeInTheDocument();
      expect(screen.getByText("買い物B")).toBeInTheDocument();
    });

    it("グループをクリックするとそのグループの支払いのみ表示される", () => {
      const payments = [
        makePayment({ id: "p-1", group_id: "group-1", description: "買い物A" }),
        makePayment({ id: "p-2", group_id: "group-2", description: "買い物B", groups: { name: "趣味サークル" } }),
      ];

      render(
        <PaymentListWithFilter
          payments={payments}
          groups={groups}
          userId="user-1"
        />
      );

      fireEvent.click(screen.getByRole("button", { name: "趣味サークル" }));

      expect(screen.queryByText("買い物A")).not.toBeInTheDocument();
      expect(screen.getByText("買い物B")).toBeInTheDocument();
    });

    it("「すべて」をクリックするとフィルタがリセットされる", () => {
      const payments = [
        makePayment({ id: "p-1", group_id: "group-1", description: "買い物A" }),
        makePayment({ id: "p-2", group_id: "group-2", description: "買い物B", groups: { name: "趣味サークル" } }),
      ];

      render(
        <PaymentListWithFilter
          payments={payments}
          groups={groups}
          userId="user-1"
        />
      );

      // Filter to group-2
      fireEvent.click(screen.getByRole("button", { name: "趣味サークル" }));
      expect(screen.queryByText("買い物A")).not.toBeInTheDocument();

      // Reset filter
      fireEvent.click(screen.getByText("すべて"));
      expect(screen.getByText("買い物A")).toBeInTheDocument();
      expect(screen.getByText("買い物B")).toBeInTheDocument();
    });
  });

  describe("月別グループ化", () => {
    it("支払いが月別にグループ化されて表示される", () => {
      const payments = [
        makePayment({ id: "p-1", payment_date: "2026-02-15", description: "2月の買い物" }),
        makePayment({ id: "p-2", payment_date: "2026-01-15", description: "1月の買い物" }),
      ];

      render(
        <PaymentListWithFilter
          payments={payments}
          groups={groups}
          userId="user-1"
        />
      );

      expect(screen.getByText("2月の買い物")).toBeInTheDocument();
      expect(screen.getByText("1月の買い物")).toBeInTheDocument();
    });
  });

  describe("空状態", () => {
    it("支払いがない場合にメッセージが表示される", () => {
      render(
        <PaymentListWithFilter
          payments={[]}
          groups={groups}
          userId="user-1"
        />
      );

      expect(screen.getByText("支払いがありません")).toBeInTheDocument();
    });

    it("フィルタ後に該当なしの場合にメッセージが表示される", () => {
      const payments = [
        makePayment({ id: "p-1", group_id: "group-1", description: "買い物" }),
      ];

      render(
        <PaymentListWithFilter
          payments={payments}
          groups={groups}
          userId="user-1"
        />
      );

      // Filter to group-2 (no payments)
      fireEvent.click(screen.getByRole("button", { name: "趣味サークル" }));
      expect(screen.getByText("支払いがありません")).toBeInTheDocument();
    });
  });

  describe("未分類カテゴリ", () => {
    it("カテゴリなしの支払いに「未分類」テキストバッジを表示しない（❓ アイコンで代替）", () => {
      const payments = [
        makePayment({ id: "p-1", categories: null }),
      ];

      render(
        <PaymentListWithFilter
          payments={payments}
          groups={[{ id: "group-1", name: "テスト" }]}
          userId="user-1"
        />
      );

      expect(screen.queryByText("未分類")).not.toBeInTheDocument();
    });
  });
});
