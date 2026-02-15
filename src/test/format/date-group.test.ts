import { describe, it, expect } from "vitest";
import { formatDateHeader, groupByDate } from "@/lib/format/date-group";

describe("formatDateHeader", () => {
  it("formats YYYY-MM-DD as Japanese date with weekday", () => {
    // 2026-02-15 is Sunday
    expect(formatDateHeader("2026-02-15")).toBe("2月15日(日)");
  });

  it("shows correct weekday for Monday", () => {
    // 2026-02-16 is Monday
    expect(formatDateHeader("2026-02-16")).toBe("2月16日(月)");
  });

  it("handles January 1st", () => {
    // 2026-01-01 is Thursday
    expect(formatDateHeader("2026-01-01")).toBe("1月1日(木)");
  });

  it("handles December 31st", () => {
    // 2025-12-31 is Wednesday
    expect(formatDateHeader("2025-12-31")).toBe("12月31日(水)");
  });
});

describe("groupByDate", () => {
  it("groups items by date preserving order", () => {
    const items = [
      { id: 1, date: "2026-02-15" },
      { id: 2, date: "2026-02-15" },
      { id: 3, date: "2026-02-14" },
    ];

    const { dateOrder, byDate } = groupByDate(items, (i) => i.date);

    expect(dateOrder).toEqual(["2026-02-15", "2026-02-14"]);
    expect(byDate["2026-02-15"]).toHaveLength(2);
    expect(byDate["2026-02-14"]).toHaveLength(1);
  });

  it("returns empty when no items", () => {
    const { dateOrder, byDate } = groupByDate([], (i: { date: string }) => i.date);
    expect(dateOrder).toEqual([]);
    expect(byDate).toEqual({});
  });

  it("preserves insertion order of first occurrence", () => {
    const items = [
      { id: 1, date: "2026-02-10" },
      { id: 2, date: "2026-02-12" },
      { id: 3, date: "2026-02-10" },
    ];

    const { dateOrder } = groupByDate(items, (i) => i.date);
    expect(dateOrder).toEqual(["2026-02-10", "2026-02-12"]);
  });
});
