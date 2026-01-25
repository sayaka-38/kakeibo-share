/**
 * 残高計算ロジック
 *
 * 残高 = 支払った金額 - 負担すべき金額
 * - 残高 > 0: 他メンバーからお金をもらう権利がある
 * - 残高 < 0: 他メンバーにお金を払う必要がある
 */

/** メンバー情報 */
export type Member = {
  id: string;
  displayName: string;
};

/** 割り勘情報 */
export type PaymentSplit = {
  userId: string;
  amount: number;
};

/** 支払い情報 */
export type Payment = {
  id: string;
  payerId: string;
  amount: number;
  splits: PaymentSplit[];
};

/** 残高情報 */
export type Balance = {
  memberId: string;
  displayName: string;
  /** 支払った金額の合計 */
  totalPaid: number;
  /** 負担すべき金額の合計 */
  totalOwed: number;
  /** 残高（totalPaid - totalOwed） */
  balance: number;
};

/**
 * メンバーの残高を計算する
 *
 * @param members - グループメンバーのリスト
 * @param payments - 支払いのリスト
 * @returns 各メンバーの残高情報
 */
export function calculateBalances(
  members: Member[],
  payments: Payment[]
): Balance[] {
  if (members.length === 0) {
    return [];
  }

  // メンバーIDをキーにした残高マップを初期化
  const balanceMap = new Map<string, Balance>();

  for (const member of members) {
    balanceMap.set(member.id, {
      memberId: member.id,
      displayName: member.displayName,
      totalPaid: 0,
      totalOwed: 0,
      balance: 0,
    });
  }

  // 支払いを集計
  for (const payment of payments) {
    // 支払者の totalPaid を加算（メンバーに存在する場合のみ）
    const payerBalance = balanceMap.get(payment.payerId);
    if (payerBalance) {
      payerBalance.totalPaid += payment.amount;
    }

    // 各 split の totalOwed を加算
    for (const split of payment.splits) {
      const memberBalance = balanceMap.get(split.userId);
      if (memberBalance) {
        memberBalance.totalOwed += split.amount;
      }
    }
  }

  // 残高を計算
  for (const balance of balanceMap.values()) {
    balance.balance = balance.totalPaid - balance.totalOwed;
  }

  // メンバー順で返す
  return members.map((m) => balanceMap.get(m.id)!);
}
