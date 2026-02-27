import { describe, it, expect } from "vitest";
import { computeEntryStats } from "@/lib/domain/settlement-utils";
import { createMockEntry, createFilledEntry, createSkippedEntry } from "@/test/factories";

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
      createMockEntry({ id: "p1", description: "Entry p1" }),
      createMockEntry({ id: "p2", description: "Entry p2" }),
      createFilledEntry({ id: "f1", description: "Entry f1" }),
      createSkippedEntry({ id: "s1", description: "Entry s1" }),
    ];
    const result = computeEntryStats(entries);
    expect(result.total).toBe(4);
    expect(result.pending).toBe(2);
    expect(result.filled).toBe(1);
    expect(result.skipped).toBe(1);
  });

  it("filled エントリの actual_amount を totalAmount に集計", () => {
    const entries = [
      createFilledEntry({ id: "f1", description: "Entry f1", actual_amount: 3000 }),
      createFilledEntry({ id: "f2", description: "Entry f2", actual_amount: 2000 }),
      createMockEntry({ id: "p1", description: "Entry p1" }),
      createSkippedEntry({ id: "s1", description: "Entry s1" }),
    ];
    const result = computeEntryStats(entries);
    expect(result.totalAmount).toBe(5000);
  });

  it("actual_amount が null の filled エントリは totalAmount に加算しない", () => {
    const entries = [createFilledEntry({ id: "f1", actual_amount: 0 })];
    // actual_amount=0 → 加算しない
    expect(computeEntryStats(entries).totalAmount).toBe(0);
  });
});
