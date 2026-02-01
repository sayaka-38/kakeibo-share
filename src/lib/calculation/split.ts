/**
 * 割り勘計算ロジック
 *
 * 支払いを複数メンバーに分割する計算を行う
 * - 均等割り: 全員同じ金額（端数は切り捨て）
 * - カスタム割り: 各メンバーに個別の金額を指定
 */

/**
 * 分割結果の型（DB保存用）
 */
export type SplitResult = {
  payment_id: string;
  user_id: string;
  amount: number;
};

/**
 * 均等割り計算の入力
 */
export type SplitInput = {
  paymentId: string;
  totalAmount: number;
  memberIds: string[];
  payerId?: string; // 端数吸収者（指定時は remainder を payer に加算）
};

/**
 * カスタム割り計算の入力
 */
export type CustomSplitInput = {
  paymentId: string;
  customAmounts: { [userId: string]: string };
};

/**
 * 代理購入割り計算の入力
 */
export type ProxySplitInput = {
  paymentId: string;
  totalAmount: number;
  payerId: string;
  beneficiaryId: string;
  allMemberIds: string[];
};

/**
 * 均等割り計算
 *
 * 金額をメンバー数で割り、各自の負担額を計算する
 * 端数は切り捨て（清算時に調整される）
 *
 * @param input - 支払いID、総額、メンバーIDリスト
 * @returns 各メンバーの分割結果
 */
export function calculateEqualSplit(input: SplitInput): SplitResult[] {
  const { paymentId, totalAmount, memberIds, payerId } = input;

  // メンバーがいない場合は空配列
  if (memberIds.length === 0) {
    return [];
  }

  // 負の金額または0の場合は全員0円
  if (totalAmount <= 0) {
    return memberIds.map((userId) => ({
      payment_id: paymentId,
      user_id: userId,
      amount: 0,
    }));
  }

  // 均等割り（端数切り捨て）
  const perPerson = Math.floor(totalAmount / memberIds.length);
  const remainder = payerId ? totalAmount - perPerson * memberIds.length : 0;

  return memberIds.map((userId) => ({
    payment_id: paymentId,
    user_id: userId,
    amount: payerId && userId === payerId ? perPerson + remainder : perPerson,
  }));
}

/**
 * カスタム割り計算
 *
 * 各メンバーに指定された金額を設定する
 * 空文字列のメンバーはスキップ、不正な値は0として扱う
 *
 * @param input - 支払いID、カスタム金額マップ
 * @returns 各メンバーの分割結果
 */
export function calculateCustomSplits(input: CustomSplitInput): SplitResult[] {
  const { paymentId, customAmounts } = input;

  const results: SplitResult[] = [];

  for (const [userId, amountStr] of Object.entries(customAmounts)) {
    // 空文字列はスキップ
    if (amountStr === "") {
      continue;
    }

    // 文字列をパースして整数に変換
    const parsed = parseFloat(amountStr);
    const amount = isNaN(parsed) || parsed < 0 ? 0 : Math.floor(parsed);

    results.push({
      payment_id: paymentId,
      user_id: userId,
      amount,
    });
  }

  return results;
}

/**
 * 代理購入割り計算
 *
 * 支払者が全額を立て替え、受益者に100%を割り振る。
 * payer: 0, beneficiary: totalAmount, others: 0
 *
 * @param input - 支払いID、総額、支払者、受益者、全メンバー
 * @returns 各メンバーの分割結果
 */
export function calculateProxySplit(input: ProxySplitInput): SplitResult[] {
  const { paymentId, totalAmount, payerId, beneficiaryId, allMemberIds } = input;

  if (beneficiaryId === payerId) {
    throw new Error("Beneficiary must be different from payer");
  }

  if (!allMemberIds.includes(beneficiaryId)) {
    throw new Error("Beneficiary must be a group member");
  }

  return allMemberIds.map((userId) => ({
    payment_id: paymentId,
    user_id: userId,
    amount: userId === beneficiaryId ? totalAmount : 0,
  }));
}
