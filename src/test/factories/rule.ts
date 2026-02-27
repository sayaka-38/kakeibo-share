/**
 * 固定費ルールのテストファクトリ
 */

export type MockRuleSplit = {
  user_id: string;
  amount: number | null;
  percentage: number | null;
};

export type MockRule = {
  id: string;
  description: string;
  category_id: string | null;
  default_amount: number | null;
  default_payer_id: string;
  day_of_month: number;
  interval_months: number;
  split_type: string;
  is_active: boolean;
  start_date: string;
  end_date?: string | null;
  created_at: string;
  splits: MockRuleSplit[];
};

const DEFAULTS: MockRule = {
  id: "rule-1",
  description: "テスト固定費",
  category_id: null,
  default_amount: 10000,
  default_payer_id: "user-1",
  day_of_month: 1,
  interval_months: 1,
  split_type: "equal",
  is_active: true,
  start_date: "2026-01-01",
  end_date: null,
  created_at: "2026-01-01T00:00:00Z",
  splits: [],
};

/**
 * MockRule モックを生成する
 */
export function createMockRule(overrides: Partial<MockRule> = {}): MockRule {
  return { ...DEFAULTS, ...overrides };
}
