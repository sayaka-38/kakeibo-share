/**
 * NumericKeypad コンポーネントのテスト
 *
 * Phase 2-2: UI/UX最適化 - 数値キーパッド
 *
 * TDD Red Phase: まずテストを書き、失敗することを確認
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NumericKeypad } from "@/components/ui/NumericKeypad";

describe("NumericKeypad", () => {
  describe("基本レンダリング", () => {
    it("0-9の数字キーがすべて表示される", () => {
      render(<NumericKeypad value="" onChange={() => {}} />);

      for (let i = 0; i <= 9; i++) {
        expect(screen.getByRole("button", { name: String(i) })).toBeInTheDocument();
      }
    });

    it("削除キーが表示される", () => {
      render(<NumericKeypad value="" onChange={() => {}} />);
      expect(screen.getByRole("button", { name: /削除|backspace/i })).toBeInTheDocument();
    });

    it("確定キーが表示される", () => {
      render(<NumericKeypad value="" onChange={() => {}} />);
      expect(screen.getByRole("button", { name: /確定|ok|enter/i })).toBeInTheDocument();
    });
  });

  describe("タッチターゲット（44px）", () => {
    it("すべてのキーがmin-h-11（44px）を持つ", () => {
      render(<NumericKeypad value="" onChange={() => {}} />);

      const buttons = screen.getAllByRole("button");
      buttons.forEach((button) => {
        expect(button).toHaveClass("min-h-11");
      });
    });
  });

  describe("数字入力", () => {
    it("数字キーを押すと値が追加される", () => {
      const handleChange = vi.fn();
      render(<NumericKeypad value="" onChange={handleChange} />);

      fireEvent.click(screen.getByRole("button", { name: "1" }));
      expect(handleChange).toHaveBeenCalledWith("1");
    });

    it("既存の値に数字が追加される", () => {
      const handleChange = vi.fn();
      render(<NumericKeypad value="12" onChange={handleChange} />);

      fireEvent.click(screen.getByRole("button", { name: "3" }));
      expect(handleChange).toHaveBeenCalledWith("123");
    });

    it("先頭の0は許可しない（0以外の場合）", () => {
      const handleChange = vi.fn();
      render(<NumericKeypad value="0" onChange={handleChange} />);

      fireEvent.click(screen.getByRole("button", { name: "5" }));
      expect(handleChange).toHaveBeenCalledWith("5");
    });

    it("値が0の状態で0を押しても0のまま", () => {
      const handleChange = vi.fn();
      render(<NumericKeypad value="0" onChange={handleChange} />);

      fireEvent.click(screen.getByRole("button", { name: "0" }));
      expect(handleChange).toHaveBeenCalledWith("0");
    });
  });

  describe("削除機能", () => {
    it("削除キーを押すと最後の文字が削除される", () => {
      const handleChange = vi.fn();
      render(<NumericKeypad value="123" onChange={handleChange} />);

      fireEvent.click(screen.getByRole("button", { name: /削除|backspace/i }));
      expect(handleChange).toHaveBeenCalledWith("12");
    });

    it("値が1文字の場合、削除すると空文字になる", () => {
      const handleChange = vi.fn();
      render(<NumericKeypad value="5" onChange={handleChange} />);

      fireEvent.click(screen.getByRole("button", { name: /削除|backspace/i }));
      expect(handleChange).toHaveBeenCalledWith("");
    });

    it("値が空の場合、削除しても空のまま", () => {
      const handleChange = vi.fn();
      render(<NumericKeypad value="" onChange={handleChange} />);

      fireEvent.click(screen.getByRole("button", { name: /削除|backspace/i }));
      expect(handleChange).toHaveBeenCalledWith("");
    });
  });

  describe("確定機能", () => {
    it("確定キーを押すとonConfirmが呼ばれる", () => {
      const handleConfirm = vi.fn();
      render(<NumericKeypad value="100" onChange={() => {}} onConfirm={handleConfirm} />);

      fireEvent.click(screen.getByRole("button", { name: /確定|ok|enter/i }));
      expect(handleConfirm).toHaveBeenCalledWith("100");
    });

    it("onConfirmが未設定でも確定キーはレンダリングされる", () => {
      render(<NumericKeypad value="" onChange={() => {}} />);
      expect(screen.getByRole("button", { name: /確定|ok|enter/i })).toBeInTheDocument();
    });
  });

  describe("最大桁数制限", () => {
    it("maxLengthを超える入力は無視される", () => {
      const handleChange = vi.fn();
      render(<NumericKeypad value="123456" onChange={handleChange} maxLength={6} />);

      fireEvent.click(screen.getByRole("button", { name: "7" }));
      expect(handleChange).not.toHaveBeenCalled();
    });

    it("maxLength以下なら入力できる", () => {
      const handleChange = vi.fn();
      render(<NumericKeypad value="12345" onChange={handleChange} maxLength={6} />);

      fireEvent.click(screen.getByRole("button", { name: "6" }));
      expect(handleChange).toHaveBeenCalledWith("123456");
    });
  });

  describe("無効状態", () => {
    it("disabled=trueで全キーが無効化される", () => {
      render(<NumericKeypad value="" onChange={() => {}} disabled />);

      const buttons = screen.getAllByRole("button");
      buttons.forEach((button) => {
        expect(button).toBeDisabled();
      });
    });
  });

  describe("レイアウト", () => {
    it("グリッドレイアウトが適用される", () => {
      render(<NumericKeypad value="" onChange={() => {}} />);

      const keypad = screen.getByTestId("numeric-keypad");
      expect(keypad).toHaveClass("grid");
      expect(keypad).toHaveClass("grid-cols-3");
    });
  });

  describe("アクセシビリティ", () => {
    it("role=groupが設定される", () => {
      render(<NumericKeypad value="" onChange={() => {}} />);

      const keypad = screen.getByTestId("numeric-keypad");
      expect(keypad).toHaveAttribute("role", "group");
    });

    it("aria-labelが設定できる", () => {
      render(
        <NumericKeypad value="" onChange={() => {}} aria-label="金額入力キーパッド" />
      );

      const keypad = screen.getByTestId("numeric-keypad");
      expect(keypad).toHaveAttribute("aria-label", "金額入力キーパッド");
    });
  });
});
