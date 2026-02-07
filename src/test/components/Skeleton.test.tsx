/**
 * Skeleton コンポーネントのテスト
 *
 * Phase 2-2: UI/UX最適化 - スケルトンローディング
 *
 * TDD Red Phase: まずテストを書き、失敗することを確認
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Skeleton, SkeletonText, SkeletonCard } from "@/components/ui/Skeleton";

describe("Skeleton", () => {
  describe("基本レンダリング", () => {
    it("デフォルトでdiv要素としてレンダリングされる", () => {
      render(<Skeleton data-testid="skeleton" />);
      const skeleton = screen.getByTestId("skeleton");
      expect(skeleton.tagName).toBe("DIV");
    });

    it("アニメーション用のクラスが適用されている", () => {
      render(<Skeleton data-testid="skeleton" />);
      const skeleton = screen.getByTestId("skeleton");
      expect(skeleton).toHaveClass("animate-pulse");
    });

    it("背景色のクラスが適用されている", () => {
      render(<Skeleton data-testid="skeleton" />);
      const skeleton = screen.getByTestId("skeleton");
      expect(skeleton).toHaveClass("bg-theme-card-border");
    });

    it("角丸のクラスが適用されている", () => {
      render(<Skeleton data-testid="skeleton" />);
      const skeleton = screen.getByTestId("skeleton");
      expect(skeleton).toHaveClass("rounded");
    });
  });

  describe("サイズバリエーション", () => {
    it("幅を指定できる", () => {
      render(<Skeleton width="w-32" data-testid="skeleton" />);
      const skeleton = screen.getByTestId("skeleton");
      expect(skeleton).toHaveClass("w-32");
    });

    it("高さを指定できる", () => {
      render(<Skeleton height="h-8" data-testid="skeleton" />);
      const skeleton = screen.getByTestId("skeleton");
      expect(skeleton).toHaveClass("h-8");
    });

    it("幅と高さを同時に指定できる", () => {
      render(<Skeleton width="w-full" height="h-12" data-testid="skeleton" />);
      const skeleton = screen.getByTestId("skeleton");
      expect(skeleton).toHaveClass("w-full");
      expect(skeleton).toHaveClass("h-12");
    });
  });

  describe("形状バリエーション", () => {
    it("円形を指定できる", () => {
      render(<Skeleton variant="circle" data-testid="skeleton" />);
      const skeleton = screen.getByTestId("skeleton");
      expect(skeleton).toHaveClass("rounded-full");
    });

    it("デフォルトは角丸四角形", () => {
      render(<Skeleton data-testid="skeleton" />);
      const skeleton = screen.getByTestId("skeleton");
      expect(skeleton).toHaveClass("rounded");
      expect(skeleton).not.toHaveClass("rounded-full");
    });
  });

  describe("アクセシビリティ", () => {
    it("aria-hiddenがtrueに設定されている", () => {
      render(<Skeleton data-testid="skeleton" />);
      const skeleton = screen.getByTestId("skeleton");
      expect(skeleton).toHaveAttribute("aria-hidden", "true");
    });
  });

  describe("カスタムクラス", () => {
    it("追加のclassNameを受け取れる", () => {
      render(<Skeleton className="mt-4" data-testid="skeleton" />);
      const skeleton = screen.getByTestId("skeleton");
      expect(skeleton).toHaveClass("mt-4");
    });
  });
});

describe("SkeletonText", () => {
  describe("基本レンダリング", () => {
    it("デフォルトで1行のスケルトンを表示する", () => {
      render(<SkeletonText data-testid="skeleton-text" />);
      const container = screen.getByTestId("skeleton-text");
      const lines = container.querySelectorAll("[aria-hidden='true']");
      expect(lines).toHaveLength(1);
    });

    it("指定した行数のスケルトンを表示する", () => {
      render(<SkeletonText lines={3} data-testid="skeleton-text" />);
      const container = screen.getByTestId("skeleton-text");
      const lines = container.querySelectorAll("[aria-hidden='true']");
      expect(lines).toHaveLength(3);
    });

    it("最後の行は短くなる", () => {
      render(<SkeletonText lines={3} data-testid="skeleton-text" />);
      const container = screen.getByTestId("skeleton-text");
      const lines = container.querySelectorAll("[aria-hidden='true']");
      const lastLine = lines[lines.length - 1];
      expect(lastLine).toHaveClass("w-3/4");
    });
  });

  describe("テキストサイズ", () => {
    it("デフォルトは通常サイズ（h-4）", () => {
      render(<SkeletonText data-testid="skeleton-text" />);
      const container = screen.getByTestId("skeleton-text");
      const line = container.querySelector("[aria-hidden='true']");
      expect(line).toHaveClass("h-4");
    });

    it("小さいサイズを指定できる（h-3）", () => {
      render(<SkeletonText size="sm" data-testid="skeleton-text" />);
      const container = screen.getByTestId("skeleton-text");
      const line = container.querySelector("[aria-hidden='true']");
      expect(line).toHaveClass("h-3");
    });

    it("大きいサイズを指定できる（h-6）", () => {
      render(<SkeletonText size="lg" data-testid="skeleton-text" />);
      const container = screen.getByTestId("skeleton-text");
      const line = container.querySelector("[aria-hidden='true']");
      expect(line).toHaveClass("h-6");
    });
  });
});

describe("SkeletonCard", () => {
  describe("基本レンダリング", () => {
    it("カード形式でレンダリングされる", () => {
      render(<SkeletonCard data-testid="skeleton-card" />);
      const card = screen.getByTestId("skeleton-card");
      expect(card).toHaveClass("bg-theme-card-bg");
      expect(card).toHaveClass("rounded-lg");
      expect(card).toHaveClass("shadow");
    });

    it("内部にスケルトン要素を含む", () => {
      render(<SkeletonCard data-testid="skeleton-card" />);
      const card = screen.getByTestId("skeleton-card");
      const skeletons = card.querySelectorAll("[aria-hidden='true']");
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  describe("パディング", () => {
    it("適切なパディングが設定されている", () => {
      render(<SkeletonCard data-testid="skeleton-card" />);
      const card = screen.getByTestId("skeleton-card");
      expect(card).toHaveClass("p-4");
    });
  });
});
