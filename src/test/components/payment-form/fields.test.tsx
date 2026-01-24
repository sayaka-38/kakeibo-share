import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  AmountField,
  DescriptionField,
  DateField,
} from "@/components/payment-form/fields";
import { t } from "@/lib/i18n";

// ============================================
// AmountField テスト
// ============================================
describe("AmountField", () => {
  describe("表示", () => {
    it("ラベルが表示される", () => {
      render(
        <AmountField
          value=""
          onChange={vi.fn()}
        />
      );
      expect(screen.getByLabelText(t("payments.form.amount"))).toBeInTheDocument();
    });

    it("通貨記号が表示される", () => {
      render(
        <AmountField
          value=""
          onChange={vi.fn()}
        />
      );
      expect(screen.getByText(t("common.currency"))).toBeInTheDocument();
    });

    it("プレースホルダーが表示される", () => {
      render(
        <AmountField
          value=""
          onChange={vi.fn()}
        />
      );
      expect(
        screen.getByPlaceholderText(t("payments.form.amountPlaceholder"))
      ).toBeInTheDocument();
    });

    it("inputMode が numeric である", () => {
      render(
        <AmountField
          value=""
          onChange={vi.fn()}
        />
      );
      expect(screen.getByLabelText(t("payments.form.amount"))).toHaveAttribute(
        "inputMode",
        "numeric"
      );
    });
  });

  describe("エラー表示", () => {
    it("エラーがある場合はエラーメッセージを表示する", () => {
      render(
        <AmountField
          value=""
          onChange={vi.fn()}
          error="金額を入力してください"
        />
      );
      expect(screen.getByText("金額を入力してください")).toBeInTheDocument();
    });

    it("エラーがある場合は aria-invalid が true になる", () => {
      render(
        <AmountField
          value=""
          onChange={vi.fn()}
          error="エラー"
        />
      );
      expect(screen.getByLabelText(t("payments.form.amount"))).toHaveAttribute(
        "aria-invalid",
        "true"
      );
    });

    it("エラーがない場合は aria-invalid が false になる", () => {
      render(
        <AmountField
          value="1000"
          onChange={vi.fn()}
        />
      );
      expect(screen.getByLabelText(t("payments.form.amount"))).toHaveAttribute(
        "aria-invalid",
        "false"
      );
    });
  });

  describe("入力", () => {
    it("値を入力すると onChange が呼ばれる", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();

      render(
        <AmountField
          value=""
          onChange={onChange}
        />
      );

      await user.type(screen.getByLabelText(t("payments.form.amount")), "1500");

      // 各文字ごとに onChange が呼ばれる
      expect(onChange).toHaveBeenCalledTimes(4);
    });

    it("value が反映される", () => {
      render(
        <AmountField
          value="2500"
          onChange={vi.fn()}
        />
      );

      expect(screen.getByLabelText(t("payments.form.amount"))).toHaveValue("2500");
    });
  });
});

// ============================================
// DescriptionField テスト
// ============================================
describe("DescriptionField", () => {
  describe("表示", () => {
    it("ラベルが表示される", () => {
      render(
        <DescriptionField
          value=""
          onChange={vi.fn()}
        />
      );
      expect(screen.getByLabelText(t("payments.form.description"))).toBeInTheDocument();
    });

    it("プレースホルダーが表示される", () => {
      render(
        <DescriptionField
          value=""
          onChange={vi.fn()}
        />
      );
      expect(
        screen.getByPlaceholderText(t("payments.form.descriptionPlaceholder"))
      ).toBeInTheDocument();
    });
  });

  describe("エラー表示", () => {
    it("エラーがある場合はエラーメッセージを表示する", () => {
      render(
        <DescriptionField
          value=""
          onChange={vi.fn()}
          error="説明を入力してください"
        />
      );
      expect(screen.getByText("説明を入力してください")).toBeInTheDocument();
    });

    it("エラーがある場合は aria-invalid が true になる", () => {
      render(
        <DescriptionField
          value=""
          onChange={vi.fn()}
          error="エラー"
        />
      );
      expect(screen.getByLabelText(t("payments.form.description"))).toHaveAttribute(
        "aria-invalid",
        "true"
      );
    });
  });

  describe("入力", () => {
    it("値を入力すると onChange が呼ばれる", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();

      render(
        <DescriptionField
          value=""
          onChange={onChange}
        />
      );

      await user.type(
        screen.getByLabelText(t("payments.form.description")),
        "スーパー"
      );

      expect(onChange).toHaveBeenCalled();
    });

    it("value が反映される", () => {
      render(
        <DescriptionField
          value="コンビニで買い物"
          onChange={vi.fn()}
        />
      );

      expect(screen.getByLabelText(t("payments.form.description"))).toHaveValue(
        "コンビニで買い物"
      );
    });
  });
});

// ============================================
// DateField テスト
// ============================================
describe("DateField", () => {
  describe("表示", () => {
    it("ラベルが表示される", () => {
      render(
        <DateField
          value="2024-01-15"
          onChange={vi.fn()}
        />
      );
      expect(screen.getByLabelText(t("payments.form.date"))).toBeInTheDocument();
    });

    it("type が date である", () => {
      render(
        <DateField
          value="2024-01-15"
          onChange={vi.fn()}
        />
      );
      expect(screen.getByLabelText(t("payments.form.date"))).toHaveAttribute(
        "type",
        "date"
      );
    });
  });

  describe("エラー表示", () => {
    it("エラーがある場合はエラーメッセージを表示する", () => {
      render(
        <DateField
          value="2024-01-15"
          onChange={vi.fn()}
          error="未来の日付は選択できません"
        />
      );
      expect(screen.getByText("未来の日付は選択できません")).toBeInTheDocument();
    });

    it("エラーがある場合は aria-invalid が true になる", () => {
      render(
        <DateField
          value="2024-01-15"
          onChange={vi.fn()}
          error="エラー"
        />
      );
      expect(screen.getByLabelText(t("payments.form.date"))).toHaveAttribute(
        "aria-invalid",
        "true"
      );
    });
  });

  describe("入力", () => {
    it("値を変更すると onChange が呼ばれる", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();

      render(
        <DateField
          value="2024-01-15"
          onChange={onChange}
        />
      );

      const input = screen.getByLabelText(t("payments.form.date"));
      await user.clear(input);
      await user.type(input, "2024-01-20");

      expect(onChange).toHaveBeenCalled();
    });

    it("value が反映される", () => {
      render(
        <DateField
          value="2024-01-15"
          onChange={vi.fn()}
        />
      );

      expect(screen.getByLabelText(t("payments.form.date"))).toHaveValue("2024-01-15");
    });
  });
});
