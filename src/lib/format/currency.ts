/**
 * 金額を日本円形式でフォーマットする
 *
 * @param amount - 金額（数値）
 * @param options - オプション
 * @param options.showSign - true の場合、正の値に "+" を付与（清算画面用）
 * @returns フォーマットされた文字列（例: "¥1,234"）
 */
export function formatCurrency(
  amount: number,
  options?: { showSign?: boolean }
): string {
  if (!Number.isFinite(amount)) {
    return "¥0";
  }

  const rounded = Math.round(amount);
  const abs = Math.abs(rounded);
  const formatted = abs.toLocaleString("ja-JP");

  if (options?.showSign) {
    if (rounded > 0) return `+¥${formatted}`;
    if (rounded < 0) return `-¥${formatted}`;
    return `¥${formatted}`;
  }

  if (rounded < 0) {
    return `¥-${formatted}`;
  }

  return `¥${formatted}`;
}
