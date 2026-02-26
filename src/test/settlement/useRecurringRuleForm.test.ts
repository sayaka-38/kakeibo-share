import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useRecurringRuleForm } from "@/app/(protected)/groups/[id]/recurring-rules/useRecurringRuleForm";

vi.mock("@/lib/i18n", () => ({
  t: (key: string) => key,
}));

const mockMembers = [
  {
    id: "user-1",
    display_name: "Alice",
    email: "alice@test.com",
    avatar_url: null,
    is_demo: false,
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
  },
  {
    id: "user-2",
    display_name: "Bob",
    email: "bob@test.com",
    avatar_url: null,
    is_demo: false,
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
  },
];

const mockCategories = [
  { id: "cat-1", name: "食費", icon: "🍽", color: null, is_default: true, group_id: null },
];

const baseArgs = {
  groupId: "group-1",
  members: mockMembers,
  categories: mockCategories,
  currentUserId: "user-1",
  editingRule: null as null,
  onClose: vi.fn(),
  onCreated: vi.fn(),
  onUpdated: vi.fn(),
};

describe("useRecurringRuleForm — 初期値", () => {
  it("新規作成モード: isEditMode=false", () => {
    const { result } = renderHook(() => useRecurringRuleForm(baseArgs));
    expect(result.current.isEditMode).toBe(false);
  });

  it("editingRule がある場合: isEditMode=true / description・amount が初期値に反映される", () => {
    const editingRule = {
      id: "rule-1",
      group_id: "group-1",
      description: "家賃",
      default_amount: 50000,
      is_variable: false,
      day_of_month: 1,
      default_payer_id: "user-1",
      split_type: "equal" as const,
      interval_months: 1,
      start_date: "2026-01-01",
      end_date: null,
      category_id: null,
      is_active: true,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      category: null,
      default_payer: null,
      splits: [],
    };
    const { result } = renderHook(() =>
      useRecurringRuleForm({ ...baseArgs, editingRule })
    );
    expect(result.current.isEditMode).toBe(true);
    expect(result.current.description).toBe("家賃");
    expect(result.current.amount).toBe("50000");
  });

  it("2人均等: percentageTotal = 100", () => {
    const { result } = renderHook(() => useRecurringRuleForm(baseArgs));
    expect(result.current.percentageTotal).toBe(100);
  });

  it("intervalMonths のデフォルトは '1'", () => {
    const { result } = renderHook(() => useRecurringRuleForm(baseArgs));
    expect(result.current.intervalMonths).toBe("1");
  });

  it("splitType のデフォルトは 'equal'", () => {
    const { result } = renderHook(() => useRecurringRuleForm(baseArgs));
    expect(result.current.splitType).toBe("equal");
  });

  it("isVariable のデフォルトは false", () => {
    const { result } = renderHook(() => useRecurringRuleForm(baseArgs));
    expect(result.current.isVariable).toBe(false);
  });
});

describe("useRecurringRuleForm — 3人均等パーセンテージ", () => {
  it("3人均等（100÷3）で端数は最後の人に加算され合計100", () => {
    const threeMembers = [
      ...mockMembers,
      {
        id: "user-3",
        display_name: "Carol",
        email: "carol@test.com",
        avatar_url: null,
        is_demo: false,
        created_at: "2026-01-01",
        updated_at: "2026-01-01",
      },
    ];
    const { result } = renderHook(() =>
      useRecurringRuleForm({ ...baseArgs, members: threeMembers })
    );
    expect(result.current.percentageTotal).toBe(100);
    const values = Object.values(result.current.percentages).map(Number);
    expect(values.reduce((s, v) => s + v, 0)).toBe(100);
  });
});
