import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PaymentForm } from "@/components/PaymentForm";
import { t } from "@/lib/i18n";

describe("PaymentForm", () => {
  const mockOnSubmit = vi.fn();

  beforeEach(() => {
    mockOnSubmit.mockClear();
  });

  // ============================================
  // フォーム表示テスト
  // ============================================
  describe("フォーム表示", () => {
    it("金額入力欄が表示される", () => {
      render(<PaymentForm onSubmit={mockOnSubmit} />);
      const amountInput = screen.getByLabelText(t("payments.form.amount"));
      expect(amountInput).toBeInTheDocument();
      expect(amountInput).toHaveAttribute("inputMode", "numeric");
    });

    it("説明入力欄が表示される", () => {
      render(<PaymentForm onSubmit={mockOnSubmit} />);
      const descriptionInput = screen.getByLabelText(
        t("payments.form.description")
      );
      expect(descriptionInput).toBeInTheDocument();
      expect(descriptionInput).toHaveAttribute(
        "placeholder",
        t("payments.form.descriptionPlaceholder")
      );
    });

    it("日付入力欄が表示される", () => {
      render(<PaymentForm onSubmit={mockOnSubmit} />);
      const dateInput = screen.getByLabelText(t("payments.form.date"));
      expect(dateInput).toBeInTheDocument();
    });

    it("登録ボタンが表示される", () => {
      render(<PaymentForm onSubmit={mockOnSubmit} />);
      const submitButton = screen.getByRole("button", {
        name: t("payments.form.submit"),
      });
      expect(submitButton).toBeInTheDocument();
    });

    it("日付のデフォルト値が今日である", () => {
      render(<PaymentForm onSubmit={mockOnSubmit} />);
      const dateInput = screen.getByLabelText(
        t("payments.form.date")
      ) as HTMLInputElement;
      const today = new Date().toISOString().split("T")[0];
      expect(dateInput.value).toBe(today);
    });
  });

  // ============================================
  // バリデーションエラー表示テスト（異常系）
  // ============================================
  describe("バリデーションエラー表示", () => {
    it("金額が空で送信するとエラーを表示する", async () => {
      const user = userEvent.setup();
      render(<PaymentForm onSubmit={mockOnSubmit} />);

      // 説明を入力（金額は空のまま）
      await user.type(
        screen.getByLabelText(t("payments.form.description")),
        "テスト"
      );

      // 送信
      await user.click(
        screen.getByRole("button", { name: t("payments.form.submit") })
      );

      // エラーメッセージが表示される
      await waitFor(() => {
        expect(
          screen.getByText(t("payments.validation.amountMin"))
        ).toBeInTheDocument();
      });

      // onSubmit は呼ばれない
      expect(mockOnSubmit).not.toHaveBeenCalled();
    });

    it("金額が0で送信するとエラーを表示する", async () => {
      const user = userEvent.setup();
      render(<PaymentForm onSubmit={mockOnSubmit} />);

      await user.type(
        screen.getByLabelText(t("payments.form.amount")),
        "0"
      );
      await user.type(
        screen.getByLabelText(t("payments.form.description")),
        "テスト"
      );
      await user.click(
        screen.getByRole("button", { name: t("payments.form.submit") })
      );

      await waitFor(() => {
        expect(
          screen.getByText(t("payments.validation.amountMin"))
        ).toBeInTheDocument();
      });
      expect(mockOnSubmit).not.toHaveBeenCalled();
    });

    it("金額が100万円を超えると送信するとエラーを表示する", async () => {
      const user = userEvent.setup();
      render(<PaymentForm onSubmit={mockOnSubmit} />);

      await user.type(
        screen.getByLabelText(t("payments.form.amount")),
        "1000001"
      );
      await user.type(
        screen.getByLabelText(t("payments.form.description")),
        "テスト"
      );
      await user.click(
        screen.getByRole("button", { name: t("payments.form.submit") })
      );

      await waitFor(() => {
        expect(
          screen.getByText(t("payments.validation.amountMax"))
        ).toBeInTheDocument();
      });
      expect(mockOnSubmit).not.toHaveBeenCalled();
    });

    it("説明が空で送信するとエラーを表示する", async () => {
      const user = userEvent.setup();
      render(<PaymentForm onSubmit={mockOnSubmit} />);

      await user.type(
        screen.getByLabelText(t("payments.form.amount")),
        "1000"
      );
      // 説明は空のまま
      await user.click(
        screen.getByRole("button", { name: t("payments.form.submit") })
      );

      await waitFor(() => {
        expect(
          screen.getByText(t("payments.validation.descriptionRequired"))
        ).toBeInTheDocument();
      });
      expect(mockOnSubmit).not.toHaveBeenCalled();
    });

    it("未来の日付で送信するとエラーを表示する", async () => {
      const user = userEvent.setup();
      render(<PaymentForm onSubmit={mockOnSubmit} />);

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split("T")[0];

      await user.type(
        screen.getByLabelText(t("payments.form.amount")),
        "1000"
      );
      await user.type(
        screen.getByLabelText(t("payments.form.description")),
        "テスト"
      );

      // 日付を未来に変更
      const dateInput = screen.getByLabelText(t("payments.form.date"));
      await user.clear(dateInput);
      await user.type(dateInput, tomorrowStr);

      await user.click(
        screen.getByRole("button", { name: t("payments.form.submit") })
      );

      await waitFor(() => {
        expect(
          screen.getByText(t("payments.validation.dateFuture"))
        ).toBeInTheDocument();
      });
      expect(mockOnSubmit).not.toHaveBeenCalled();
    });

    it("複数のエラーがある場合すべて表示する", async () => {
      const user = userEvent.setup();
      render(<PaymentForm onSubmit={mockOnSubmit} />);

      // すべて空のまま送信
      await user.click(
        screen.getByRole("button", { name: t("payments.form.submit") })
      );

      await waitFor(() => {
        expect(
          screen.getByText(t("payments.validation.amountMin"))
        ).toBeInTheDocument();
        expect(
          screen.getByText(t("payments.validation.descriptionRequired"))
        ).toBeInTheDocument();
      });
      expect(mockOnSubmit).not.toHaveBeenCalled();
    });
  });

  // ============================================
  // 正常系テスト
  // ============================================
  describe("正常系", () => {
    it("有効な入力で送信するとonSubmitが呼ばれる", async () => {
      const user = userEvent.setup();
      render(<PaymentForm onSubmit={mockOnSubmit} />);

      await user.type(
        screen.getByLabelText(t("payments.form.amount")),
        "1500"
      );
      await user.type(
        screen.getByLabelText(t("payments.form.description")),
        "スーパーで買い物"
      );
      await user.click(
        screen.getByRole("button", { name: t("payments.form.submit") })
      );

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledTimes(1);
        expect(mockOnSubmit).toHaveBeenCalledWith({
          amount: 1500,
          description: "スーパーで買い物",
          paymentDate: expect.any(Date),
        });
      });
    });

    it("送信中はボタンが無効化される", async () => {
      const user = userEvent.setup();
      // onSubmit が resolve しないようにする
      mockOnSubmit.mockImplementation(
        () => new Promise(() => {})
      );
      render(<PaymentForm onSubmit={mockOnSubmit} />);

      await user.type(
        screen.getByLabelText(t("payments.form.amount")),
        "1500"
      );
      await user.type(
        screen.getByLabelText(t("payments.form.description")),
        "テスト"
      );
      await user.click(
        screen.getByRole("button", { name: t("payments.form.submit") })
      );

      await waitFor(() => {
        const button = screen.getByRole("button", {
          name: t("payments.form.submitting"),
        });
        expect(button).toBeDisabled();
      });
    });

    it("送信成功後フォームがリセットされる", async () => {
      const user = userEvent.setup();
      mockOnSubmit.mockResolvedValue(undefined);
      render(<PaymentForm onSubmit={mockOnSubmit} />);

      await user.type(
        screen.getByLabelText(t("payments.form.amount")),
        "1500"
      );
      await user.type(
        screen.getByLabelText(t("payments.form.description")),
        "テスト"
      );
      await user.click(
        screen.getByRole("button", { name: t("payments.form.submit") })
      );

      await waitFor(() => {
        const amountInput = screen.getByLabelText(
          t("payments.form.amount")
        ) as HTMLInputElement;
        const descriptionInput = screen.getByLabelText(
          t("payments.form.description")
        ) as HTMLInputElement;
        expect(amountInput.value).toBe("");
        expect(descriptionInput.value).toBe("");
      });
    });
  });
});
