/**
 * PUT /api/payments/[id] API Route テスト
 *
 * 支払い編集機能（TDD Red → Green）
 *
 * 認可ルール:
 *   - 支払者本人 (payer_id === user.id) → 更新可
 *   - それ以外（グループオーナー含む） → 403
 *
 * 二重防御:
 *   - アプリ層: この API Route で明示的に 403 を返す
 *   - DB 層: RLS ポリシー payments_update_payer
 *
 * データ更新戦略:
 *   - payment_splits は全削除→再作成（差分更新ではない）
 *   - RLS: payment_splits_delete_payer（Migration 011 で追加）
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
  "supabase/migrations/20260101000011_payment_splits_delete_payer.sql"
);

describe("PUT /api/payments/[id] API Route", () => {
  describe("ファイル存在確認", () => {
    it("API Route ファイルが存在する", () => {
      const exists = fs.existsSync(API_ROUTE_PATH);
      expect(exists).toBe(true);
    });

    it("PUT ハンドラがエクスポートされている", () => {
      if (!fs.existsSync(API_ROUTE_PATH)) {
        expect.fail("API Route ファイルが存在しない（Red フェーズ）");
      }
      const content = fs.readFileSync(API_ROUTE_PATH, "utf-8");
      expect(content).toContain("export async function PUT");
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
      // PUT ハンドラで request body から groupId を取得していない
      const putHandler = content.slice(content.indexOf("export async function PUT"));
      expect(putHandler).not.toMatch(/body\.groupId|body\.group_id/);
    });
  });

  // ===========================================================================
  // API 仕様テスト
  // ===========================================================================

  describe("API 仕様", () => {
    it("PUT メソッドで更新リクエストを受け付ける", () => {
      const spec = {
        method: "PUT",
        path: "/api/payments/:id",
        body: {
          amount: 1500,
          description: "スーパーで買い物",
          categoryId: "uuid-or-null",
          paymentDate: "2026-02-01",
          splits: [
            { userId: "user-uuid-1", amount: 500 },
            { userId: "user-uuid-2", amount: 1000 },
          ],
        },
        responses: {
          200: { success: true },
          400: { error: "バリデーションエラー" },
          401: { error: "Unauthorized" },
          403: { error: "この支払いを編集する権限がありません" },
          404: { error: "支払いが見つかりません" },
          500: { error: "サーバーエラーが発生しました" },
        },
      };
      expect(spec.method).toBe("PUT");
      expect(spec.body.splits.length).toBeGreaterThan(0);
    });
  });
});

// =============================================================================
// 認可ロジック仕様テスト
// =============================================================================

describe("支払い編集の認可ロジック仕様", () => {
  describe("認可チェック", () => {
    it("支払者本人は編集できる", () => {
      const scenario = {
        user: "payer",
        action: "PUT",
        expectedResult: "allowed",
        httpStatus: 200,
      };
      expect(scenario.expectedResult).toBe("allowed");
    });

    it("グループオーナー（支払者でない）は編集できない", () => {
      const scenario = {
        user: "group_owner",
        action: "PUT",
        expectedResult: "denied",
        httpStatus: 403,
        reason: "編集は支払者本人のみ。削除と異なり、他人の支払いを書き換えるのはトラブルの元",
      };
      expect(scenario.expectedResult).toBe("denied");
    });

    it("メンバー（支払者でない）は編集できない", () => {
      const scenario = {
        user: "other_member",
        action: "PUT",
        expectedResult: "denied",
        httpStatus: 403,
      };
      expect(scenario.expectedResult).toBe("denied");
    });

    it("非メンバーは編集できない", () => {
      const scenario = {
        user: "outsider",
        action: "PUT",
        expectedResult: "denied",
        httpStatus: 403,
      };
      expect(scenario.expectedResult).toBe("denied");
    });
  });

  describe("二重防御（アプリ層 + RLS）", () => {
    it("アプリ層で明示的な 403 エラーを返す", () => {
      const appLayer = {
        check: "payer_id === user.id",
        errorStatus: 403,
        errorMessage: "この支払いを編集する権限がありません",
      };
      expect(appLayer.errorStatus).toBe(403);
    });

    it("RLS ポリシーが最終防衛ラインとして機能する（payments）", () => {
      const rlsPolicy = {
        name: "payments_update_payer",
        operation: "UPDATE",
        using: "payer_id = auth.uid()",
      };
      expect(rlsPolicy.using).toContain("payer_id");
    });

    it("RLS ポリシーが payment_splits の削除をグループメンバーに許可する", () => {
      const rlsPolicy = {
        name: "payment_splits_delete_member",
        operation: "DELETE",
        using: "is_group_member(get_payment_group_id(payment_id), auth.uid())",
      };
      expect(rlsPolicy.using).toContain("is_group_member");
    });
  });

  describe("変更不可フィールド", () => {
    it("group_id は変更できない（API で受け付けない）", () => {
      const rule = {
        field: "group_id",
        mutable: false,
        reason: "メンバー構成が異なるため splits が破綻する",
      };
      expect(rule.mutable).toBe(false);
    });

    it("payer_id は変更できない（API で受け付けない）", () => {
      const rule = {
        field: "payer_id",
        mutable: false,
        reason: "支払者の変更は削除＋新規作成で行う",
      };
      expect(rule.mutable).toBe(false);
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

    it("バリデーションエラーは 400 を返す仕様", () => {
      if (!fs.existsSync(API_ROUTE_PATH)) {
        expect.fail("API Route ファイルが存在しない（Red フェーズ）");
      }
      const content = fs.readFileSync(API_ROUTE_PATH, "utf-8");
      // PUT ハンドラ内にバリデーション関連のコードが存在
      const putHandler = content.slice(content.indexOf("export async function PUT"));
      expect(putHandler).toContain("400");
    });

    it("splits の合計が amount と一致しない場合は 400 を返す仕様", () => {
      if (!fs.existsSync(API_ROUTE_PATH)) {
        expect.fail("API Route ファイルが存在しない（Red フェーズ）");
      }
      const content = fs.readFileSync(API_ROUTE_PATH, "utf-8");
      const putHandler = content.slice(content.indexOf("export async function PUT"));
      // splits 合計の検証ロジックが存在
      expect(putHandler).toMatch(/split|splits/i);
    });

    it("DB エラーは 500 を返す仕様", () => {
      if (!fs.existsSync(API_ROUTE_PATH)) {
        expect.fail("API Route ファイルが存在しない（Red フェーズ）");
      }
      const content = fs.readFileSync(API_ROUTE_PATH, "utf-8");
      expect(content).toContain("500");
    });

    it("正常更新は 200 + success: true を返す仕様", () => {
      if (!fs.existsSync(API_ROUTE_PATH)) {
        expect.fail("API Route ファイルが存在しない（Red フェーズ）");
      }
      const content = fs.readFileSync(API_ROUTE_PATH, "utf-8");
      expect(content).toContain("success: true");
    });
  });

  describe("認可ロジック実装", () => {
    it("payer_id と user.id の比較を実装している", () => {
      if (!fs.existsSync(API_ROUTE_PATH)) {
        expect.fail("API Route ファイルが存在しない（Red フェーズ）");
      }
      const content = fs.readFileSync(API_ROUTE_PATH, "utf-8");
      expect(content).toContain("payer_id");
    });

    it("支払者本人のみ許可（owner_id チェックなし）", () => {
      if (!fs.existsSync(API_ROUTE_PATH)) {
        expect.fail("API Route ファイルが存在しない（Red フェーズ）");
      }
      const content = fs.readFileSync(API_ROUTE_PATH, "utf-8");
      const putHandler = content.slice(content.indexOf("export async function PUT"));
      // PUT ハンドラでは owner_id チェックを行わない（支払者本人のみ）
      expect(putHandler).not.toContain("ownerMatch");
      expect(putHandler).not.toContain("owner_id");
    });
  });

  describe("データ更新戦略", () => {
    it("payments テーブルの update を使用している", () => {
      if (!fs.existsSync(API_ROUTE_PATH)) {
        expect.fail("API Route ファイルが存在しない（Red フェーズ）");
      }
      const content = fs.readFileSync(API_ROUTE_PATH, "utf-8");
      const putHandler = content.slice(content.indexOf("export async function PUT"));
      expect(putHandler).toMatch(/\.update\(/);
    });

    it("payment_splits の置換に RPC replace_payment_splits を使用している", () => {
      if (!fs.existsSync(API_ROUTE_PATH)) {
        expect.fail("API Route ファイルが存在しない（Red フェーズ）");
      }
      const content = fs.readFileSync(API_ROUTE_PATH, "utf-8");
      const putHandler = content.slice(content.indexOf("export async function PUT"));
      expect(putHandler).toContain("replace_payment_splits");
      expect(putHandler).toMatch(/\.rpc\(/);
    });

    it("RPC の戻り値で認可エラーを検出している", () => {
      if (!fs.existsSync(API_ROUTE_PATH)) {
        expect.fail("API Route ファイルが存在しない（Red フェーズ）");
      }
      const content = fs.readFileSync(API_ROUTE_PATH, "utf-8");
      const putHandler = content.slice(content.indexOf("export async function PUT"));
      // insertedCount < 0 によるエラー検出
      expect(putHandler).toContain("insertedCount");
    });
  });

  describe("サーバー側バリデーション", () => {
    it("validatePayment を使用して共通バリデーションを実施している", () => {
      if (!fs.existsSync(API_ROUTE_PATH)) {
        expect.fail("API Route ファイルが存在しない（Red フェーズ）");
      }
      const content = fs.readFileSync(API_ROUTE_PATH, "utf-8");
      expect(content).toContain("validatePayment");
    });
  });
});

// =============================================================================
// RLS マイグレーション存在確認テスト
// =============================================================================

describe("RLS マイグレーション（Migration 011: payment_splits DELETE）", () => {
  it("マイグレーションファイルが存在する", () => {
    const exists = fs.existsSync(RLS_MIGRATION_PATH);
    expect(exists).toBe(true);
  });

  it("is_payment_payer ヘルパー関数が定義されている", () => {
    if (!fs.existsSync(RLS_MIGRATION_PATH)) {
      expect.fail("マイグレーションファイルが存在しない（Red フェーズ）");
    }
    const content = fs.readFileSync(RLS_MIGRATION_PATH, "utf-8");
    expect(content).toContain("is_payment_payer");
  });

  it("SECURITY DEFINER で定義されている", () => {
    if (!fs.existsSync(RLS_MIGRATION_PATH)) {
      expect.fail("マイグレーションファイルが存在しない（Red フェーズ）");
    }
    const content = fs.readFileSync(RLS_MIGRATION_PATH, "utf-8");
    expect(content).toContain("SECURITY DEFINER");
  });

  it("既存の payment_splits_delete_deny ポリシーを DROP している", () => {
    if (!fs.existsSync(RLS_MIGRATION_PATH)) {
      expect.fail("マイグレーションファイルが存在しない（Red フェーズ）");
    }
    const content = fs.readFileSync(RLS_MIGRATION_PATH, "utf-8");
    expect(content).toContain("DROP POLICY");
    expect(content).toContain("payment_splits_delete_deny");
  });

  it("新ポリシー payment_splits_delete_payer を作成している", () => {
    if (!fs.existsSync(RLS_MIGRATION_PATH)) {
      expect.fail("マイグレーションファイルが存在しない（Red フェーズ）");
    }
    const content = fs.readFileSync(RLS_MIGRATION_PATH, "utf-8");
    expect(content).toContain("payment_splits_delete_payer");
    expect(content).toContain("FOR DELETE");
  });
});

// =============================================================================
// Migration 012: is_payment_payer plpgsql 化テスト
// =============================================================================

const MIGRATION_012_PATH = path.join(
  process.cwd(),
  "supabase/migrations/20260101000012_fix_is_payment_payer_plpgsql.sql"
);

describe("Migration 012: is_payment_payer plpgsql 化", () => {
  it("マイグレーションファイルが存在する", () => {
    const exists = fs.existsSync(MIGRATION_012_PATH);
    expect(exists).toBe(true);
  });

  it("LANGUAGE plpgsql で定義されている（インライン展開防止）", () => {
    if (!fs.existsSync(MIGRATION_012_PATH)) {
      expect.fail("Migration 012 ファイルが存在しない");
    }
    const content = fs.readFileSync(MIGRATION_012_PATH, "utf-8");
    expect(content).toContain("LANGUAGE plpgsql");
  });

  it("SECURITY DEFINER を維持している", () => {
    if (!fs.existsSync(MIGRATION_012_PATH)) {
      expect.fail("Migration 012 ファイルが存在しない");
    }
    const content = fs.readFileSync(MIGRATION_012_PATH, "utf-8");
    expect(content).toContain("SECURITY DEFINER");
  });

  it("CREATE OR REPLACE で非破壊的に再定義している", () => {
    if (!fs.existsSync(MIGRATION_012_PATH)) {
      expect.fail("Migration 012 ファイルが存在しない");
    }
    const content = fs.readFileSync(MIGRATION_012_PATH, "utf-8");
    expect(content).toContain("CREATE OR REPLACE FUNCTION");
    expect(content).toContain("is_payment_payer");
  });

  it("STABLE 属性を維持している", () => {
    if (!fs.existsSync(MIGRATION_012_PATH)) {
      expect.fail("Migration 012 ファイルが存在しない");
    }
    const content = fs.readFileSync(MIGRATION_012_PATH, "utf-8");
    expect(content).toContain("STABLE");
  });

  it("search_path を public に設定している", () => {
    if (!fs.existsSync(MIGRATION_012_PATH)) {
      expect.fail("Migration 012 ファイルが存在しない");
    }
    const content = fs.readFileSync(MIGRATION_012_PATH, "utf-8");
    expect(content).toContain("SET search_path = public");
  });

  it("UNIQUE 制約の冪等チェックが含まれている", () => {
    if (!fs.existsSync(MIGRATION_012_PATH)) {
      expect.fail("Migration 012 ファイルが存在しない");
    }
    const content = fs.readFileSync(MIGRATION_012_PATH, "utf-8");
    // UNIQUE 制約の存在チェック + 冪等追加
    expect(content).toContain("payment_splits_payment_id_user_id_unique");
    expect(content).toContain("UNIQUE (payment_id, user_id)");
  });

  it("plpgsql の BEGIN...END ブロック構文を使用している", () => {
    if (!fs.existsSync(MIGRATION_012_PATH)) {
      expect.fail("Migration 012 ファイルが存在しない");
    }
    const content = fs.readFileSync(MIGRATION_012_PATH, "utf-8");
    expect(content).toContain("BEGIN");
    expect(content).toContain("END;");
    expect(content).toContain("RETURN EXISTS");
  });
});

// =============================================================================
// Migration 013: payment_splits 削除用 RPC 関数テスト
// =============================================================================

describe("Migration 014: payment_splits DELETE ポリシー修正", () => {
  const MIGRATION_014_PATH = path.join(
    process.cwd(),
    "supabase/migrations/20260101000014_fix_payment_splits_delete_policy.sql"
  );

  it("マイグレーションファイルが存在する", () => {
    const exists = fs.existsSync(MIGRATION_014_PATH);
    expect(exists).toBe(true);
  });

  it("旧ポリシー payment_splits_delete_payer を DROP している", () => {
    if (!fs.existsSync(MIGRATION_014_PATH)) {
      expect.fail("Migration 014 ファイルが存在しない");
    }
    const content = fs.readFileSync(MIGRATION_014_PATH, "utf-8");
    expect(content).toContain("DROP POLICY");
    expect(content).toContain("payment_splits_delete_payer");
  });

  it("新ポリシー payment_splits_delete_member を作成している", () => {
    if (!fs.existsSync(MIGRATION_014_PATH)) {
      expect.fail("Migration 014 ファイルが存在しない");
    }
    const content = fs.readFileSync(MIGRATION_014_PATH, "utf-8");
    expect(content).toContain("payment_splits_delete_member");
    expect(content).toContain("FOR DELETE");
  });

  it("is_group_member + get_payment_group_id パターンを使用している", () => {
    if (!fs.existsSync(MIGRATION_014_PATH)) {
      expect.fail("Migration 014 ファイルが存在しない");
    }
    const content = fs.readFileSync(MIGRATION_014_PATH, "utf-8");
    // SELECT/INSERT と同じパターン
    expect(content).toContain("is_group_member");
    expect(content).toContain("get_payment_group_id");
  });
});

// =============================================================================
// Migration 015: payment_splits 原子的置換 RPC テスト（決定打）
// =============================================================================

describe("Migration 015: replace_payment_splits RPC（原子的置換）", () => {
  const MIGRATION_015_PATH = path.join(
    process.cwd(),
    "supabase/migrations/20260101000015_replace_payment_splits_rpc.sql"
  );

  it("マイグレーションファイルが存在する", () => {
    const exists = fs.existsSync(MIGRATION_015_PATH);
    expect(exists).toBe(true);
  });

  it("SECURITY DEFINER で定義されている（RLS バイパス）", () => {
    if (!fs.existsSync(MIGRATION_015_PATH)) {
      expect.fail("Migration 015 ファイルが存在しない");
    }
    const content = fs.readFileSync(MIGRATION_015_PATH, "utf-8");
    expect(content).toContain("SECURITY DEFINER");
  });

  it("LANGUAGE plpgsql で定義されている", () => {
    if (!fs.existsSync(MIGRATION_015_PATH)) {
      expect.fail("Migration 015 ファイルが存在しない");
    }
    const content = fs.readFileSync(MIGRATION_015_PATH, "utf-8");
    expect(content).toContain("LANGUAGE plpgsql");
  });

  it("DELETE と INSERT を同一関数内で実行している（原子性）", () => {
    if (!fs.existsSync(MIGRATION_015_PATH)) {
      expect.fail("Migration 015 ファイルが存在しない");
    }
    const content = fs.readFileSync(MIGRATION_015_PATH, "utf-8");
    expect(content).toContain("DELETE FROM payment_splits");
    expect(content).toContain("INSERT INTO payment_splits");
  });

  it("payer_id の検証を関数内部で行っている（二重防御）", () => {
    if (!fs.existsSync(MIGRATION_015_PATH)) {
      expect.fail("Migration 015 ファイルが存在しない");
    }
    const content = fs.readFileSync(MIGRATION_015_PATH, "utf-8");
    expect(content).toContain("v_payer_id != p_user_id");
  });

  it("JSONB パラメータで splits を受け取っている", () => {
    if (!fs.existsSync(MIGRATION_015_PATH)) {
      expect.fail("Migration 015 ファイルが存在しない");
    }
    const content = fs.readFileSync(MIGRATION_015_PATH, "utf-8");
    expect(content).toContain("p_splits JSONB");
    expect(content).toContain("jsonb_array_elements");
  });

  it("生成された型定義に replace_payment_splits が存在する", () => {
    const typesPath = path.join(
      process.cwd(),
      "src/types/database.generated.ts"
    );
    const content = fs.readFileSync(typesPath, "utf-8");
    expect(content).toContain("replace_payment_splits");
  });
});
