import { describe, it, expect } from "vitest";
import {
  validateCategory,
  validateCategoryName,
  validateCategoryIcon,
  validateCategoryColor,
} from "@/lib/validation/category";

describe("validateCategoryName", () => {
  it("rejects empty name", () => {
    expect(validateCategoryName("")).toBeDefined();
    expect(validateCategoryName("   ")).toBeDefined();
  });

  it("accepts valid name", () => {
    expect(validateCategoryName("食費")).toBeUndefined();
    expect(validateCategoryName("A")).toBeUndefined();
  });

  it("rejects name over 50 chars", () => {
    expect(validateCategoryName("a".repeat(51))).toBeDefined();
  });

  it("accepts name exactly 50 chars", () => {
    expect(validateCategoryName("a".repeat(50))).toBeUndefined();
  });
});

describe("validateCategoryIcon", () => {
  it("accepts null/undefined", () => {
    expect(validateCategoryIcon(null)).toBeUndefined();
    expect(validateCategoryIcon(undefined)).toBeUndefined();
  });

  it("accepts emoji", () => {
    expect(validateCategoryIcon("🍔")).toBeUndefined();
    expect(validateCategoryIcon("💡")).toBeUndefined();
  });

  it("rejects non-emoji text", () => {
    expect(validateCategoryIcon("AB")).toBeDefined();
    expect(validateCategoryIcon("abc")).toBeDefined();
  });
});

describe("validateCategoryColor", () => {
  it("accepts null/undefined", () => {
    expect(validateCategoryColor(null)).toBeUndefined();
    expect(validateCategoryColor(undefined)).toBeUndefined();
  });

  it("accepts valid 6-digit hex", () => {
    expect(validateCategoryColor("#1B2A4A")).toBeUndefined();
    expect(validateCategoryColor("#ffffff")).toBeUndefined();
  });

  it("rejects invalid hex", () => {
    expect(validateCategoryColor("#fff")).toBeDefined();
    expect(validateCategoryColor("red")).toBeDefined();
    expect(validateCategoryColor("#GGGGGG")).toBeDefined();
  });
});

describe("validateCategory", () => {
  it("succeeds with valid input", () => {
    const result = validateCategory({ name: "食費", icon: "🍔", color: "#C75000" });
    expect(result.success).toBe(true);
  });

  it("succeeds with name only", () => {
    const result = validateCategory({ name: "テスト" });
    expect(result.success).toBe(true);
  });

  it("fails with empty name", () => {
    const result = validateCategory({ name: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.name).toBeDefined();
    }
  });

  it("collects multiple errors", () => {
    const result = validateCategory({ name: "", icon: "abc", color: "red" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.name).toBeDefined();
      expect(result.errors.icon).toBeDefined();
      expect(result.errors.color).toBeDefined();
    }
  });
});
