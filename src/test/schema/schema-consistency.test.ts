/**
 * スキーマ整合性テスト
 *
 * DBスキーマ（SQLファイル）とTypeScript型定義の整合性を検証する
 * このテストにより、カラム名の不一致を早期に発見できる
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

// TypeScript型から期待されるカラム名を抽出するヘルパー
function extractColumnNamesFromType(typeContent: string, tableName: string): string[] {
  // Row型の定義を探す
  const rowTypePattern = new RegExp(`${tableName}:\\s*\\{[^}]*Row:\\s*\\{([^}]+)\\}`, "s");
  const match = typeContent.match(rowTypePattern);
  if (!match) return [];

  const rowContent = match[1];
  // プロパティ名を抽出（コロンの前の識別子）
  const propertyPattern = /(\w+):/g;
  const properties: string[] = [];
  let propMatch;
  while ((propMatch = propertyPattern.exec(rowContent)) !== null) {
    properties.push(propMatch[1]);
  }
  return properties;
}

describe("Schema Consistency - スキーマ整合性", () => {
  // process.cwd() を使用してプロジェクトルートを取得
  const projectRoot = process.cwd();
  const typesPath = join(projectRoot, "src/types/database.ts");
  const inviteCodeMigrationPath = join(
    projectRoot,
    "supabase/migrations/002_add_invite_code.sql"
  );
  const columnRenameMigrationPath = join(
    projectRoot,
    "supabase/migrations/003_rename_columns_for_consistency.sql"
  );

  let typeContent: string;
  let inviteCodeMigration: string;
  let columnRenameMigration: string;

  // ファイルを読み込む
  try {
    typeContent = readFileSync(typesPath, "utf-8");
    inviteCodeMigration = readFileSync(inviteCodeMigrationPath, "utf-8");
  } catch (e) {
    console.error("Failed to read files:", e);
    typeContent = "";
    inviteCodeMigration = "";
  }

  try {
    columnRenameMigration = readFileSync(columnRenameMigrationPath, "utf-8");
  } catch (e) {
    console.error("Failed to read migration file:", e);
    columnRenameMigration = "";
  }

  describe("groups テーブル", () => {
    it("TypeScript型で owner_id カラムが定義されている", () => {
      const tsColumns = extractColumnNamesFromType(typeContent, "groups");
      expect(tsColumns).toContain("owner_id");
    });

    it("マイグレーションで owner_id へのリネームが定義されている", () => {
      // 003マイグレーションが存在し、created_by → owner_id のリネームが含まれる
      expect(columnRenameMigration).toContain("RENAME COLUMN created_by TO owner_id");
    });
  });

  describe("payments テーブル", () => {
    it("TypeScript型で payer_id カラムが定義されている", () => {
      const tsColumns = extractColumnNamesFromType(typeContent, "payments");
      expect(tsColumns).toContain("payer_id");
    });

    it("マイグレーションで payer_id へのリネームが定義されている", () => {
      // 003マイグレーションが存在し、paid_by → payer_id のリネームが含まれる
      expect(columnRenameMigration).toContain("RENAME COLUMN paid_by TO payer_id");
    });
  });

  describe("profiles テーブル", () => {
    it("TypeScript型で is_demo カラムが定義されている", () => {
      const tsColumns = extractColumnNamesFromType(typeContent, "profiles");
      expect(tsColumns).toContain("is_demo");
    });

    it("マイグレーションで is_demo カラムの追加が定義されている", () => {
      expect(columnRenameMigration).toContain("ADD COLUMN");
      expect(columnRenameMigration).toContain("is_demo");
    });
  });

  describe("groups テーブル - invite_code", () => {
    it("TypeScript型で invite_code カラムが定義されている", () => {
      const tsColumns = extractColumnNamesFromType(typeContent, "groups");
      expect(tsColumns).toContain("invite_code");
    });

    it("マイグレーションで invite_code カラムの追加が定義されている", () => {
      expect(inviteCodeMigration).toContain("invite_code");
    });
  });
});

describe("RLS Policy Consistency - RLSポリシー整合性", () => {
  const projectRoot = process.cwd();
  const initialSchemaPath = join(
    projectRoot,
    "supabase/migrations/001_initial_schema.sql"
  );

  let initialSchemaContent: string;

  try {
    initialSchemaContent = readFileSync(initialSchemaPath, "utf-8");
  } catch {
    initialSchemaContent = "";
  }

  describe("payments RLSポリシー", () => {
    it("RLSポリシーで payer_id を使用するように定義されている", () => {
      // 初期スキーマでRLSポリシーが payer_id を使用していることを確認
      expect(initialSchemaContent).toContain("payments_update_payer");
      expect(initialSchemaContent).toContain("payments_delete_payer");
    });
  });
});
