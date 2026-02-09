import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api/authenticate";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/auth/delete-account
 *
 * アカウントを匿名化して退会する。
 *
 * 処理フロー:
 *   1. anonymize_user RPC: プロフィール匿名化 + グループ退去 + クリーンアップ
 *   2. admin API: auth.users レコードを削除（再ログイン防止）
 *
 * データ整合性:
 *   - profiles 行は残る（FK 参照維持）。display_name = "退会済みユーザー"
 *   - payments, payment_splits は一切変更しない
 *   - settlement 関連データも保持
 */
export async function POST(): Promise<NextResponse> {
  try {
    const auth = await authenticateRequest();
    if (!auth.success) return auth.response;
    const { user, supabase } = auth;

    // 1. プロフィール匿名化 + 関連データ整理（RPC）
    const { data: anonymized, error: rpcError } = await supabase.rpc(
      "anonymize_user",
      { p_user_id: user.id }
    );

    if (rpcError) {
      console.error("[POST /api/auth/delete-account] RPC error:", rpcError);
      return NextResponse.json(
        { error: "アカウントの匿名化に失敗しました" },
        { status: 500 }
      );
    }

    if (!anonymized) {
      return NextResponse.json(
        { error: "ユーザーが見つかりません" },
        { status: 404 }
      );
    }

    // 2. auth.users レコードを削除（admin 権限が必要）
    try {
      const adminClient = createAdminClient();
      const { error: deleteAuthError } =
        await adminClient.auth.admin.deleteUser(user.id);

      if (deleteAuthError) {
        // auth 削除に失敗しても、プロフィールは既に匿名化済み
        // ログに記録し、成功として扱う（ユーザーは既に実質退会済み）
        console.error(
          "[POST /api/auth/delete-account] Auth deletion failed (profile already anonymized):",
          deleteAuthError
        );
      }
    } catch (adminError) {
      // service role key が未設定の場合など
      // プロフィール匿名化は完了しているため、警告のみ
      console.warn(
        "[POST /api/auth/delete-account] Admin client unavailable (profile already anonymized):",
        adminError
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[POST /api/auth/delete-account] Unexpected error:", error);
    return NextResponse.json(
      { error: "サーバーエラーが発生しました" },
      { status: 500 }
    );
  }
}
