/**
 * Button コンポーネントのテスト
 *
 * Phase 2-2: UI/UX最適化 - 44px タッチターゲット
 *
 * TDD Red Phase: まずテストを書き、失敗することを確認
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Button } from "@/components/ui/Button";

describe("Button", () => {
  describe("基本レンダリング", () => {
    it("button要素としてレンダリングされる", () => {
      render(<Button>Click me</Button>);
      const button = screen.getByRole("button");
      expect(button).toBeInTheDocument();
    });

    it("子要素のテキストを表示する", () => {
      render(<Button>Click me</Button>);
      expect(screen.getByText("Click me")).toBeInTheDocument();
    });
  });

  describe("タッチターゲット（44px）", () => {
    it("デフォルトでmin-h-11（44px）クラスが適用される", () => {
      render(<Button>Touch me</Button>);
      const button = screen.getByRole("button");
      expect(button).toHaveClass("min-h-11");
    });
  });

  describe("バリアント", () => {
    it("primaryバリアントのスタイルが適用される", () => {
      render(<Button variant="primary">Primary</Button>);
      const button = screen.getByRole("button");
      expect(button).toHaveClass("bg-blue-600");
      expect(button).toHaveClass("text-white");
    });

    it("secondaryバリアントのスタイルが適用される", () => {
      render(<Button variant="secondary">Secondary</Button>);
      const button = screen.getByRole("button");
      expect(button).toHaveClass("bg-white");
      expect(button).toHaveClass("border-gray-300");
    });

    it("ghostバリアントのスタイルが適用される", () => {
      render(<Button variant="ghost">Ghost</Button>);
      const button = screen.getByRole("button");
      expect(button).toHaveClass("bg-transparent");
    });

    it("dangerバリアントのスタイルが適用される", () => {
      render(<Button variant="danger">Danger</Button>);
      const button = screen.getByRole("button");
      expect(button).toHaveClass("bg-red-600");
      expect(button).toHaveClass("text-white");
    });
  });

  describe("サイズ", () => {
    it("smサイズでもmin-h-11（44px）が維持される", () => {
      render(<Button size="sm">Small</Button>);
      const button = screen.getByRole("button");
      expect(button).toHaveClass("min-h-11");
      expect(button).toHaveClass("px-3");
      expect(button).toHaveClass("text-sm");
    });

    it("mdサイズのスタイルが適用される", () => {
      render(<Button size="md">Medium</Button>);
      const button = screen.getByRole("button");
      expect(button).toHaveClass("min-h-11");
      expect(button).toHaveClass("px-4");
    });

    it("lgサイズのスタイルが適用される", () => {
      render(<Button size="lg">Large</Button>);
      const button = screen.getByRole("button");
      expect(button).toHaveClass("min-h-12");
      expect(button).toHaveClass("px-6");
    });
  });

  describe("ローディング状態", () => {
    it("loading=trueでスピナーが表示される", () => {
      render(<Button loading>Loading</Button>);
      expect(screen.getByTestId("button-spinner")).toBeInTheDocument();
    });

    it("loading=trueでボタンが無効化される", () => {
      render(<Button loading>Loading</Button>);
      const button = screen.getByRole("button");
      expect(button).toBeDisabled();
    });

    it("loading=trueでaria-busyがtrueになる", () => {
      render(<Button loading>Loading</Button>);
      const button = screen.getByRole("button");
      expect(button).toHaveAttribute("aria-busy", "true");
    });

    it("loading中もテキストは表示される（スピナーと共に）", () => {
      render(<Button loading>Submit</Button>);
      expect(screen.getByText("Submit")).toBeInTheDocument();
    });
  });

  describe("無効状態", () => {
    it("disabled=trueでボタンが無効化される", () => {
      render(<Button disabled>Disabled</Button>);
      const button = screen.getByRole("button");
      expect(button).toBeDisabled();
    });

    it("disabled=trueで透明度が下がる", () => {
      render(<Button disabled>Disabled</Button>);
      const button = screen.getByRole("button");
      expect(button).toHaveClass("disabled:opacity-50");
    });

    it("disabled=trueでカーソルがnot-allowedになる", () => {
      render(<Button disabled>Disabled</Button>);
      const button = screen.getByRole("button");
      expect(button).toHaveClass("disabled:cursor-not-allowed");
    });
  });

  describe("クリックイベント", () => {
    it("クリックでonClickが呼ばれる", () => {
      const handleClick = vi.fn();
      render(<Button onClick={handleClick}>Click</Button>);
      fireEvent.click(screen.getByRole("button"));
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it("disabled時はonClickが呼ばれない", () => {
      const handleClick = vi.fn();
      render(
        <Button onClick={handleClick} disabled>
          Click
        </Button>
      );
      fireEvent.click(screen.getByRole("button"));
      expect(handleClick).not.toHaveBeenCalled();
    });

    it("loading時はonClickが呼ばれない", () => {
      const handleClick = vi.fn();
      render(
        <Button onClick={handleClick} loading>
          Click
        </Button>
      );
      fireEvent.click(screen.getByRole("button"));
      expect(handleClick).not.toHaveBeenCalled();
    });
  });

  describe("フル幅オプション", () => {
    it("fullWidth=trueでw-fullクラスが適用される", () => {
      render(<Button fullWidth>Full Width</Button>);
      const button = screen.getByRole("button");
      expect(button).toHaveClass("w-full");
    });
  });

  describe("アクセシビリティ", () => {
    it("typeがsubmitのボタンを作成できる", () => {
      render(<Button type="submit">Submit</Button>);
      const button = screen.getByRole("button");
      expect(button).toHaveAttribute("type", "submit");
    });

    it("aria-labelを設定できる", () => {
      render(<Button aria-label="Close dialog">X</Button>);
      const button = screen.getByRole("button");
      expect(button).toHaveAttribute("aria-label", "Close dialog");
    });
  });

  describe("カスタムクラス", () => {
    it("追加のclassNameを受け取れる", () => {
      render(<Button className="mt-4">Custom</Button>);
      const button = screen.getByRole("button");
      expect(button).toHaveClass("mt-4");
    });
  });
});
