/**
 * 清算提案ロジック（最小回数アルゴリズム）
 *
 * 設計方針:
 * - 端数は「切り捨て」（floor）
 * - 余りは「未清算残高」として次回に持ち越し
 */

import type { Balance } from "./calculate-balances";

/** 清算提案（誰が誰にいくら払うか） */
export type SettlementSuggestion = {
  fromId: string;
  fromName: string;
  toId: string;
  toName: string;
  /** 清算金額（切り捨て後の整数） */
  amount: number;
};

/** 清算提案の結果 */
export type SettlementResult = {
  /** 清算提案リスト */
  settlements: SettlementSuggestion[];
  /** 未清算残高（端数の合計） */
  unsettledRemainder: number;
};

/**
 * 残高から清算提案を生成する
 *
 * アルゴリズム:
 * 1. 債務者（残高 < 0）と債権者（残高 > 0）に分類
 * 2. 債務者を負債が大きい順、債権者を債権が大きい順にソート
 * 3. マッチングして清算額を決定（切り捨て）
 * 4. 残った端数を未清算残高として返す
 *
 * @param balances - 各メンバーの残高情報
 * @returns 清算提案と未清算残高
 */
export function suggestSettlements(balances: Balance[]): SettlementResult {
  if (balances.length <= 1) {
    return { settlements: [], unsettledRemainder: 0 };
  }

  // 作業用にコピー（元データを変更しない）
  const debtors = balances
    .filter((b) => b.balance < 0)
    .map((b) => ({
      id: b.memberId,
      name: b.displayName,
      amount: -b.balance, // 正の値に変換（支払うべき金額）
    }))
    .sort((a, b) => b.amount - a.amount); // 負債が大きい順

  const creditors = balances
    .filter((b) => b.balance > 0)
    .map((b) => ({
      id: b.memberId,
      name: b.displayName,
      amount: b.balance, // もらうべき金額
    }))
    .sort((a, b) => b.amount - a.amount); // 債権が大きい順

  if (debtors.length === 0 || creditors.length === 0) {
    return { settlements: [], unsettledRemainder: 0 };
  }

  const settlements: SettlementSuggestion[] = [];
  let totalCreditorRemainder = 0;

  let i = 0; // debtor index
  let j = 0; // creditor index

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];

    // 清算可能な金額（小さい方）
    const settlementAmount = Math.min(debtor.amount, creditor.amount);

    // 切り捨て
    const flooredAmount = Math.floor(settlementAmount);

    if (flooredAmount > 0) {
      settlements.push({
        fromId: debtor.id,
        fromName: debtor.name,
        toId: creditor.id,
        toName: creditor.name,
        amount: flooredAmount,
      });
    }

    // 端数（切り捨てで失われた分）
    const fraction = settlementAmount - flooredAmount;

    // 残高を更新
    debtor.amount -= settlementAmount;
    creditor.amount -= settlementAmount;

    // 債権者側の端数を記録（未清算残高）
    totalCreditorRemainder += fraction;

    // 残高が0になったら次へ
    if (debtor.amount <= 0.001) i++; // 浮動小数点誤差対策
    if (creditor.amount <= 0.001) j++;
  }

  // 残った債権者の残高も未清算残高に加算
  for (let k = j; k < creditors.length; k++) {
    if (creditors[k].amount > 0.001) {
      totalCreditorRemainder += creditors[k].amount;
    }
  }

  return {
    settlements,
    unsettledRemainder: Math.round(totalCreditorRemainder * 100) / 100, // 小数点2桁で丸め
  };
}
