/**
 * RecurringRuleForm - interval_months UI テスト
 *
 * 発生間隔セレクトの表示と値の送信を検証。
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import RecurringRuleForm from "@/app/(protected)/groups/[id]/recurring-rules/RecurringRuleForm";

// i18n mock
vi.mock("@/lib/i18n", () => ({
  t: (key: string, params?: Record<string, string>) => {
    const translations: Record<string, string> = {
      "recurringRules.addRule": "ルールを追加",
      "recurringRules.editRule": "ルールを編集",
      "recurringRules.form.description": "項目名",
      "recurringRules.form.descriptionPlaceholder": "例: 家賃",
      "recurringRules.form.category": "カテゴリ",
      "recurringRules.form.selectCategory": "カテゴリを選択",
      "recurringRules.isVariable": "金額タイプ",
      "recurringRules.fixedAmount": "固定額",
      "recurringRules.variableAmount": "変動",
      "recurringRules.variableAmountHint": "毎回金額を入力",
      "recurringRules.dayOfMonth": "発生日",
      "recurringRules.form.selectDay": "日を選択",
      "recurringRules.dayOfMonthEndHint": "末日",
      "recurringRules.interval": "発生間隔",
      "recurringRules.intervalMonthly": "毎月",
      "recurringRules.intervalEveryNMonths": `${params?.n}ヶ月ごと`,
      "recurringRules.defaultPayer": "デフォルト支払者",
      "recurringRules.form.selectPayer": "支払者を選択",
      "recurringRules.splitType": "分割方法",
      "recurringRules.splitEqual": "均等",
      "recurringRules.splitCustom": "カスタム（%指定）",
      "recurringRules.splitPercentage": "負担割合",
      "recurringRules.percentageTotal": `合計: ${params?.total}%`,
      "recurringRules.percentageMismatch": "合計が100%になるように",
      "recurringRules.form.save": "保存",
      "recurringRules.form.saving": "保存中...",
      "recurringRules.form.cancel": "キャンセル",
      "recurringRules.validation.descriptionRequired": "項目名を入力してください",
      "recurringRules.validation.amountRequired": "金額が必要です",
      "recurringRules.validation.dayRequired": "発生日を選択してください",
      "recurringRules.validation.payerRequired": "支払者を選択してください",
      "recurringRules.errors.createFailed": "作成に失敗しました",
      "recurringRules.errors.updateFailed": "更新に失敗しました",
    };
    return translations[key] || key;
  },
}));

// AmountFieldWithKeypad mock
vi.mock("@/components/payment-form/fields/AmountFieldWithKeypad", () => ({
  AmountFieldWithKeypad: ({ id, value, onChange, error }: {
    id: string;
    value: string;
    onChange: (v: string) => void;
    error?: string;
  }) => (
    <div>
      <input
        id={id}
        data-testid="amount-field"
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {error && <span role="alert">{error}</span>}
    </div>
  ),
}));

const mockMembers = [
  { id: "user-1", display_name: "Alice", email: "alice@test.com", avatar_url: null, is_demo: false, created_at: "2026-01-01", updated_at: "2026-01-01" },
  { id: "user-2", display_name: "Bob", email: "bob@test.com", avatar_url: null, is_demo: false, created_at: "2026-01-01", updated_at: "2026-01-01" },
];

const mockCategories = [
  { id: "cat-1", name: "食費", icon: "🍽", color: null, is_default: true, group_id: null },
];

describe("RecurringRuleForm - interval_months", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("発生間隔セレクトが表示される", () => {
    render(
      <RecurringRuleForm
        groupId="group-1"
        members={mockMembers}
        categories={mockCategories}
        currentUserId="user-1"
        editingRule={null}
        onClose={vi.fn()}
        onCreated={vi.fn()}
        onUpdated={vi.fn()}
      />
    );

    expect(screen.getByLabelText("発生間隔")).toBeInTheDocument();
  });

  it("デフォルト値は「毎月」（1）", () => {
    render(
      <RecurringRuleForm
        groupId="group-1"
        members={mockMembers}
        categories={mockCategories}
        currentUserId="user-1"
        editingRule={null}
        onClose={vi.fn()}
        onCreated={vi.fn()}
        onUpdated={vi.fn()}
      />
    );

    const select = screen.getByLabelText("発生間隔") as HTMLSelectElement;
    expect(select.value).toBe("1");
  });

  it("毎月/2ヶ月ごと/3ヶ月ごと/6ヶ月ごと/12ヶ月ごとの選択肢がある", () => {
    render(
      <RecurringRuleForm
        groupId="group-1"
        members={mockMembers}
        categories={mockCategories}
        currentUserId="user-1"
        editingRule={null}
        onClose={vi.fn()}
        onCreated={vi.fn()}
        onUpdated={vi.fn()}
      />
    );

    const select = screen.getByLabelText("発生間隔") as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => o.value);
    expect(options).toEqual(["1", "2", "3", "6", "12"]);
  });

  it("間隔を変更できる", () => {
    render(
      <RecurringRuleForm
        groupId="group-1"
        members={mockMembers}
        categories={mockCategories}
        currentUserId="user-1"
        editingRule={null}
        onClose={vi.fn()}
        onCreated={vi.fn()}
        onUpdated={vi.fn()}
      />
    );

    const select = screen.getByLabelText("発生間隔") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "2" } });
    expect(select.value).toBe("2");
  });

  it("編集モードで既存のinterval_monthsが初期値として設定される", () => {
    const editingRule = {
      id: "rule-1",
      group_id: "group-1",
      category_id: "cat-1",
      description: "NHK受信料",
      default_amount: 2000,
      is_variable: false,
      day_of_month: 10,
      default_payer_id: "user-1",
      split_type: "equal",
      is_active: true,
      interval_months: 2,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      category: { id: "cat-1", name: "食費", icon: "🍽", color: null },
      default_payer: { id: "user-1", display_name: "Alice", email: "alice@test.com" },
      splits: [],
    };

    render(
      <RecurringRuleForm
        groupId="group-1"
        members={mockMembers}
        categories={mockCategories}
        currentUserId="user-1"
        editingRule={editingRule}
        onClose={vi.fn()}
        onCreated={vi.fn()}
        onUpdated={vi.fn()}
      />
    );

    const select = screen.getByLabelText("発生間隔") as HTMLSelectElement;
    expect(select.value).toBe("2");
  });

  it("送信時にintervalMonthsがリクエストボディに含まれる", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        rule: {
          id: "rule-new",
          group_id: "group-1",
          category_id: null,
          description: "テスト",
          default_amount: 1000,
          is_variable: false,
          day_of_month: 1,
          default_payer_id: "user-1",
          split_type: "equal",
          is_active: true,
          interval_months: 3,
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
        },
      }),
    });
    global.fetch = mockFetch;

    const onCreated = vi.fn();

    render(
      <RecurringRuleForm
        groupId="group-1"
        members={mockMembers}
        categories={mockCategories}
        currentUserId="user-1"
        editingRule={null}
        onClose={vi.fn()}
        onCreated={onCreated}
        onUpdated={vi.fn()}
      />
    );

    // Fill required fields
    fireEvent.change(screen.getByLabelText("項目名"), {
      target: { value: "テスト" },
    });
    fireEvent.change(screen.getByTestId("amount-field"), {
      target: { value: "1000" },
    });
    fireEvent.change(screen.getByLabelText("発生日"), {
      target: { value: "1" },
    });
    fireEvent.change(screen.getByLabelText("発生間隔"), {
      target: { value: "3" },
    });

    // Submit
    fireEvent.click(screen.getByText("保存"));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string);
    expect(body.intervalMonths).toBe(3);
  });
});
