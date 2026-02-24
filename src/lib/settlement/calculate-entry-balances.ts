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
 * 【計算アルゴリズム】
 *
 * Group A（均等割り勘）: split_type !== "custom" のエントリ
 *   - S_A = Group A の合計金額
 *   - 全員共通の案分額 = Math.floor(S_A / 人数)
 *   - 余り（S_A % 人数）は最大 payer の負担に1回だけ加算
 *     → sum(Group A の owed) = S_A を保証
 *
 * Group B（個別内訳）: split_type === "custom" のエントリ
 *   - 各エントリの splits を actual_amount に正規化してから加算
 *   - 正規化: floor(actual_amount × stored_ratio)、余りは最大 stored 比率のメンバーへ
 *     → sum(Group B の owed) = sum(Group B の actual_amount) を保証
 *   ※ splits に基づく storedTotal と actual_amount が異なる場合
 *      （ルール default_amount と実際の填記金額が違うケース）に対応
 *
 * @param entries - filled 状態のエントリリスト
 * @param members - グループメンバーリスト
 */
export function calculateEntryBalances(
  entries: EntryData[],
  members: EntryMember[]
): EntryBalance[] {
  if (members.length === 0) return [];

  // ──────────────────────────────────────────────
  // 元本の分離
  // ──────────────────────────────────────────────
  const groupA = entries.filter((e) => e.split_type !== "custom");
  const groupB = entries.filter((e) => e.split_type === "custom");

  // 診断ログ（デバッグ用）
  console.log("[calculateEntryBalances v2-groupAB]", {
    totalEntries: entries.length,
    groupA: groupA.length,
    groupB: groupB.length,
    groupATotal: groupA.reduce((s, e) => s + (e.actual_amount ?? 0), 0),
    groupBDetails: groupB.map((e) => ({
      actual: e.actual_amount,
      split_type: e.split_type,
      splits: e.splits?.map((s) => ({ uid: s.user_id.slice(-4), amt: s.amount })) ?? [],
      storedTotal: e.splits?.reduce((sum, s) => sum + s.amount, 0) ?? 0,
    })),
  });

  // ──────────────────────────────────────────────
  // 全エントリの支払い合計（paid + 最大 payer 特定）
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
  // Group B の計算（splits を actual_amount に正規化）
  // ──────────────────────────────────────────────
  const owedBByMember = new Map<string, number>();
  for (const m of members) owedBByMember.set(m.id, 0);

  for (const entry of groupB) {
    const actual = entry.actual_amount ?? 0;
    if (!entry.splits || entry.splits.length === 0) continue;

    const storedTotal = entry.splits.reduce((sum, s) => sum + s.amount, 0);
    if (storedTotal === 0) continue; // 全 0 splits → 誰にも課金しない

    // actual_amount に正規化した splits を計算（stored ratio を保持しつつ誤差を除去）
    let assigned = 0;
    let maxStoredAmount = -1;
    let maxStoredMemberId = entry.splits[0].user_id;

    const normalized: { user_id: string; amount: number }[] = [];
    for (const s of entry.splits) {
      const normAmount = Math.floor((actual * s.amount) / storedTotal);
      normalized.push({ user_id: s.user_id, amount: normAmount });
      assigned += normAmount;
      if (s.amount > maxStoredAmount) {
        maxStoredAmount = s.amount;
        maxStoredMemberId = s.user_id;
      }
    }

    // 余り（0 or 1円程度）を最大 stored 比率のメンバーへ加算
    const entryRemainder = actual - assigned;

    for (const ns of normalized) {
      const extra = ns.user_id === maxStoredMemberId ? entryRemainder : 0;
      const curr = owedBByMember.get(ns.user_id) ?? 0;
      owedBByMember.set(ns.user_id, curr + ns.amount + extra);
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
