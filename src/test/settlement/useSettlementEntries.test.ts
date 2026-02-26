import { describe, it, expect } from "vitest";
import { useSettlementEntries } from "@/app/(protected)/groups/[id]/settlement/useSettlementEntries";
import type { EntryData } from "@/types/domain";

// useSettlementEntries は React hook を一切使わない純粋な計算関数のため
// 直接呼び出してテスト可能（renderHook 不要）

const makeEntry = (id: string, status: "pending" | "filled" | "skipped"): EntryData => ({
  id,
  session_id: "s1",
  rule_id: null,
  payment_id: null,
  source_payment_id: null,
  entry_type: "manual",
  description: `Entry ${id}`,
  payer_id: "user-1",
  expected_amount: 1000,
  actual_amount: status === "filled" ? 1000 : null,
  status,
  split_type: "equal",
  category_id: null,
  payment_date: "2026-01-01",
  filled_by: null,
  filled_at: null,
});

describe("useSettlementEntries", () => {
  it("空のエントリ配列なら isEmpty=true、canConfirm=false", () => {
    const result = useSettlementEntries([]);
    expect(result.isEmpty).toBe(true);
    expect(result.canConfirm).toBe(false);
    expect(result.pendingEntries).toHaveLength(0);
    expect(result.filledEntries).toHaveLength(0);
    expect(result.skippedEntries).toHaveLength(0);
  });

  it("pending エントリがあれば pendingEntries に含まれる", () => {
    const entries = [makeEntry("e1", "pending"), makeEntry("e2", "filled")];
    const result = useSettlementEntries(entries);
    expect(result.pendingEntries).toHaveLength(1);
    expect(result.pendingEntries[0].id).toBe("e1");
  });

  it("filled エントリがあれば filledEntries に含まれる", () => {
    const entries = [makeEntry("e1", "filled"), makeEntry("e2", "filled")];
    const result = useSettlementEntries(entries);
    expect(result.filledEntries).toHaveLength(2);
  });

  it("skipped エントリがあれば skippedEntries に含まれる", () => {
    const entries = [makeEntry("e1", "skipped")];
    const result = useSettlementEntries(entries);
    expect(result.skippedEntries).toHaveLength(1);
    expect(result.skippedEntries[0].id).toBe("e1");
  });

  it("pending=0 かつ filled>0 のとき canConfirm=true", () => {
    const entries = [makeEntry("e1", "filled")];
    const result = useSettlementEntries(entries);
    expect(result.canConfirm).toBe(true);
  });

  it("pending>0 のとき canConfirm=false", () => {
    const entries = [makeEntry("e1", "pending"), makeEntry("e2", "filled")];
    const result = useSettlementEntries(entries);
    expect(result.canConfirm).toBe(false);
  });

  it("filled=0 のとき canConfirm=false（全スキップの場合）", () => {
    const entries = [makeEntry("e1", "skipped")];
    const result = useSettlementEntries(entries);
    expect(result.canConfirm).toBe(false);
  });

  it("複合ステータス: pending/filled/skipped を正しく分類する", () => {
    const entries = [
      makeEntry("p1", "pending"),
      makeEntry("p2", "pending"),
      makeEntry("f1", "filled"),
      makeEntry("s1", "skipped"),
    ];
    const result = useSettlementEntries(entries);
    expect(result.pendingEntries).toHaveLength(2);
    expect(result.filledEntries).toHaveLength(1);
    expect(result.skippedEntries).toHaveLength(1);
    expect(result.isEmpty).toBe(false);
  });
});
