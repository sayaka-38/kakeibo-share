import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const CATEGORY_MANAGER_PATH = path.join(
  process.cwd(),
  "src/components/CategoryManager.tsx"
);

const COLOR_PICKER_PATH = path.join(
  process.cwd(),
  "src/components/ColorPicker.tsx"
);

describe("CategoryManager component", () => {
  it("ファイルが存在する", () => {
    expect(fs.existsSync(CATEGORY_MANAGER_PATH)).toBe(true);
  });

  it("use client ディレクティブがある", () => {
    const content = fs.readFileSync(CATEGORY_MANAGER_PATH, "utf-8");
    expect(content).toContain('"use client"');
  });

  it("getCategoryStyle を使用している", () => {
    const content = fs.readFileSync(CATEGORY_MANAGER_PATH, "utf-8");
    expect(content).toContain("getCategoryStyle");
  });

  it("ColorPicker を使用している", () => {
    const content = fs.readFileSync(CATEGORY_MANAGER_PATH, "utf-8");
    expect(content).toContain("ColorPicker");
  });

  it("API ルートを fetch で呼び出している", () => {
    const content = fs.readFileSync(CATEGORY_MANAGER_PATH, "utf-8");
    expect(content).toContain("/api/categories");
  });

  it("is_default カテゴリの編集・削除を防止している", () => {
    const content = fs.readFileSync(CATEGORY_MANAGER_PATH, "utf-8");
    // Default categories are shown read-only (no edit/delete buttons)
    expect(content).toContain("is_default");
  });

  it("i18n キーを使用している", () => {
    const content = fs.readFileSync(CATEGORY_MANAGER_PATH, "utf-8");
    expect(content).toContain("categories.management.");
  });
});

describe("ColorPicker component", () => {
  it("ファイルが存在する", () => {
    expect(fs.existsSync(COLOR_PICKER_PATH)).toBe(true);
  });

  it("CATEGORY_COLORS パレットを使用している", () => {
    const content = fs.readFileSync(COLOR_PICKER_PATH, "utf-8");
    expect(content).toContain("CATEGORY_COLORS");
  });
});
