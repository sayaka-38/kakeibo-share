/**
 * 清算エントリの split_type 判定・統計計算ユーティリティ
 *
 * 同じ論理述語が settlement lib 複数ファイルに散在していたため集約。
 */

import type { EntryData, EntryStats } from "@/types/domain";

/** エントリ配列からステータス別統計を計算する純粋関数 */
export function computeEntryStats(entries: EntryData[]): EntryStats {
  return {
    total: entries.length,
    pending: entries.filter((e) => e.status === "pending").length,
    filled: entries.filter((e) => e.status === "filled").length,
    skipped: entries.filter((e) => e.status === "skipped").length,
    totalAmount: entries
      .filter((e) => e.status === "filled")
      .reduce((sum, e) => sum + (e.actual_amount ?? 0), 0),
  };
}

/** split_type が均等割りかどうかを判定 */
export function isEqualSplit(splitType: string | null | undefined): boolean {
  return !splitType || splitType === "equal";
}

/** split_type がカスタム割りかどうかを判定 */
export function isCustomSplit(splitType: string | null | undefined): boolean {
  return splitType === "custom";
}

/**
 * 支払いを清算エントリ変換時の split_type ラベルを決定
 * equal 以外かつ splits が存在する場合のみ "custom"
 */
export function resolveEntrySplitType(
  paymentSplitType: string | null | undefined,
  hasSplits: boolean
): "equal" | "custom" {
  return paymentSplitType !== "equal" && hasSplits ? "custom" : "equal";
}

/** ルールの splits を清算エントリに挿入すべきか判定 */
export function ruleHasCustomSplitsToInsert(
  splitType: string | null | undefined,
  splitsLen: number
): boolean {
  return isCustomSplit(splitType) && splitsLen > 0;
}
