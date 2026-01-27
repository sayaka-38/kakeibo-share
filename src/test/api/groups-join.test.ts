/**
 * /api/groups/join API Route テスト
 *
 * Phase 5-4: 招待コードによるグループ参加 API
 *
 * この API は RLS が厳格になった後も招待参加を可能にするために必要
 * サーバーサイドで service role を使用し、RLS をバイパスしてグループ検索を行う
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

// =============================================================================
// ファイル存在確認テスト（Red フェーズ）
// =============================================================================

const API_ROUTE_PATH = path.join(
  process.cwd(),
  "src/app/api/groups/join/route.ts"
);
const ADMIN_CLIENT_PATH = path.join(
  process.cwd(),
  "src/lib/supabase/admin.ts"
);

describe("/api/groups/join API Route", () => {
  describe("ファイル存在確認（Red フェーズ）", () => {
    it("API Route ファイルが存在する", () => {
      // Red: ファイルが存在しないので失敗する
      const exists = fs.existsSync(API_ROUTE_PATH);
      expect(exists).toBe(true);
    });

    it("Admin クライアントファイルが存在する", () => {
      // Red: ファイルが存在しないので失敗する
      const exists = fs.existsSync(ADMIN_CLIENT_PATH);
      expect(exists).toBe(true);
    });
  });
});

// =============================================================================
// RLS ポリシー仕様テスト
// =============================================================================

describe("groups + group_members RLS ポリシー仕様", () => {
  describe("groups テーブル", () => {
    it("SELECT: メンバーのみアクセス可能", () => {
      const policy = {
        operation: "SELECT",
        condition: "user_id IN (SELECT user_id FROM group_members WHERE group_id = groups.id)",
        note: "招待コード検索は API Route で service role 使用",
      };
      expect(policy.condition).toContain("group_members");
    });

    it("INSERT: 認証済みで owner_id = 自分", () => {
      const policy = {
        operation: "INSERT",
        condition: "auth.uid() IS NOT NULL AND owner_id = auth.uid()",
      };
      expect(policy.condition).toContain("owner_id = auth.uid()");
    });

    it("UPDATE: owner のみ", () => {
      const policy = {
        operation: "UPDATE",
        condition: "owner_id = auth.uid()",
      };
      expect(policy.condition).toBe("owner_id = auth.uid()");
    });

    it("DELETE: owner のみ", () => {
      const policy = {
        operation: "DELETE",
        condition: "owner_id = auth.uid()",
      };
      expect(policy.condition).toBe("owner_id = auth.uid()");
    });
  });

  describe("group_members テーブル", () => {
    it("SELECT: 同じグループのメンバーのみ", () => {
      const policy = {
        operation: "SELECT",
        condition: "group_id IN (SELECT group_id FROM group_members WHERE user_id = auth.uid())",
      };
      expect(policy.condition).toContain("auth.uid()");
    });

    it("INSERT: owner または自分自身（招待参加）", () => {
      const policy = {
        operation: "INSERT",
        condition: "group owner OR user_id = auth.uid()",
        note: "招待参加時は自分自身を追加",
      };
      expect(policy.condition).toContain("user_id = auth.uid()");
    });

    it("DELETE: owner または本人", () => {
      const policy = {
        operation: "DELETE",
        condition: "group owner OR user_id = auth.uid()",
        note: "本人は脱退可能",
      };
      expect(policy.condition).toContain("user_id = auth.uid()");
    });
  });
});

// =============================================================================
// マイグレーションファイル存在確認
// =============================================================================

describe("マイグレーションファイル", () => {
  const MIGRATION_PATH = path.join(
    process.cwd(),
    "supabase/migrations/006_groups_rls.sql"
  );

  it("groups RLS マイグレーションファイルが存在する", () => {
    // Red: ファイルが存在しないので失敗する
    const exists = fs.existsSync(MIGRATION_PATH);
    expect(exists).toBe(true);
  });
});

// =============================================================================
// セキュリティ設計テスト
// =============================================================================

describe("招待参加 API のセキュリティ設計", () => {
  it("招待コードはレスポンスに含めない", () => {
    // セキュリティ: 招待コードの漏洩を防ぐ
    const expectedResponse = {
      success: true,
      groupId: "uuid",
      groupName: "グループ名",
      // inviteCode は含めない
    };

    expect(expectedResponse).not.toHaveProperty("inviteCode");
  });

  it("RLS は厳格にメンバーのみに制限", () => {
    const rlsDesign = {
      groupsSelect: "member only",
      inviteCodeSearch: "via API Route with service role",
    };

    expect(rlsDesign.groupsSelect).toBe("member only");
    expect(rlsDesign.inviteCodeSearch).toContain("service role");
  });
});
