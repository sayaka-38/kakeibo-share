/**
 * 清算エントリの split_type 判定ユーティリティ
 *
 * 同じ論理述語が settlement lib 複数ファイルに散在していたため集約。
 */

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
