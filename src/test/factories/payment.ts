/**
 * 支払いのテストファクトリ
 *
 * 統一されたデフォルト値を持つ payment モックを生成する。
 */

type MockPaymentSplit = {
  user_id: string;
  amount: number;
};

export type MockPayment = {
  id: string;
  description: string;
  category_id: string | null;
  amount: number;
  payer_id: string;
  payment_date: string;
  created_at: string;
  payment_splits: MockPaymentSplit[];
  split_type?: string;
};

const DEFAULTS: MockPayment = {
  id: "payment-1",
  description: "テスト支払い",
  category_id: null,
  amount: 1000,
  payer_id: "user-1",
  payment_date: "2026-01-15",
  created_at: "2026-01-15T10:00:00Z",
  payment_splits: [],
  split_type: "equal",
};

/**
 * MockPayment モックを生成する
 * @param overrides - デフォルト値を上書きするフィールド
 */
export function createMockPayment(
  overrides: Partial<MockPayment> = {}
): MockPayment {
  return { ...DEFAULTS, ...overrides };
}
