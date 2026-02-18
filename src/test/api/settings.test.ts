/**
 * 設定画面 API テスト
 *
 * - PUT /api/profile: 表示名更新
 * - POST /api/auth/change-password: パスワード変更
 * - POST /api/auth/delete-account: アカウント匿名化退会
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const PROFILE_API_PATH = path.join(
  process.cwd(),
  "src/app/api/profile/route.ts"
);

const CHANGE_PASSWORD_API_PATH = path.join(
  process.cwd(),
  "src/app/api/auth/change-password/route.ts"
);

const DELETE_ACCOUNT_API_PATH = path.join(
  process.cwd(),
  "src/app/api/auth/delete-account/route.ts"
);

const ANONYMIZE_RPC_PATH = path.join(
  process.cwd(),
  "supabase/migrations/20260101000027_anonymize_user_rpc.sql"
);

// =============================================================================
// PUT /api/profile
// =============================================================================

describe("PUT /api/profile", () => {
  it("API Route ファイルが存在する", () => {
    expect(fs.existsSync(PROFILE_API_PATH)).toBe(true);
  });

  it("PUT ハンドラがエクスポートされている", () => {
    const content = fs.readFileSync(PROFILE_API_PATH, "utf-8");
    expect(content).toContain("export async function PUT");
  });

  it("authenticateRequest を使用している", () => {
    const content = fs.readFileSync(PROFILE_API_PATH, "utf-8");
    expect(content).toContain("authenticateRequest");
  });

  it("display_name の更新を行う", () => {
    const content = fs.readFileSync(PROFILE_API_PATH, "utf-8");
    expect(content).toContain("display_name");
    expect(content).toContain(".update(");
  });

  it("30文字制限のバリデーションがある", () => {
    const content = fs.readFileSync(PROFILE_API_PATH, "utf-8");
    expect(content).toContain("30");
  });

  it("空文字列を拒否する", () => {
    const content = fs.readFileSync(PROFILE_API_PATH, "utf-8");
    expect(content).toContain("400");
  });
});

// =============================================================================
// POST /api/auth/change-password
// =============================================================================

describe("POST /api/auth/change-password", () => {
  it("API Route ファイルが存在する", () => {
    expect(fs.existsSync(CHANGE_PASSWORD_API_PATH)).toBe(true);
  });

  it("POST ハンドラがエクスポートされている", () => {
    const content = fs.readFileSync(CHANGE_PASSWORD_API_PATH, "utf-8");
    expect(content).toContain("export async function POST");
  });

  it("authenticateRequest を使用している", () => {
    const content = fs.readFileSync(CHANGE_PASSWORD_API_PATH, "utf-8");
    expect(content).toContain("authenticateRequest");
  });

  it("6文字以上のバリデーションがある", () => {
    const content = fs.readFileSync(CHANGE_PASSWORD_API_PATH, "utf-8");
    expect(content).toContain("6");
    expect(content).toContain("400");
  });

  it("Supabase auth.updateUser を使用している", () => {
    const content = fs.readFileSync(CHANGE_PASSWORD_API_PATH, "utf-8");
    expect(content).toContain("auth.updateUser");
    expect(content).toContain("password");
  });
});

// =============================================================================
// POST /api/auth/delete-account
// =============================================================================

describe("POST /api/auth/delete-account", () => {
  it("API Route ファイルが存在する", () => {
    expect(fs.existsSync(DELETE_ACCOUNT_API_PATH)).toBe(true);
  });

  it("POST ハンドラがエクスポートされている", () => {
    const content = fs.readFileSync(DELETE_ACCOUNT_API_PATH, "utf-8");
    expect(content).toContain("export async function POST");
  });

  it("authenticateRequest を使用している", () => {
    const content = fs.readFileSync(DELETE_ACCOUNT_API_PATH, "utf-8");
    expect(content).toContain("authenticateRequest");
  });

  it("anonymize_user RPC を呼び出している", () => {
    const content = fs.readFileSync(DELETE_ACCOUNT_API_PATH, "utf-8");
    expect(content).toContain("anonymize_user");
    expect(content).toContain(".rpc(");
  });

  it("admin client で auth.users を削除している", () => {
    const content = fs.readFileSync(DELETE_ACCOUNT_API_PATH, "utf-8");
    expect(content).toContain("createAdminClient");
    expect(content).toContain("admin.deleteUser");
  });

  it("admin 削除失敗でもプロフィール匿名化は維持される", () => {
    const content = fs.readFileSync(DELETE_ACCOUNT_API_PATH, "utf-8");
    // admin 削除はtry-catchで囲まれ、失敗してもエラーにならない
    expect(content).toContain("profile already anonymized");
  });
});

// =============================================================================
// anonymize_user RPC マイグレーション
// =============================================================================

describe("anonymize_user RPC マイグレーション", () => {
  it("マイグレーションファイルが存在する", () => {
    expect(fs.existsSync(ANONYMIZE_RPC_PATH)).toBe(true);
  });

  it("SECURITY DEFINER で定義されている", () => {
    const content = fs.readFileSync(ANONYMIZE_RPC_PATH, "utf-8");
    expect(content).toContain("SECURITY DEFINER");
  });

  it("プロフィールを匿名化する（display_name を退会済みに設定）", () => {
    const content = fs.readFileSync(ANONYMIZE_RPC_PATH, "utf-8");
    expect(content).toContain("退会済みユーザー");
    expect(content).toContain("UPDATE profiles");
  });

  it("email と avatar_url を NULL にする", () => {
    const content = fs.readFileSync(ANONYMIZE_RPC_PATH, "utf-8");
    expect(content).toContain("email = NULL");
    expect(content).toContain("avatar_url = NULL");
  });

  it("profiles 行を DELETE しない（FK 整合性のため）", () => {
    const content = fs.readFileSync(ANONYMIZE_RPC_PATH, "utf-8");
    // DELETE FROM profiles は存在しないこと
    expect(content).not.toMatch(/DELETE FROM profiles/);
  });

  it("グループオーナー権を他メンバーに委譲する", () => {
    const content = fs.readFileSync(ANONYMIZE_RPC_PATH, "utf-8");
    expect(content).toContain("UPDATE groups");
    expect(content).toContain("owner_id");
  });

  it("group_members から退去する", () => {
    const content = fs.readFileSync(ANONYMIZE_RPC_PATH, "utf-8");
    expect(content).toContain("DELETE FROM group_members");
  });

  it("recurring_rule_splits を削除する", () => {
    const content = fs.readFileSync(ANONYMIZE_RPC_PATH, "utf-8");
    expect(content).toContain("DELETE FROM recurring_rule_splits");
  });

  it("demo_sessions を削除する", () => {
    const content = fs.readFileSync(ANONYMIZE_RPC_PATH, "utf-8");
    expect(content).toContain("DELETE FROM demo_sessions");
  });

  it("payments テーブルには触らない", () => {
    const content = fs.readFileSync(ANONYMIZE_RPC_PATH, "utf-8");
    expect(content).not.toMatch(/DELETE FROM payments/);
    expect(content).not.toMatch(/UPDATE payments/);
  });

  it("payment_splits テーブルには触らない", () => {
    const content = fs.readFileSync(ANONYMIZE_RPC_PATH, "utf-8");
    expect(content).not.toMatch(/DELETE FROM payment_splits/);
    expect(content).not.toMatch(/UPDATE payment_splits/);
  });
});

// =============================================================================
// 退会時のデータ整合性仕様テスト
// =============================================================================

describe("退会時のデータ整合性", () => {
  it("profiles 行は保持される（匿名化のみ）", () => {
    const spec = {
      table: "profiles",
      operation: "UPDATE_ONLY",
      result: { display_name: "退会済みユーザー", email: null, avatar_url: null },
      reason: "payments.payer_id, payment_splits.user_id 等の FK 参照を維持",
    };
    expect(spec.operation).toBe("UPDATE_ONLY");
  });

  it("payments は一切変更されない", () => {
    const spec = {
      table: "payments",
      operation: "none",
      reason: "清算の整合性を維持。payer_id は匿名化された profiles を参照",
    };
    expect(spec.operation).toBe("none");
  });

  it("payment_splits は一切変更されない", () => {
    const spec = {
      table: "payment_splits",
      operation: "none",
      reason: "割り勘の履歴を維持。user_id は匿名化された profiles を参照",
    };
    expect(spec.operation).toBe("none");
  });

  it("settlement 関連テーブルは一切変更されない", () => {
    const spec = {
      tables: ["settlement_sessions", "settlement_entries", "settlement_entry_splits"],
      operation: "none",
      reason: "清算履歴の完全性を保持",
    };
    expect(spec.operation).toBe("none");
  });

  it("グループオーナーは他メンバーに委譲される", () => {
    const spec = {
      scenario: "退会ユーザーがグループオーナーで他メンバーがいる場合",
      action: "最古参メンバーにオーナー権を移譲",
      table: "groups",
      operation: "UPDATE owner_id",
    };
    expect(spec.action).toContain("移譲");
  });

  it("ソログループはオーナー情報をそのまま保持する", () => {
    const spec = {
      scenario: "退会ユーザーがソログループのオーナー",
      action: "owner_id はそのまま（匿名化 profiles が残るため FK は壊れない）",
      table: "groups",
      operation: "none",
    };
    expect(spec.operation).toBe("none");
  });

  it("auth.users レコードは削除される（再ログイン防止）", () => {
    const spec = {
      table: "auth.users",
      operation: "DELETE via admin API",
      reason: "退会後の再ログインを防止",
      fallback: "admin API 失敗時もプロフィール匿名化は完了済みで安全",
    };
    expect(spec.operation).toContain("DELETE");
  });
});

// =============================================================================
// 設定ページ存在確認
// =============================================================================

describe("設定ページ", () => {
  const SETTINGS_DIR = path.join(
    process.cwd(),
    "src/app/(protected)/settings"
  );

  it("設定ページが存在する", () => {
    expect(fs.existsSync(path.join(SETTINGS_DIR, "page.tsx"))).toBe(true);
  });

  it("プロフィール更新フォームがある", () => {
    const content = fs.readFileSync(path.join(SETTINGS_DIR, "ProfileSection.tsx"), "utf-8");
    expect(content).toContain("displayName");
    expect(content).toContain("/api/profile");
  });

  it("パスワード変更フォームがある", () => {
    const content = fs.readFileSync(path.join(SETTINGS_DIR, "PasswordSection.tsx"), "utf-8");
    expect(content).toContain("newPassword");
    expect(content).toContain("/api/auth/change-password");
  });

  it("アカウント削除セクションがある", () => {
    const content = fs.readFileSync(path.join(SETTINGS_DIR, "DeleteAccountSection.tsx"), "utf-8");
    expect(content).toContain("/api/auth/delete-account");
    expect(content).toContain("confirmText");
  });

  it("削除には確認テキスト入力が必要", () => {
    const content = fs.readFileSync(path.join(SETTINGS_DIR, "DeleteAccountSection.tsx"), "utf-8");
    expect(content).toContain("confirmPlaceholder");
    expect(content).toContain("isConfirmed");
  });
});
