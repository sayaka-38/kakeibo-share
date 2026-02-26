import { describe, it, expect } from "vitest";
import { useSettlementEntries } from "@/app/(protected)/groups/[id]/settlement/useSettlementEntries";
import type { EntryData } from "@/types/domain";

// useSettlementEntries はフックだが、React を使わないピュアな計算なので
// renderHook 不要で直接呼び出してテスト可能
function callHook(entries: EntryData[], stats: { pending: number; filled: number }) {
  return useSettlementEntries(entries, stats);
}

const makeEntry = (id: string, status: "pending" | "filled" | "skipped"): EntryData => ({
  id,
  session_id: "s1",
  rule_id: null,
  payment_id: null,
  source_payment_id: null,
  entry_type: "manual",
  description: `Entry ${id}`,
  payer_id: "user-1",
  payer: null,
  expected_amount: 1000,
  actual_amount: status === "filled" ? 1000 : null,
  status,
  split_type: "equal",
  splits: [],
  category: null,
  category_id: null,
  payment_date: "2026-01-01",
  filled_by: null,
  filled_at: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
});

describe("useSettlementEntries", () => {
  it("空のエントリ配列なら isEmpty=true、canConfirm=false", () => {
    const result = callHook([], { pending: 0, filled: 0 });
    expect(result.isEmpty).toBe(true);
    expect(result.canConfirm).toBe(false);
    expect(result.pendingEntries).toHaveLength(0);
    expect(result.filledEntries).toHaveLength(0);
    expect(result.skippedEntries).toHaveLength(0);
  });

  it("pending エントリがあれば pendingEntries に含まれる", () => {
    const entries = [makeEntry("e1", "pending"), makeEntry("e2", "filled")];
    const result = callHook(entries, { pending: 1, filled: 1 });
    expect(result.pendingEntries).toHaveLength(1);
    expect(result.pendingEntries[0].id).toBe("e1");
  });

  it("filled エントリがあれば filledEntries に含まれる", () => {
    const entries = [makeEntry("e1", "filled"), makeEntry("e2", "filled")];
    const result = callHook(entries, { pending: 0, filled: 2 });
    expect(result.filledEntries).toHaveLength(2);
  });

  it("skipped エントリがあれば skippedEntries に含まれる", () => {
    const entries = [makeEntry("e1", "skipped")];
    const result = callHook(entries, { pending: 0, filled: 0 });
    expect(result.skippedEntries).toHaveLength(1);
    expect(result.skippedEntries[0].id).toBe("e1");
  });

  it("pending=0 かつ filled>0 のとき canConfirm=true", () => {
    const entries = [makeEntry("e1", "filled")];
    const result = callHook(entries, { pending: 0, filled: 1 });
    expect(result.canConfirm).toBe(true);
  });

  it("pending>0 のとき canConfirm=false", () => {
    const entries = [makeEntry("e1", "pending"), makeEntry("e2", "filled")];
    const result = callHook(entries, { pending: 1, filled: 1 });
    expect(result.canConfirm).toBe(false);
  });

  it("filled=0 のとき canConfirm=false（全スキップの場合）", () => {
    const entries = [makeEntry("e1", "skipped")];
    const result = callHook(entries, { pending: 0, filled: 0 });
    expect(result.canConfirm).toBe(false);
  });

  it("複合ステータス: pending/filled/skipped を正しく分類する", () => {
    const entries = [
      makeEntry("p1", "pending"),
      makeEntry("p2", "pending"),
      makeEntry("f1", "filled"),
      makeEntry("s1", "skipped"),
    ];
    const result = callHook(entries, { pending: 2, filled: 1 });
    expect(result.pendingEntries).toHaveLength(2);
    expect(result.filledEntries).toHaveLength(1);
    expect(result.skippedEntries).toHaveLength(1);
    expect(result.isEmpty).toBe(false);
  });
});
