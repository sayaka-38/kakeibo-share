import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DemoBanner } from "@/components/demo/DemoBanner";

describe("DemoBanner - デモモード表示バナー", () => {
  // ============================================
  // 異常系：非表示条件
  // ============================================
  describe("非表示条件", () => {
    it("isDemo が false の場合バナーを表示しない", () => {
      render(<DemoBanner isDemo={false} />);

      expect(screen.queryByText(/デモモード/i)).not.toBeInTheDocument();
    });

    it("expiresAt が未指定の場合でも isDemo が true ならバナーを表示する", () => {
      render(<DemoBanner isDemo={true} />);

      expect(screen.getByText(/デモモード/i)).toBeInTheDocument();
    });
  });

  // ============================================
  // 正常系：バナー表示
  // ============================================
  describe("バナー表示", () => {
    it("「デモモードで体験中」のテキストが表示される", () => {
      render(<DemoBanner isDemo={true} />);

      expect(screen.getByText(/デモモードで体験中/i)).toBeInTheDocument();
    });

    it("データリセットの注釈が表示される", () => {
      render(<DemoBanner isDemo={true} />);

      expect(
        screen.getByText(/このデータは自動的にリセットされます/i)
      ).toBeInTheDocument();
    });

    it("アカウント作成への誘導リンクが表示される", () => {
      render(<DemoBanner isDemo={true} />);

      expect(
        screen.getByRole("link", { name: /アカウントを作成/i })
      ).toBeInTheDocument();
    });

    it("誘導リンクが /signup へ遷移する", () => {
      render(<DemoBanner isDemo={true} />);

      const link = screen.getByRole("link", { name: /アカウントを作成/i });
      expect(link).toHaveAttribute("href", "/signup");
    });
  });

  // ============================================
  // 正常系：有効期限表示
  // ============================================
  describe("有効期限表示", () => {
    it("有効期限が指定されている場合残り時間を表示する", () => {
      const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000); // 12時間後

      render(<DemoBanner isDemo={true} expiresAt={expiresAt} />);

      // 「残り約12時間」のような表示があることを確認
      expect(screen.getByText(/残り/i)).toBeInTheDocument();
    });
  });

  // ============================================
  // 正常系：スタイリング
  // ============================================
  describe("スタイリング", () => {
    it("バナーが視認しやすい背景色を持つ", () => {
      render(<DemoBanner isDemo={true} />);

      const banner = screen.getByRole("banner");
      // Tailwind のクラスが適用されていることを確認
      expect(banner).toHaveClass("bg-theme-primary/10");
    });
  });
});
