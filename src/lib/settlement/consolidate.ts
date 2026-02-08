import type { NetTransfer } from "@/types/database";

/**
 * メンバーごとの収支バランスから送金指示を導出（グリーディマッチング）
 */
export type MemberBalance = {
  id: string;
  name: string;
  paid: number;
  owed: number;
  balance: number; // paid - owed（プラスならもらう、マイナスなら支払う）
};

/** 債務者と債権者をグリーディマッチングで送金指示に変換（内部共通ロジック） */
function greedyMatch(
  debtors: { id: string; name: string; amount: number }[],
  creditors: { id: string; name: string; amount: number }[]
): NetTransfer[] {
  const result: NetTransfer[] = [];
  let dIdx = 0;
  let cIdx = 0;

  while (dIdx < debtors.length && cIdx < creditors.length) {
    const settleAmount = Math.min(debtors[dIdx].amount, creditors[cIdx].amount);

    if (settleAmount > 0) {
      result.push({
        from_id: debtors[dIdx].id,
        from_name: debtors[dIdx].name,
        to_id: creditors[cIdx].id,
        to_name: creditors[cIdx].name,
        amount: settleAmount,
      });
    }

    debtors[dIdx].amount -= settleAmount;
    creditors[cIdx].amount -= settleAmount;

    if (debtors[dIdx].amount <= 0) dIdx++;
    if (creditors[cIdx].amount <= 0) cIdx++;
  }

  return result;
}

export function balancesToTransfers(
  balances: MemberBalance[]
): NetTransfer[] {
  const debtors = balances
    .filter((b) => b.balance < 0)
    .map((b) => ({ id: b.id, name: b.name, amount: -b.balance }));
  const creditors = balances
    .filter((b) => b.balance > 0)
    .map((b) => ({ id: b.id, name: b.name, amount: b.balance }));

  return greedyMatch(debtors, creditors);
}

/**
 * 特定ユーザーの送金/受取残高を net_transfers から計算
 * プラス = もらう側、マイナス = 払う側
 */
export function calculateMyTransferBalance(
  transfers: NetTransfer[],
  userId: string
): number {
  let balance = 0;
  for (const t of transfers) {
    if (t.to_id === userId) balance += t.amount;
    if (t.from_id === userId) balance -= t.amount;
  }
  return balance;
}

/**
 * 相殺統合: 複数セッションの net_transfers を合算して最適な振込指示を生成
 */
export function consolidateTransfers(
  allTransfers: NetTransfer[][],
  memberNames: Map<string, string>
): { transfers: NetTransfer[]; isZero: boolean } {
  const balanceMap = new Map<string, number>();

  for (const transfers of allTransfers) {
    for (const t of transfers) {
      balanceMap.set(t.from_id, (balanceMap.get(t.from_id) || 0) - t.amount);
      balanceMap.set(t.to_id, (balanceMap.get(t.to_id) || 0) + t.amount);
    }
  }

  const debtors: { id: string; name: string; amount: number }[] = [];
  const creditors: { id: string; name: string; amount: number }[] = [];

  for (const [memberId, balance] of balanceMap) {
    if (balance < 0) {
      debtors.push({ id: memberId, name: memberNames.get(memberId) || "Unknown", amount: -balance });
    } else if (balance > 0) {
      creditors.push({ id: memberId, name: memberNames.get(memberId) || "Unknown", amount: balance });
    }
  }

  if (debtors.length === 0 && creditors.length === 0) {
    return { transfers: [], isZero: true };
  }

  return { transfers: greedyMatch(debtors, creditors), isZero: false };
}
