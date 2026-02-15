import { describe, it, expect } from "vitest";
import {
  validateDescription,
  validateDayOfMonth,
  validateIntervalMonths,
  validateAmount,
  validateRecurringRule,
} from "@/lib/validation/recurring-rule";

describe("validateDescription", () => {
  it("rejects empty string", () => {
    expect(validateDescription("")).toBeDefined();
  });

  it("rejects whitespace only", () => {
    expect(validateDescription("   ")).toBeDefined();
  });

  it("accepts valid description", () => {
    expect(validateDescription("家賃")).toBeUndefined();
  });

  it("rejects description over 100 chars", () => {
    expect(validateDescription("a".repeat(101))).toBeDefined();
  });

  it("accepts exactly 100 chars", () => {
    expect(validateDescription("a".repeat(100))).toBeUndefined();
  });
});

describe("validateDayOfMonth", () => {
  it("rejects 0", () => {
    expect(validateDayOfMonth(0)).toBeDefined();
  });

  it("rejects 32", () => {
    expect(validateDayOfMonth(32)).toBeDefined();
  });

  it("accepts 1", () => {
    expect(validateDayOfMonth(1)).toBeUndefined();
  });

  it("accepts 31", () => {
    expect(validateDayOfMonth(31)).toBeUndefined();
  });

  it("rejects NaN", () => {
    expect(validateDayOfMonth(NaN)).toBeDefined();
  });
});

describe("validateIntervalMonths", () => {
  it("rejects 0", () => {
    expect(validateIntervalMonths(0)).toBeDefined();
  });

  it("rejects 13", () => {
    expect(validateIntervalMonths(13)).toBeDefined();
  });

  it("accepts 1 (monthly)", () => {
    expect(validateIntervalMonths(1)).toBeUndefined();
  });

  it("accepts 12 (yearly)", () => {
    expect(validateIntervalMonths(12)).toBeUndefined();
  });

  it("rejects float", () => {
    expect(validateIntervalMonths(1.5)).toBeDefined();
  });
});

describe("validateAmount", () => {
  it("rejects null amount for fixed rule", () => {
    expect(validateAmount(false, null)).toBeDefined();
  });

  it("rejects 0 for fixed rule", () => {
    expect(validateAmount(false, 0)).toBeDefined();
  });

  it("accepts positive amount for fixed rule", () => {
    expect(validateAmount(false, 50000)).toBeUndefined();
  });

  it("accepts undefined for variable rule", () => {
    expect(validateAmount(true, undefined)).toBeUndefined();
  });

  it("rejects set amount for variable rule", () => {
    expect(validateAmount(true, 1000)).toBeDefined();
  });
});

describe("validateRecurringRule (integration)", () => {
  const validInput = {
    description: "家賃",
    dayOfMonth: 25,
    defaultPayerId: "user-1",
    isVariable: false,
    defaultAmount: 100000,
    intervalMonths: 1,
    splitType: "equal",
  };

  it("passes for valid input", () => {
    const result = validateRecurringRule(validInput);
    expect(result.success).toBe(true);
  });

  it("fails with multiple errors", () => {
    const result = validateRecurringRule({
      ...validInput,
      description: "",
      dayOfMonth: 0,
      defaultPayerId: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.description).toBeDefined();
      expect(result.errors.dayOfMonth).toBeDefined();
      expect(result.errors.defaultPayerId).toBeDefined();
    }
  });

  it("checks custom split percentage total", () => {
    const result = validateRecurringRule({
      ...validInput,
      splitType: "custom",
      percentageTotal: 95,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.percentages).toBeDefined();
    }
  });

  it("accepts 100% custom split", () => {
    const result = validateRecurringRule({
      ...validInput,
      splitType: "custom",
      percentageTotal: 100,
    });
    expect(result.success).toBe(true);
  });
});
