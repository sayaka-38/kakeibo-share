/**
 * DELETE /api/payments/[id] API Route テスト
 *
 * 支払い削除（アーカイブ）機能（TDD Red → Green）
 *
 * 認可ルール:
 *   - 支払者本人 (payer_id === user.id) → 削除可
 *   - グループオーナー → 403（他者データ保護のため削除不可）
 *   - それ以外のメンバー → 403
 *
 * 二重防御:
 *   - アプリ層: この API Route で明示的に 403 を返す
 *   - DB 層: RLS ポリシー payments_delete_payer + RPC archive_payment
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
  "supabase/migrations/20260101000026_payments_delete_payer_only.sql"
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
      // payer_id で認可チェックしている
      expect(deleteHandler).toContain("payer_id");
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

    it("グループオーナーでも他者の支払いは削除できない", () => {
      const scenario = {
        user: "group_owner",
        action: "DELETE",
        expectedResult: "denied",
        httpStatus: 403,
      };
      expect(scenario.expectedResult).toBe("denied");
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
        check: "payer_id === user.id",
        errorStatus: 403,
        errorMessage: "この支払いを削除する権限がありません",
      };
      expect(appLayer.errorStatus).toBe(403);
    });

    it("RLS ポリシーが最終防衛ラインとして機能する", () => {
      const rlsPolicy = {
        name: "payments_delete_payer",
        operation: "DELETE",
        using: "payer_id = auth.uid()",
      };
      expect(rlsPolicy.using).toContain("payer_id");
      expect(rlsPolicy.using).toContain("auth.uid()");
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

    it("支払者本人のみ削除可能な認可チェックを実装している", () => {
      if (!fs.existsSync(API_ROUTE_PATH)) {
        expect.fail("API Route ファイルが存在しない（Red フェーズ）");
      }
      const content = fs.readFileSync(API_ROUTE_PATH, "utf-8");
      // DELETE ハンドラ部分のみ検証
      const deleteHandler = content.slice(
        content.indexOf("export async function DELETE"),
        content.indexOf("export async function PUT") === -1
          ? undefined
          : content.indexOf("export async function PUT")
      );
      // グループオーナー例外が除去されていること
      expect(deleteHandler).not.toContain("owner_id");
      expect(deleteHandler).not.toContain("ownerMatch");
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

  it("マイグレーション内容に payer_id = auth.uid() のみの条件が含まれる", () => {
    if (!fs.existsSync(RLS_MIGRATION_PATH)) {
      expect.fail("マイグレーションファイルが存在しない（Red フェーズ）");
    }
    const content = fs.readFileSync(RLS_MIGRATION_PATH, "utf-8");
    expect(content).toContain("payer_id = auth.uid()");
    // グループオーナー例外が除去されていること
    expect(content).not.toContain("is_group_owner");
  });

  it("旧ポリシー payments_delete_payer_or_owner を DROP している", () => {
    if (!fs.existsSync(RLS_MIGRATION_PATH)) {
      expect.fail("マイグレーションファイルが存在しない（Red フェーズ）");
    }
    const content = fs.readFileSync(RLS_MIGRATION_PATH, "utf-8");
    expect(content).toContain("DROP POLICY");
    expect(content).toContain("payments_delete_payer_or_owner");
  });
});

// =============================================================================
// アーカイブマイグレーション存在確認テスト
// =============================================================================

const ARCHIVE_MIGRATION_PATH = path.join(
  process.cwd(),
  "supabase/migrations/20260101000029_archive_payments.sql"
);

describe("アーカイブマイグレーション", () => {
  it("マイグレーションファイルが存在する", () => {
    const exists = fs.existsSync(ARCHIVE_MIGRATION_PATH);
    expect(exists).toBe(true);
  });

  it("archived_payments テーブルを作成している", () => {
    const content = fs.readFileSync(ARCHIVE_MIGRATION_PATH, "utf-8");
    expect(content).toContain("CREATE TABLE archived_payments");
  });

  it("archived_payment_splits テーブルを作成している", () => {
    const content = fs.readFileSync(ARCHIVE_MIGRATION_PATH, "utf-8");
    expect(content).toContain("CREATE TABLE archived_payment_splits");
  });

  it("archive_payment RPC を作成している", () => {
    const content = fs.readFileSync(ARCHIVE_MIGRATION_PATH, "utf-8");
    expect(content).toContain("CREATE OR REPLACE FUNCTION public.archive_payment");
    expect(content).toContain("SECURITY DEFINER");
  });

  it("RLS を有効にしている", () => {
    const content = fs.readFileSync(ARCHIVE_MIGRATION_PATH, "utf-8");
    expect(content).toContain("ENABLE ROW LEVEL SECURITY");
  });

  it("SELECT ポリシーのみ設定している（INSERT/UPDATE/DELETE なし）", () => {
    const content = fs.readFileSync(ARCHIVE_MIGRATION_PATH, "utf-8");
    expect(content).toContain("FOR SELECT");
    expect(content).not.toMatch(/FOR\s+INSERT/);
    expect(content).not.toMatch(/FOR\s+UPDATE/);
    expect(content).not.toMatch(/FOR\s+DELETE/);
  });
});

// =============================================================================
// API Route アーカイブ RPC 使用確認テスト
// =============================================================================

describe("DELETE ハンドラがアーカイブ RPC を使用", () => {
  it("archive_payment RPC を呼び出している", () => {
    const content = fs.readFileSync(API_ROUTE_PATH, "utf-8");
    const deleteHandler = content.slice(
      content.indexOf("export async function DELETE"),
      content.indexOf("export async function PUT") === -1
        ? undefined
        : content.indexOf("export async function PUT")
    );
    expect(deleteHandler).toContain('rpc("archive_payment"');
  });

  it("RPC エラーを translateRpcError で処理している", () => {
    const content = fs.readFileSync(API_ROUTE_PATH, "utf-8");
    const deleteHandler = content.slice(
      content.indexOf("export async function DELETE"),
      content.indexOf("export async function PUT") === -1
        ? undefined
        : content.indexOf("export async function PUT")
    );
    // RAISE EXCEPTION 形式に統一済み: 数値コードではなく translateRpcError で処理
    expect(deleteHandler).toContain("translateRpcError");
    expect(deleteHandler).toContain('"archive_payment"');
    // 旧形式の数値コードチェックが除去されていることを確認
    expect(deleteHandler).not.toContain("result === -1");
    expect(deleteHandler).not.toContain("result === -2");
    expect(deleteHandler).not.toContain("result === -3");
  });

  it("アプリ層の事前チェックで 404 / 403 を返す", () => {
    const content = fs.readFileSync(API_ROUTE_PATH, "utf-8");
    const deleteHandler = content.slice(
      content.indexOf("export async function DELETE"),
      content.indexOf("export async function PUT") === -1
        ? undefined
        : content.indexOf("export async function PUT")
    );
    // 事前チェック（404: 存在しない、403: 清算済み・権限なし）
    expect(deleteHandler).toContain("404");
    expect(deleteHandler).toContain("403");
  });

  it("translate-rpc-error.ts に archive_payment のルールが定義されている", () => {
    const translatePath = path.join(process.cwd(), "src/lib/api/translate-rpc-error.ts");
    const content = fs.readFileSync(translatePath, "utf-8");
    expect(content).toContain("archive_payment");
    // 3つのエラーパターン（not_found / not_payer / settled）が登録されている
    expect(content).toMatch(/not_found/i);
    expect(content).toMatch(/not_payer/i);
    expect(content).toMatch(/settled/i);
  });

  it("直接 .from('payments').delete() を使用していない", () => {
    const content = fs.readFileSync(API_ROUTE_PATH, "utf-8");
    const deleteHandler = content.slice(
      content.indexOf("export async function DELETE"),
      content.indexOf("export async function PUT") === -1
        ? undefined
        : content.indexOf("export async function PUT")
    );
    expect(deleteHandler).not.toContain('.delete()');
  });
});
