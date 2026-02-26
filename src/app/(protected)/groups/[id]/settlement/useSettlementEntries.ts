import type { EntryData } from "@/types/domain";

/**
 * エントリ一覧をステータス別にグループ化し、
 * 確定可否・空判定などの派生値を返すフック。
 */
export function useSettlementEntries(entries: EntryData[]) {
  const pendingEntries = entries.filter((e) => e.status === "pending");
  const filledEntries = entries.filter((e) => e.status === "filled");
  const skippedEntries = entries.filter((e) => e.status === "skipped");
  const isEmpty = entries.length === 0;
  const canConfirm = pendingEntries.length === 0 && filledEntries.length > 0;

  return { pendingEntries, filledEntries, skippedEntries, isEmpty, canConfirm };
}
