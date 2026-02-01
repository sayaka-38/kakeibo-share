/**
 * 残高計算ロジック（エクセル方式）
 *
 * 計算方法:
 * 1. 全支払いの合計を算出
 * 2. メンバー数で割って1人あたり負担額を計算（切り捨て）
 * 3. 残高 = 支払った金額 - 負担額
 *
 * 残高の意味:
 * - 残高 > 0: 他メンバーからお金をもらう権利がある
 * - 残高 < 0: 他メンバーにお金を払う必要がある
 *
 * 端数処理:
 * - 各支払いごとではなく、全支払い合計後に1回だけ切り捨て
 * - これにより誤差の累積を防ぐ（エクセル運用と同じ方式）
 */

/** メンバー情報 */
export type Member = {
  id: string;
  displayName: string;
};

/** 支払い情報 */
export type Payment = {
  id: string;
  payerId: string;
  amount: number;
  splits?: { userId: string; amount: number }[];
};

/** 残高情報 */
export type Balance = {
  memberId: string;
  displayName: string;
  /** 支払った金額の合計 */
  totalPaid: number;
  /** 負担すべき金額（全支払い合計 ÷ メンバー数、切り捨て） */
  totalOwed: number;
  /** 残高（totalPaid - totalOwed） */
  balance: number;
};

/**
 * メンバーの残高を計算する
 *
 * splits参照方式: 各支払いのsplitsが存在する場合はそれを使用し、
 * 存在しない場合はフォールバックとして均等割りで計算する。
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

  const hasSplits = payments.some((p) => p.splits && p.splits.length > 0);

  if (!hasSplits) {
    // フォールバック: splitsが無い場合は従来のエクセル方式
    return calculateBalancesLegacy(members, payments);
  }

  // splits参照方式
  // 1. 各メンバーの支払い合計を計算
  const paidByMember = new Map<string, number>();
  const owedByMember = new Map<string, number>();
  for (const member of members) {
    paidByMember.set(member.id, 0);
    owedByMember.set(member.id, 0);
  }

  for (const payment of payments) {
    const current = paidByMember.get(payment.payerId) ?? 0;
    paidByMember.set(payment.payerId, current + payment.amount);

    if (payment.splits && payment.splits.length > 0) {
      // splits参照: 各splitのamountをowedに加算
      for (const split of payment.splits) {
        const currentOwed = owedByMember.get(split.userId) ?? 0;
        owedByMember.set(split.userId, currentOwed + split.amount);
      }
    } else {
      // フォールバック: 均等割り
      const perPerson = Math.floor(payment.amount / members.length);
      for (const member of members) {
        const currentOwed = owedByMember.get(member.id) ?? 0;
        owedByMember.set(member.id, currentOwed + perPerson);
      }
    }
  }

  // 2. 残高を計算
  return members.map((member) => {
    const totalPaid = paidByMember.get(member.id) ?? 0;
    const totalOwed = owedByMember.get(member.id) ?? 0;
    return {
      memberId: member.id,
      displayName: member.displayName,
      totalPaid,
      totalOwed,
      balance: totalPaid - totalOwed,
    };
  });
}

/**
 * レガシー残高計算（エクセル方式: 全支払い合計後に1回だけ切り捨て）
 */
function calculateBalancesLegacy(
  members: Member[],
  payments: Payment[]
): Balance[] {
  // 1. 全支払いの合計を算出
  const totalExpenses = payments.reduce((sum, p) => sum + p.amount, 0);

  // 2. 1人あたりの負担額を計算（切り捨て）
  const perPersonOwed = Math.floor(totalExpenses / members.length);

  // 3. 各メンバーの支払い合計を計算
  const paidByMember = new Map<string, number>();
  for (const member of members) {
    paidByMember.set(member.id, 0);
  }
  for (const payment of payments) {
    const current = paidByMember.get(payment.payerId) ?? 0;
    paidByMember.set(payment.payerId, current + payment.amount);
  }

  // 4. 残高を計算
  return members.map((member) => {
    const totalPaid = paidByMember.get(member.id) ?? 0;
    return {
      memberId: member.id,
      displayName: member.displayName,
      totalPaid,
      totalOwed: perPersonOwed,
      balance: totalPaid - perPersonOwed,
    };
  });
}
