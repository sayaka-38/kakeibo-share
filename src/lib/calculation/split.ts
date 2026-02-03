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
 * 代理購入かどうかを判定
 *
 * splits のうち支払者の負担額が 0 であれば代理購入とみなす。
 *
 * @param splits - 各メンバーの分割結果
 * @param payerId - 支払者のID
 * @returns 代理購入の場合 true
 */
export function isProxySplit(
  splits: { user_id: string; amount: number }[],
  payerId: string
): boolean {
  return (
    splits.length > 0 &&
    splits.some((s) => s.user_id === payerId && s.amount === 0)
  );
}

/**
 * 代理購入の受益者IDを取得
 *
 * 支払者以外で amount > 0 の最初のメンバーを受益者として返す。
 * 代理購入でない場合や受益者が見つからない場合は null を返す。
 *
 * @param splits - 各メンバーの分割結果
 * @param payerId - 支払者のID
 * @returns 受益者のユーザーID、または null
 */
export function getProxyBeneficiaryId(
  splits: { user_id: string; amount: number }[],
  payerId: string
): string | null {
  if (!isProxySplit(splits, payerId)) return null;
  const beneficiary = splits.find(
    (s) => s.user_id !== payerId && s.amount > 0
  );
  return beneficiary?.user_id ?? null;
}

/**
 * カスタム割り勘かどうかを判定
 *
 * 均等割り・代理購入のいずれでもない場合にカスタム割り勘とみなす。
 * 均等割りの判定: 各メンバーの金額が floor(total/N) または floor(total/N)+remainder に一致するか
 *
 * @param splits - 各メンバーの分割結果
 * @param payerId - 支払者のID
 * @param totalAmount - 支払い総額
 * @returns カスタム割り勘の場合 true
 */
export function isCustomSplit(
  splits: { user_id: string; amount: number }[],
  payerId: string,
  totalAmount: number
): boolean {
  if (splits.length === 0) return false;

  // 代理購入チェック: 支払者の負担が0
  if (isProxySplit(splits, payerId)) return false;

  // 均等割りパターンと比較
  const memberCount = splits.length;
  const perPerson = Math.floor(totalAmount / memberCount);
  const remainder = totalAmount - perPerson * memberCount;

  for (const s of splits) {
    const expected =
      s.user_id === payerId ? perPerson + remainder : perPerson;
    if (s.amount !== expected) return true;
  }

  return false;
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
