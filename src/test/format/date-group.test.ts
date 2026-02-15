import { describe, it, expect } from "vitest";
import {
  formatDateHeader,
  groupByDate,
  groupPaymentsByDate,
  groupPaymentsByMonth,
} from "@/lib/format/date-group";

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

describe("groupPaymentsByDate", () => {
  it("returns array of { date, payments } preserving order", () => {
    const payments = [
      { id: "a", payment_date: "2026-02-15" },
      { id: "b", payment_date: "2026-02-15" },
      { id: "c", payment_date: "2026-02-14" },
    ];

    const result = groupPaymentsByDate(payments);
    expect(result).toHaveLength(2);
    expect(result[0].date).toBe("2026-02-15");
    expect(result[0].payments).toHaveLength(2);
    expect(result[1].date).toBe("2026-02-14");
    expect(result[1].payments).toHaveLength(1);
  });

  it("returns empty array for no payments", () => {
    const result = groupPaymentsByDate([]);
    expect(result).toEqual([]);
  });
});

describe("groupPaymentsByMonth", () => {
  it("groups by YYYY-MM and sorts months descending", () => {
    const payments = [
      { id: "1", payment_date: "2026-01-10" },
      { id: "2", payment_date: "2026-02-05" },
      { id: "3", payment_date: "2026-01-20" },
      { id: "4", payment_date: "2026-02-15" },
    ];

    const { months, byMonth } = groupPaymentsByMonth(payments);
    expect(months).toEqual(["2026-02", "2026-01"]);
    expect(byMonth["2026-01"]).toHaveLength(2);
    expect(byMonth["2026-02"]).toHaveLength(2);
  });

  it("returns empty for no payments", () => {
    const { months, byMonth } = groupPaymentsByMonth([]);
    expect(months).toEqual([]);
    expect(byMonth).toEqual({});
  });
});
