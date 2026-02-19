import { describe, it, expect } from "vitest";
import {
  CATEGORY_COLORS,
  getRelativeLuminance,
  getContrastTextColor,
  getCategoryStyle,
} from "@/lib/format/color";

describe("CATEGORY_COLORS", () => {
  it("has 10 colors", () => {
    expect(CATEGORY_COLORS).toHaveLength(10);
  });

  it("all entries have valid hex format", () => {
    for (const c of CATEGORY_COLORS) {
      expect(c.hex).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });
});

describe("getRelativeLuminance", () => {
  it("returns 0 for black", () => {
    expect(getRelativeLuminance("#000000")).toBeCloseTo(0, 4);
  });

  it("returns 1 for white", () => {
    expect(getRelativeLuminance("#ffffff")).toBeCloseTo(1, 4);
  });

  it("returns ~0.2126 for pure red", () => {
    expect(getRelativeLuminance("#ff0000")).toBeCloseTo(0.2126, 3);
  });

  it("returns ~0.7152 for pure green", () => {
    expect(getRelativeLuminance("#00ff00")).toBeCloseTo(0.7152, 3);
  });

  it("returns ~0.0722 for pure blue", () => {
    expect(getRelativeLuminance("#0000ff")).toBeCloseTo(0.0722, 3);
  });

  it("returns 0 for invalid hex", () => {
    expect(getRelativeLuminance("invalid")).toBe(0);
    expect(getRelativeLuminance("#GGG")).toBe(0);
    expect(getRelativeLuminance("")).toBe(0);
  });

  it("supports 3-digit shorthand", () => {
    // #fff = white
    expect(getRelativeLuminance("#fff")).toBeCloseTo(1, 4);
    // #000 = black
    expect(getRelativeLuminance("#000")).toBeCloseTo(0, 4);
  });
});

describe("getContrastTextColor", () => {
  it("returns white for dark backgrounds", () => {
    expect(getContrastTextColor("#000000")).toBe("#ffffff");
    expect(getContrastTextColor("#1B2A4A")).toBe("#ffffff"); // Midnight Blue
    expect(getContrastTextColor("#3C3C3C")).toBe("#ffffff"); // Graphite
  });

  it("returns dark for light backgrounds", () => {
    expect(getContrastTextColor("#ffffff")).toBe("#1a1a1a");
    expect(getContrastTextColor("#f0f0f0")).toBe("#1a1a1a");
  });

  it("ensures 4.5:1 contrast for all CATEGORY_COLORS", () => {
    for (const c of CATEGORY_COLORS) {
      const textColor = getContrastTextColor(c.hex);
      const bgLum = getRelativeLuminance(c.hex);
      const textLum = getRelativeLuminance(textColor);
      const l1 = Math.max(bgLum, textLum);
      const l2 = Math.min(bgLum, textLum);
      const ratio = (l1 + 0.05) / (l2 + 0.05);
      expect(ratio, `${c.name} (${c.hex}) contrast ratio`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("getCategoryStyle", () => {
  it("returns null for null color", () => {
    expect(getCategoryStyle(null)).toBeNull();
  });

  it("returns null for invalid hex", () => {
    expect(getCategoryStyle("not-a-color")).toBeNull();
    expect(getCategoryStyle("")).toBeNull();
  });

  it("returns styled object for valid color", () => {
    const style = getCategoryStyle("#1B2A4A");
    expect(style).toEqual({
      backgroundColor: "#1B2A4A",
      color: "#ffffff",
    });
  });

  it("returns dark text for light colors", () => {
    const style = getCategoryStyle("#ffffff");
    expect(style).toEqual({
      backgroundColor: "#ffffff",
      color: "#1a1a1a",
    });
  });
});
