import type { EntryData } from "@/types/domain";

export type EntryMember = {
  id: string;
  name: string;
};

export type EntryBalance = {
  id: string;
  name: string;
  paid: number;
  owed: number;
  balance: number;
};

/**
 * 清算エントリから各メンバーの収支を計算する（金融機関レベルの端数処理）
 *
 * 計算ルール:
 * 1. 内訳指定なし（splits なし）のエントリを集計: 合計 S
 * 2. 各自の案分額 = Math.floor(S / 人数)（全員共通）
 * 3. 余り（S % 人数）は最も多く支払ったメンバー（最大 payer）の負担に加算
 *    → sum(owed) = totalExpense を保証する
 * 4. 個別内訳（Proxy等）の splits 金額をそのまま各自の負担に加算
 *
 * @param entries - filled 状態のエントリリスト
 * @param members - グループメンバーリスト
 */
export function calculateEntryBalances(
  entries: EntryData[],
  members: EntryMember[]
): EntryBalance[] {
  if (members.length === 0) return [];

  // Step 1: splits なしエントリを一括集計（エントリごと切り捨てによる誤差累積を防ぐ）
  const noSplitEntries = entries.filter((e) => !e.splits || e.splits.length === 0);
  const noSplitTotal = noSplitEntries.reduce((sum, e) => sum + (e.actual_amount ?? 0), 0);

  // Step 2: 一括案分（全員同額・切り捨て）
  const noSplitPerPerson = Math.floor(noSplitTotal / members.length);

  // Step 3: 余りを最大 payer へ加算（sum(owed) = S を保証）
  const remainder = noSplitTotal % members.length;

  // 全エントリの支払い合計を計算（最大 payer 特定に使用）
  const paidByMember = new Map<string, number>();
  for (const m of members) paidByMember.set(m.id, 0);
  for (const e of entries) {
    const curr = paidByMember.get(e.payer_id) ?? 0;
    paidByMember.set(e.payer_id, curr + (e.actual_amount ?? 0));
  }

  // 最大 payer を特定（同額の場合はリスト先頭のメンバー）
  let maxPayerId = members[0].id;
  let maxPaid = paidByMember.get(members[0].id) ?? 0;
  for (const m of members) {
    const p = paidByMember.get(m.id) ?? 0;
    if (p > maxPaid) {
      maxPaid = p;
      maxPayerId = m.id;
    }
  }

  // Step 4: 各メンバーの収支を算出
  const splitEntries = entries.filter((e) => e.splits && e.splits.length > 0);

  return members.map((member) => {
    const paid = paidByMember.get(member.id) ?? 0;

    // splits あり（Proxy等）: 自分宛の splits 合計をそのまま加算
    const owedFromSplits = splitEntries.reduce((sum, e) => {
      const mySplit = e.splits!.find((s) => s.user_id === member.id);
      return sum + (mySplit ? mySplit.amount : 0);
    }, 0);

    // 余りは最大 payer のみ加算（1円以下なので影響は最小限）
    const remainderShare = remainder > 0 && member.id === maxPayerId ? remainder : 0;

    const owed = noSplitPerPerson + remainderShare + owedFromSplits;

    return {
      id: member.id,
      name: member.name,
      paid,
      owed,
      balance: paid - owed,
    };
  });
}
