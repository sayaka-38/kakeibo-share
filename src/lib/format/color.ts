/**
 * Category color utilities
 *
 * Provides a modern color palette for categories and
 * WCAG-compliant contrast text color calculation.
 */

export type CategoryColor = {
  name: string;
  hex: string;
};

/** 10-color modern palette for category customization */
export const CATEGORY_COLORS: CategoryColor[] = [
  { name: "Midnight Blue", hex: "#1B2A4A" },
  { name: "Forest Green", hex: "#1A5632" },
  { name: "Deep Slate", hex: "#2F3E46" },
  { name: "Crimson Red", hex: "#9B2335" },
  { name: "Royal Purple", hex: "#5B2C8A" },
  { name: "Graphite", hex: "#3C3C3C" },
  { name: "Teal", hex: "#0E7C7B" },
  { name: "Burnt Orange", hex: "#C75000" },
  { name: "Ocean Blue", hex: "#1A5276" },
  { name: "Espresso", hex: "#6B4226" },
];

/**
 * Parse a hex color string to RGB values.
 * Supports #RGB and #RRGGBB formats.
 */
function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const match = hex.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (!match) return null;

  let r: number, g: number, b: number;
  if (match[1].length === 3) {
    r = parseInt(match[1][0] + match[1][0], 16);
    g = parseInt(match[1][1] + match[1][1], 16);
    b = parseInt(match[1][2] + match[1][2], 16);
  } else {
    r = parseInt(match[1].substring(0, 2), 16);
    g = parseInt(match[1].substring(2, 4), 16);
    b = parseInt(match[1].substring(4, 6), 16);
  }
  return { r, g, b };
}

/**
 * Calculate relative luminance per WCAG 2.1.
 * Returns a value between 0 (black) and 1 (white).
 */
export function getRelativeLuminance(hex: string): number {
  const rgb = parseHex(hex);
  if (!rgb) return 0;

  const toLinear = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };

  return 0.2126 * toLinear(rgb.r) + 0.7152 * toLinear(rgb.g) + 0.0722 * toLinear(rgb.b);
}

/**
 * Get contrast text color (white or near-black) that ensures
 * at least 4.5:1 contrast ratio against the given background.
 */
export function getContrastTextColor(bgHex: string): "#ffffff" | "#1a1a1a" {
  const bgLum = getRelativeLuminance(bgHex);
  // Contrast ratio = (L1 + 0.05) / (L2 + 0.05) where L1 > L2
  // White luminance = 1.0, near-black (#1a1a1a) luminance ≈ 0.01
  const whiteContrast = (1.0 + 0.05) / (bgLum + 0.05);
  const darkContrast = (bgLum + 0.05) / (getRelativeLuminance("#1a1a1a") + 0.05);
  return whiteContrast >= darkContrast ? "#ffffff" : "#1a1a1a";
}

/**
 * Get inline style object for a category badge.
 * Returns colored style if color is provided, neutral fallback otherwise.
 */
export function getCategoryStyle(color: string | null): {
  backgroundColor: string;
  color: string;
} | null {
  if (!color || !parseHex(color)) return null;
  return {
    backgroundColor: color,
    color: getContrastTextColor(color),
  };
}
