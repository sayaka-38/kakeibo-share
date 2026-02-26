import type { EntryData } from "@/types/domain";

type Stats = {
  pending: number;
  filled: number;
};

/**
 * エントリ一覧をステータス別にグループ化し、
 * 確定可否・空判定などの派生値を返すフック。
 */
export function useSettlementEntries(
  entries: EntryData[],
  stats: Stats
) {
  const pendingEntries = entries.filter((e) => e.status === "pending");
  const filledEntries = entries.filter((e) => e.status === "filled");
  const skippedEntries = entries.filter((e) => e.status === "skipped");
  const isEmpty = entries.length === 0;
  const canConfirm = stats.pending === 0 && stats.filled > 0;

  return { pendingEntries, filledEntries, skippedEntries, isEmpty, canConfirm };
}
