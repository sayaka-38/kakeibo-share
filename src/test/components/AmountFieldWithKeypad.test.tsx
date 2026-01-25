/**
 * AmountFieldWithKeypad コンポーネントのテスト
 *
 * Phase 2-2 Step 3: NumericKeypad を AmountField に統合
 *
 * TDD Red Phase: まずテストを書き、失敗することを確認
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AmountFieldWithKeypad } from "@/components/payment-form/fields/AmountFieldWithKeypad";

describe("AmountFieldWithKeypad", () => {
  describe("基本レンダリング", () => {
    it("金額入力欄が表示される", () => {
      render(<AmountFieldWithKeypad value="" onChange={() => {}} />);
      expect(screen.getByLabelText(/金額/)).toBeInTheDocument();
    });

    it("通貨記号が表示される", () => {
      render(<AmountFieldWithKeypad value="" onChange={() => {}} />);
      expect(screen.getByText("¥")).toBeInTheDocument();
    });
  });

  describe("キーパッド表示", () => {
    it("デフォルトではキーパッドは非表示", () => {
      render(<AmountFieldWithKeypad value="" onChange={() => {}} />);
      expect(screen.queryByTestId("numeric-keypad")).not.toBeInTheDocument();
    });

    it("入力欄をフォーカスするとキーパッドが表示される", async () => {
      render(<AmountFieldWithKeypad value="" onChange={() => {}} />);
      const input = screen.getByLabelText(/金額/);
      fireEvent.focus(input);

      await waitFor(() => {
        expect(screen.getByTestId("numeric-keypad")).toBeInTheDocument();
      });
    });

    it("キーパッド外をクリックするとキーパッドが非表示になる", async () => {
      render(
        <div>
          <AmountFieldWithKeypad value="" onChange={() => {}} />
          <button data-testid="outside">Outside</button>
        </div>
      );

      const input = screen.getByLabelText(/金額/);
      fireEvent.focus(input);

      await waitFor(() => {
        expect(screen.getByTestId("numeric-keypad")).toBeInTheDocument();
      });

      // 外側をクリック
      fireEvent.mouseDown(screen.getByTestId("outside"));

      await waitFor(() => {
        expect(screen.queryByTestId("numeric-keypad")).not.toBeInTheDocument();
      });
    });
  });

  describe("キーパッド入力", () => {
    it("キーパッドの数字を押すと値が入力される", async () => {
      const handleChange = vi.fn();
      render(<AmountFieldWithKeypad value="" onChange={handleChange} />);

      const input = screen.getByLabelText(/金額/);
      fireEvent.focus(input);

      await waitFor(() => {
        expect(screen.getByTestId("numeric-keypad")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: "1" }));
      expect(handleChange).toHaveBeenCalledWith("1");
    });

    it("連続してキーを押すと値が追加される", async () => {
      const handleChange = vi.fn();
      const { rerender } = render(
        <AmountFieldWithKeypad value="" onChange={handleChange} />
      );

      const input = screen.getByLabelText(/金額/);
      fireEvent.focus(input);

      await waitFor(() => {
        expect(screen.getByTestId("numeric-keypad")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: "1" }));
      expect(handleChange).toHaveBeenCalledWith("1");

      // 値を更新して再レンダリング
      rerender(<AmountFieldWithKeypad value="1" onChange={handleChange} />);

      fireEvent.click(screen.getByRole("button", { name: "5" }));
      expect(handleChange).toHaveBeenCalledWith("15");
    });

    it("削除キーで最後の文字が削除される", async () => {
      const handleChange = vi.fn();
      render(<AmountFieldWithKeypad value="123" onChange={handleChange} />);

      const input = screen.getByLabelText(/金額/);
      fireEvent.focus(input);

      await waitFor(() => {
        expect(screen.getByTestId("numeric-keypad")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: /削除/ }));
      expect(handleChange).toHaveBeenCalledWith("12");
    });

    it("確定キーでキーパッドが閉じる", async () => {
      render(<AmountFieldWithKeypad value="100" onChange={() => {}} />);

      const input = screen.getByLabelText(/金額/);
      fireEvent.focus(input);

      await waitFor(() => {
        expect(screen.getByTestId("numeric-keypad")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: /確定/ }));

      await waitFor(() => {
        expect(screen.queryByTestId("numeric-keypad")).not.toBeInTheDocument();
      });
    });
  });

  describe("エラー表示", () => {
    it("エラーがある場合エラーメッセージを表示する", () => {
      render(
        <AmountFieldWithKeypad
          value=""
          onChange={() => {}}
          error="金額を入力してください"
        />
      );
      expect(screen.getByText("金額を入力してください")).toBeInTheDocument();
    });

    it("エラーがある場合入力欄のボーダーが赤くなる", () => {
      render(
        <AmountFieldWithKeypad
          value=""
          onChange={() => {}}
          error="エラー"
        />
      );
      const input = screen.getByLabelText(/金額/);
      expect(input).toHaveClass("border-red-500");
    });
  });

  describe("直接入力", () => {
    it("入力欄に直接数字を入力できる", () => {
      const handleChange = vi.fn();
      render(<AmountFieldWithKeypad value="" onChange={handleChange} />);

      const input = screen.getByLabelText(/金額/);
      fireEvent.change(input, { target: { value: "500" } });

      expect(handleChange).toHaveBeenCalledWith("500");
    });
  });

  describe("金額表示", () => {
    it("入力された値が金額フォーマットで表示される", () => {
      render(<AmountFieldWithKeypad value="1500" onChange={() => {}} />);
      const input = screen.getByLabelText(/金額/) as HTMLInputElement;
      expect(input.value).toBe("1500");
    });
  });
});
