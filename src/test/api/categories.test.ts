/**
 * Categories API Routes テスト
 *
 * POST /api/categories — カスタムカテゴリ作成
 * PUT /api/categories/[id] — カスタムカテゴリ更新
 * DELETE /api/categories/[id] — カスタムカテゴリ削除
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const POST_ROUTE = path.join(process.cwd(), "src/app/api/categories/route.ts");
const ITEM_ROUTE = path.join(process.cwd(), "src/app/api/categories/[id]/route.ts");
const VALIDATION_PATH = path.join(process.cwd(), "src/lib/validation/category.ts");

describe("POST /api/categories", () => {
  it("API Route ファイルが存在する", () => {
    expect(fs.existsSync(POST_ROUTE)).toBe(true);
  });

  it("POST ハンドラがエクスポートされている", () => {
    const content = fs.readFileSync(POST_ROUTE, "utf-8");
    expect(content).toContain("export async function POST");
  });

  it("authenticateRequest を使用している", () => {
    const content = fs.readFileSync(POST_ROUTE, "utf-8");
    expect(content).toContain("authenticateRequest");
  });

  it("validateCategory を使用している", () => {
    const content = fs.readFileSync(POST_ROUTE, "utf-8");
    expect(content).toContain("validateCategory");
  });

  it("メンバーシップ確認をしている", () => {
    const content = fs.readFileSync(POST_ROUTE, "utf-8");
    expect(content).toContain("group_members");
  });

  it("is_default: false で作成している", () => {
    const content = fs.readFileSync(POST_ROUTE, "utf-8");
    expect(content).toContain("is_default: false");
  });
});

describe("PUT /api/categories/[id]", () => {
  it("API Route ファイルが存在する", () => {
    expect(fs.existsSync(ITEM_ROUTE)).toBe(true);
  });

  it("PUT ハンドラがエクスポートされている", () => {
    const content = fs.readFileSync(ITEM_ROUTE, "utf-8");
    expect(content).toContain("export async function PUT");
  });

  it("is_default ガードチェックがある", () => {
    const content = fs.readFileSync(ITEM_ROUTE, "utf-8");
    expect(content).toContain("is_default");
    expect(content).toContain("categories.api.defaultNotEditable");
  });
});

describe("DELETE /api/categories/[id]", () => {
  it("DELETE ハンドラがエクスポートされている", () => {
    const content = fs.readFileSync(ITEM_ROUTE, "utf-8");
    expect(content).toContain("export async function DELETE");
  });

  it("is_default ガードチェックがある", () => {
    const content = fs.readFileSync(ITEM_ROUTE, "utf-8");
    expect(content).toContain("categories.api.defaultNotDeletable");
  });
});

describe("Category validation module", () => {
  it("バリデーションファイルが存在する", () => {
    expect(fs.existsSync(VALIDATION_PATH)).toBe(true);
  });

  it("validateCategory がエクスポートされている", () => {
    const content = fs.readFileSync(VALIDATION_PATH, "utf-8");
    expect(content).toContain("export function validateCategory");
  });
});
