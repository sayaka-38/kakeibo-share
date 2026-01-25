/**
 * 清算金額の端数処理ユーティリティ
 *
 * 設計方針:
 * - 端数は「切り捨て」（floor）
 * - 余りは「未清算残高」として次回に持ち越し
 */

/**
 * 均等割りの結果
 */
export type SplitResult = {
  /** 1人あたりの金額（切り捨て後） */
  amountPerPerson: number;
  /** 未清算残高（余り） */
  remainder: number;
  /** 実際に清算される合計金額 (amountPerPerson * 人数) */
  total: number;
};

/**
 * 金額を円未満切り捨て
 *
 * @param amount - 金額（小数可）
 * @returns 切り捨て後の整数金額
 * @throws 負の金額、NaN、Infinity の場合
 */
export function floorToYen(amount: number): number {
  if (!Number.isFinite(amount)) {
    throw new Error("有効な数値ではありません");
  }
  if (amount < 0) {
    throw new Error("金額は0以上である必要があります");
  }
  return Math.floor(amount);
}

/**
 * 金額を均等に割り、余りを返す
 *
 * @param amount - 総額
 * @param count - 人数
 * @returns SplitResult（1人あたり金額、余り、清算合計）
 * @throws 不正な入力の場合
 */
export function splitEqually(amount: number, count: number): SplitResult {
  if (!Number.isFinite(amount)) {
    throw new Error("有効な数値ではありません");
  }
  if (amount < 0) {
    throw new Error("金額は0以上である必要があります");
  }
  if (!Number.isInteger(count)) {
    throw new Error("人数は整数である必要があります");
  }
  if (count < 1) {
    throw new Error("人数は1以上である必要があります");
  }

  const amountPerPerson = Math.floor(amount / count);
  const total = amountPerPerson * count;
  const remainder = amount - total;

  return {
    amountPerPerson,
    remainder,
    total,
  };
}
