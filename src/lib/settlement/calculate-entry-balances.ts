import type { EntryData } from "@/types/domain";
import { isEqualSplit, isCustomSplit } from "@/lib/domain/settlement-utils";

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
 * 清算エントリから各メンバーの収支を計算する
 *
 * 【計算アルゴリズム】
 *
 * Group A（均等割り勘）: split_type === "equal" または split_type が未設定のエントリ
 *   - S_A = Group A の合計金額
 *   - 全員共通の案分額 = Math.floor(S_A / 人数)
 *   - 余り（S_A % 人数）は最大 payer の負担に1回だけ加算
 *     → sum(Group A の owed) = S_A を保証
 *   ※ エントリに splits データが存在しても完全に無視する（split_type ラベルのみで判定）
 *
 * Group B（手動調整・立替）: split_type === "custom" のエントリ
 *   - DB に保存された splits.amount の値をそのまま各人の負担額として加算する
 *   - 比率計算・正規化は一切行わない
 *   - 手動入力時は EntryEditModal でバリデーション済み（sum(splits) = actual_amount）
 *
 * @param entries - filled 状態のエントリリスト
 * @param members - グループメンバーリスト
 */
export function calculateEntryBalances(
  entries: EntryData[],
  members: EntryMember[]
): EntryBalance[] {
  if (members.length === 0) return [];

  // split_type ラベルのみで分類（splits データの有無は参照しない）
  const groupA = entries.filter((e) => isEqualSplit(e.split_type));
  const groupB = entries.filter((e) => isCustomSplit(e.split_type));

  // ──────────────────────────────────────────────
  // 全エントリの支払い合計（最大 payer 特定）
  // ──────────────────────────────────────────────
  const paidByMember = new Map<string, number>();
  for (const m of members) paidByMember.set(m.id, 0);
  for (const e of entries) {
    const curr = paidByMember.get(e.payer_id) ?? 0;
    paidByMember.set(e.payer_id, curr + (e.actual_amount ?? 0));
  }

  let maxPayerId = members[0].id;
  let maxPaid = -1;
  for (const m of members) {
    const p = paidByMember.get(m.id) ?? 0;
    if (p > maxPaid) {
      maxPaid = p;
      maxPayerId = m.id;
    }
  }

  // ──────────────────────────────────────────────
  // Group A の計算（一括集計 → 1回割り → 余りを最大 payer へ）
  // ──────────────────────────────────────────────
  const totalA = groupA.reduce((sum, e) => sum + (e.actual_amount ?? 0), 0);
  const perPersonA = Math.floor(totalA / members.length);
  const remainderA = totalA % members.length;

  // ──────────────────────────────────────────────
  // Group B の計算（splits.amount をそのまま加算）
  // ──────────────────────────────────────────────
  const owedBByMember = new Map<string, number>();
  for (const m of members) owedBByMember.set(m.id, 0);

  for (const entry of groupB) {
    if (!entry.splits || entry.splits.length === 0) continue;
    for (const s of entry.splits) {
      const curr = owedBByMember.get(s.user_id) ?? 0;
      owedBByMember.set(s.user_id, curr + s.amount);
    }
  }

  // ──────────────────────────────────────────────
  // 最終合算
  // ──────────────────────────────────────────────
  return members.map((member) => {
    const paid = paidByMember.get(member.id) ?? 0;
    const owedA =
      perPersonA + (remainderA > 0 && member.id === maxPayerId ? remainderA : 0);
    const owedB = owedBByMember.get(member.id) ?? 0;
    const owed = owedA + owedB;

    return {
      id: member.id,
      name: member.name,
      paid,
      owed,
      balance: paid - owed,
    };
  });
}
