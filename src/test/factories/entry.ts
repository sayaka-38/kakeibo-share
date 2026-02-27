/**
 * 清算エントリのテストファクトリ
 *
 * 統一されたデフォルト値を持つ EntryData モックを生成する。
 * テスト固有の値のみ overrides で上書きすること。
 */

import type { EntryData } from "@/types/domain";
import { ENTRY_STATUS, ENTRY_SPLIT_TYPE } from "@/lib/domain/constants";

const DEFAULTS: EntryData = {
  id: "entry-1",
  session_id: "session-1",
  rule_id: null,
  payment_id: null,
  source_payment_id: null,
  entry_type: "manual",
  description: "テストエントリ",
  payer_id: "user-1",
  category_id: null,
  expected_amount: 1000,
  actual_amount: null,
  status: ENTRY_STATUS.PENDING,
  split_type: ENTRY_SPLIT_TYPE.EQUAL,
  payment_date: "2026-01-15",
  filled_by: null,
  filled_at: null,
};

/**
 * EntryData モックを生成する
 * @param overrides - デフォルト値を上書きするフィールド
 */
export function createMockEntry(overrides: Partial<EntryData> = {}): EntryData {
  return { ...DEFAULTS, ...overrides };
}

/** filled ステータスのエントリを生成するショートカット */
export function createFilledEntry(
  overrides: Partial<EntryData> = {}
): EntryData {
  return createMockEntry({
    status: ENTRY_STATUS.FILLED,
    actual_amount: 1000,
    filled_by: "user-1",
    filled_at: "2026-01-15T10:00:00Z",
    ...overrides,
  });
}

/** skipped ステータスのエントリを生成するショートカット */
export function createSkippedEntry(
  overrides: Partial<EntryData> = {}
): EntryData {
  return createMockEntry({
    status: ENTRY_STATUS.SKIPPED,
    actual_amount: null,
    ...overrides,
  });
}
