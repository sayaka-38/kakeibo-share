import { describe, it, expect } from "vitest";
import { computeEntryStats } from "@/lib/domain/settlement-utils";
import type { EntryData } from "@/types/domain";

const makeEntry = (
  id: string,
  status: "pending" | "filled" | "skipped",
  actual_amount?: number
): EntryData => ({
  id,
  session_id: "s1",
  rule_id: null,
  payment_id: null,
  source_payment_id: null,
  entry_type: "manual",
  description: `Entry ${id}`,
  payer_id: "user-1",
  expected_amount: 1000,
  actual_amount: actual_amount ?? (status === "filled" ? 1000 : null),
  status,
  split_type: "equal",
  category_id: null,
  payment_date: "2026-01-01",
  filled_by: null,
  filled_at: null,
});

describe("computeEntryStats", () => {
  it("空配列 → すべて 0", () => {
    expect(computeEntryStats([])).toEqual({
      total: 0,
      pending: 0,
      filled: 0,
      skipped: 0,
      totalAmount: 0,
    });
  });

  it("mixed エントリ → 各カウント正確", () => {
    const entries = [
      makeEntry("p1", "pending"),
      makeEntry("p2", "pending"),
      makeEntry("f1", "filled"),
      makeEntry("s1", "skipped"),
    ];
    const result = computeEntryStats(entries);
    expect(result.total).toBe(4);
    expect(result.pending).toBe(2);
    expect(result.filled).toBe(1);
    expect(result.skipped).toBe(1);
  });

  it("filled エントリの actual_amount を totalAmount に集計", () => {
    const entries = [
      makeEntry("f1", "filled", 3000),
      makeEntry("f2", "filled", 2000),
      makeEntry("p1", "pending"),
      makeEntry("s1", "skipped"),
    ];
    const result = computeEntryStats(entries);
    expect(result.totalAmount).toBe(5000);
  });

  it("actual_amount が null の filled エントリは totalAmount に加算しない", () => {
    const entries = [makeEntry("f1", "filled", 0)];
    // actual_amount=0 → 加算しない
    expect(computeEntryStats(entries).totalAmount).toBe(0);
  });
});
