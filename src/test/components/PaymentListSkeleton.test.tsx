/**
 * PaymentListSkeleton コンポーネントのテスト
 *
 * Phase 2-2 Step 2: Skeleton を支払い一覧に適用
 *
 * TDD Red Phase: まずテストを書き、失敗することを確認
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PaymentListSkeleton } from "@/components/payment-list/PaymentListSkeleton";

describe("PaymentListSkeleton", () => {
  describe("基本レンダリング", () => {
    it("デフォルトで3件のスケルトンアイテムを表示する", () => {
      render(<PaymentListSkeleton />);
      const items = screen.getAllByTestId("payment-skeleton-item");
      expect(items).toHaveLength(3);
    });

    it("count propsで表示件数を変更できる", () => {
      render(<PaymentListSkeleton count={5} />);
      const items = screen.getAllByTestId("payment-skeleton-item");
      expect(items).toHaveLength(5);
    });
  });

  describe("スケルトン構造", () => {
    it("各アイテムにスケルトン要素が含まれる", () => {
      render(<PaymentListSkeleton count={1} />);
      const item = screen.getByTestId("payment-skeleton-item");
      // スケルトン要素（aria-hidden=true）が含まれている
      const skeletons = item.querySelectorAll("[aria-hidden='true']");
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it("リストコンテナが divide-y クラスを持つ", () => {
      render(<PaymentListSkeleton />);
      const container = screen.getByTestId("payment-list-skeleton");
      expect(container).toHaveClass("divide-y");
    });
  });

  describe("アクセシビリティ", () => {
    it("aria-busy=true が設定される", () => {
      render(<PaymentListSkeleton />);
      const container = screen.getByTestId("payment-list-skeleton");
      expect(container).toHaveAttribute("aria-busy", "true");
    });

    it("aria-label でローディング中であることを示す", () => {
      render(<PaymentListSkeleton />);
      const container = screen.getByTestId("payment-list-skeleton");
      expect(container).toHaveAttribute("aria-label");
    });
  });
});
