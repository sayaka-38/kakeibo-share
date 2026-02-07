import type { NetTransfer } from "@/types/database";

/**
 * 相殺統合: 複数セッションの net_transfers を合算して最適な振込指示を生成
 *
 * 各メンバーの残高を計算し、債務者と債権者をマッチングして
 * 最小限の振込指示にまとめる。
 */
export function consolidateTransfers(
  allTransfers: NetTransfer[][],
  memberNames: Map<string, string>
): { transfers: NetTransfer[]; isZero: boolean } {
  // 各メンバーの残高を計算（+ = もらう側、- = 払う側）
  const balanceMap = new Map<string, number>();

  for (const transfers of allTransfers) {
    for (const t of transfers) {
      balanceMap.set(t.from_id, (balanceMap.get(t.from_id) || 0) - t.amount);
      balanceMap.set(t.to_id, (balanceMap.get(t.to_id) || 0) + t.amount);
    }
  }

  // 債務者と債権者に分類
  const debtors: { id: string; name: string; amount: number }[] = [];
  const creditors: { id: string; name: string; amount: number }[] = [];

  for (const [memberId, balance] of balanceMap) {
    if (balance < 0) {
      debtors.push({
        id: memberId,
        name: memberNames.get(memberId) || "Unknown",
        amount: -balance,
      });
    } else if (balance > 0) {
      creditors.push({
        id: memberId,
        name: memberNames.get(memberId) || "Unknown",
        amount: balance,
      });
    }
  }

  if (debtors.length === 0 && creditors.length === 0) {
    return { transfers: [], isZero: true };
  }

  // マッチングで最適な振込指示を生成
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

  return { transfers: result, isZero: false };
}
