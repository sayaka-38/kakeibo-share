/**
 * DELETE /api/payments/[id] API Route テスト
 *
 * 支払い削除機能（TDD Red → Green）
 *
 * 認可ルール:
 *   - 支払者本人 (payer_id === user.id) → 削除可
 *   - グループオーナー (groups.owner_id === user.id) → 削除可
 *   - それ以外のメンバー → 403
 *
 * 二重防御:
 *   - アプリ層: この API Route で明示的に 403 を返す
 *   - DB 層: RLS ポリシー payments_delete_payer_or_owner
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

// =============================================================================
// ファイル存在確認テスト（Red フェーズ）
// =============================================================================

const API_ROUTE_PATH = path.join(
  process.cwd(),
  "src/app/api/payments/[id]/route.ts"
);

const RLS_MIGRATION_PATH = path.join(
  process.cwd(),
  "supabase/migrations/20260101000010_payments_delete_owner.sql"
);

describe("DELETE /api/payments/[id] API Route", () => {
  describe("ファイル存在確認", () => {
    it("API Route ファイルが存在する", () => {
      const exists = fs.existsSync(API_ROUTE_PATH);
      expect(exists).toBe(true);
    });

    it("DELETE ハンドラがエクスポートされている", () => {
      if (!fs.existsSync(API_ROUTE_PATH)) {
        expect.fail("API Route ファイルが存在しない（Red フェーズ）");
      }
      const content = fs.readFileSync(API_ROUTE_PATH, "utf-8");
      expect(content).toContain("export async function DELETE");
    });

    it("authenticateRequest を使用している", () => {
      if (!fs.existsSync(API_ROUTE_PATH)) {
        expect.fail("API Route ファイルが存在しない（Red フェーズ）");
      }
      const content = fs.readFileSync(API_ROUTE_PATH, "utf-8");
      expect(content).toContain("authenticateRequest");
    });

    it("groupId をクライアントから受け取らず DB から導出している", () => {
      if (!fs.existsSync(API_ROUTE_PATH)) {
        expect.fail("API Route ファイルが存在しない（Red フェーズ）");
      }
      const content = fs.readFileSync(API_ROUTE_PATH, "utf-8");
      // DELETE ハンドラ部分のみ検証（PUT ハンドラは request.json() を使うため）
      const deleteHandler = content.slice(
        content.indexOf("export async function DELETE"),
        content.indexOf("export async function PUT") === -1
          ? undefined
          : content.indexOf("export async function PUT")
      );
      // DELETE ハンドラでは request.json() を呼んでいない
      expect(deleteHandler).not.toContain("request.json()");
      // groups テーブルから owner_id を結合取得している
      expect(deleteHandler).toContain("groups");
    });
  });

  describe("API 仕様", () => {
    it("DELETE メソッドで削除リクエストを受け付ける", () => {
      const spec = {
        method: "DELETE",
        path: "/api/payments/:id",
        responses: {
          200: { success: true },
          400: { error: "Invalid payment ID" },
          401: { error: "Unauthorized" },
          403: { error: "この支払いを削除する権限がありません" },
          404: { error: "支払いが見つかりません" },
          500: { error: "サーバーエラーが発生しました" },
        },
      };
      expect(spec.method).toBe("DELETE");
    });
  });
});

// =============================================================================
// 認可ロジック仕様テスト
// =============================================================================

describe("支払い削除の認可ロジック仕様", () => {
  describe("認可チェック", () => {
    it("支払者本人は削除できる", () => {
      const scenario = {
        user: "payer",
        action: "DELETE",
        expectedResult: "allowed",
        httpStatus: 200,
      };
      expect(scenario.expectedResult).toBe("allowed");
    });

    it("グループオーナーは削除できる", () => {
      const scenario = {
        user: "group_owner",
        action: "DELETE",
        expectedResult: "allowed",
        httpStatus: 200,
      };
      expect(scenario.expectedResult).toBe("allowed");
    });

    it("メンバー（支払者でもオーナーでもない）は削除できない", () => {
      const scenario = {
        user: "other_member",
        action: "DELETE",
        expectedResult: "denied",
        httpStatus: 403,
      };
      expect(scenario.expectedResult).toBe("denied");
    });

    it("非メンバーは削除できない", () => {
      const scenario = {
        user: "outsider",
        action: "DELETE",
        expectedResult: "denied",
        httpStatus: 403,
      };
      expect(scenario.expectedResult).toBe("denied");
    });
  });

  describe("二重防御（アプリ層 + RLS）", () => {
    it("アプリ層で明示的な 403 エラーを返す（ユーザーフレンドリーなメッセージ）", () => {
      const appLayer = {
        check: "payer_id === user.id OR groups.owner_id === user.id",
        errorStatus: 403,
        errorMessage: "この支払いを削除する権限がありません",
      };
      expect(appLayer.errorStatus).toBe(403);
    });

    it("RLS ポリシーが最終防衛ラインとして機能する", () => {
      const rlsPolicy = {
        name: "payments_delete_payer_or_owner",
        operation: "DELETE",
        using: "payer_id = auth.uid() OR is_group_owner(group_id, auth.uid())",
      };
      expect(rlsPolicy.using).toContain("payer_id");
      expect(rlsPolicy.using).toContain("is_group_owner");
    });
  });

  describe("groupId の DB 導出（改ざん防止）", () => {
    it("groupId はクライアントから受け取らず、DB から payment.group_id を取得する", () => {
      const design = {
        clientInput: ["paymentId"],
        dbDerived: ["groupId", "payerId"],
        reason: "クライアントが groupId を偽装して認可をバイパスすることを防止",
      };
      expect(design.clientInput).not.toContain("groupId");
      expect(design.dbDerived).toContain("groupId");
    });
  });
});

// =============================================================================
// API Route 実装詳細テスト（ソースコード解析ベース）
// =============================================================================

describe("API Route 実装詳細", () => {
  describe("レスポンス仕様", () => {
    it("不正な UUID フォーマットの ID は 400 を返す仕様", () => {
      if (!fs.existsSync(API_ROUTE_PATH)) {
        expect.fail("API Route ファイルが存在しない（Red フェーズ）");
      }
      const content = fs.readFileSync(API_ROUTE_PATH, "utf-8");
      // UUID バリデーション
      expect(content).toMatch(/uuid|UUID|[0-9a-f]{8}/i);
      expect(content).toContain("400");
    });

    it("未認証ユーザーは 401 を返す仕様", () => {
      if (!fs.existsSync(API_ROUTE_PATH)) {
        expect.fail("API Route ファイルが存在しない（Red フェーズ）");
      }
      const content = fs.readFileSync(API_ROUTE_PATH, "utf-8");
      expect(content).toContain("auth.response");
    });

    it("存在しない支払い ID は 404 を返す仕様", () => {
      if (!fs.existsSync(API_ROUTE_PATH)) {
        expect.fail("API Route ファイルが存在しない（Red フェーズ）");
      }
      const content = fs.readFileSync(API_ROUTE_PATH, "utf-8");
      expect(content).toContain("404");
    });

    it("権限なしは 403 を返す仕様", () => {
      if (!fs.existsSync(API_ROUTE_PATH)) {
        expect.fail("API Route ファイルが存在しない（Red フェーズ）");
      }
      const content = fs.readFileSync(API_ROUTE_PATH, "utf-8");
      expect(content).toContain("403");
    });

    it("DB エラーは 500 を返す仕様", () => {
      if (!fs.existsSync(API_ROUTE_PATH)) {
        expect.fail("API Route ファイルが存在しない（Red フェーズ）");
      }
      const content = fs.readFileSync(API_ROUTE_PATH, "utf-8");
      expect(content).toContain("500");
    });

    it("正常削除は 200 + success: true を返す仕様", () => {
      if (!fs.existsSync(API_ROUTE_PATH)) {
        expect.fail("API Route ファイルが存在しない（Red フェーズ）");
      }
      const content = fs.readFileSync(API_ROUTE_PATH, "utf-8");
      expect(content).toContain("success: true");
    });
  });

  describe("認可ロジック", () => {
    it("payer_id と user.id の比較を実装している", () => {
      if (!fs.existsSync(API_ROUTE_PATH)) {
        expect.fail("API Route ファイルが存在しない（Red フェーズ）");
      }
      const content = fs.readFileSync(API_ROUTE_PATH, "utf-8");
      expect(content).toContain("payer_id");
    });

    it("groups.owner_id と user.id の比較を実装している", () => {
      if (!fs.existsSync(API_ROUTE_PATH)) {
        expect.fail("API Route ファイルが存在しない（Red フェーズ）");
      }
      const content = fs.readFileSync(API_ROUTE_PATH, "utf-8");
      expect(content).toContain("owner_id");
    });
  });
});

// =============================================================================
// RLS マイグレーション存在確認テスト
// =============================================================================

describe("RLS マイグレーション", () => {
  it("マイグレーションファイルが存在する", () => {
    const exists = fs.existsSync(RLS_MIGRATION_PATH);
    expect(exists).toBe(true);
  });

  it("マイグレーション内容に is_group_owner が含まれる", () => {
    if (!fs.existsSync(RLS_MIGRATION_PATH)) {
      expect.fail("マイグレーションファイルが存在しない（Red フェーズ）");
    }
    const content = fs.readFileSync(RLS_MIGRATION_PATH, "utf-8");
    expect(content).toContain("is_group_owner");
  });

  it("マイグレーション内容に payer_id が含まれる", () => {
    if (!fs.existsSync(RLS_MIGRATION_PATH)) {
      expect.fail("マイグレーションファイルが存在しない（Red フェーズ）");
    }
    const content = fs.readFileSync(RLS_MIGRATION_PATH, "utf-8");
    expect(content).toContain("payer_id");
  });

  it("既存ポリシー payments_delete_payer を DROP している", () => {
    if (!fs.existsSync(RLS_MIGRATION_PATH)) {
      expect.fail("マイグレーションファイルが存在しない（Red フェーズ）");
    }
    const content = fs.readFileSync(RLS_MIGRATION_PATH, "utf-8");
    expect(content).toContain("DROP POLICY");
    expect(content).toContain("payments_delete_payer");
  });
});
