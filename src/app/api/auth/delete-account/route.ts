import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAuthHandler } from "@/lib/api/with-error-handler";

/**
 * POST /api/auth/delete-account
 *
 * アカウントを匿名化して退会する。
 *
 * 処理フロー:
 *   1. anonymize_user RPC: プロフィール匿名化 + グループ退去 + クリーンアップ
 *   2. admin API: auth.users レコードを削除（再ログイン防止）
 *
 * 原子性について:
 *   - 匿名化と auth 削除は別々の操作であり、完全な原子性は保証できない。
 *   - 匿名化が先行して成功するため、auth 削除が失敗しても
 *     プロフィールは「退会済みユーザー」として扱われる。
 *   - auth 削除失敗時は SECURITY ログに記録し、クライアントは
 *     強制サインアウト（authDeletionFailed: true）を実行すること。
 *
 * データ整合性:
 *   - profiles 行は残る（FK 参照維持）。display_name = "退会済みユーザー"
 *   - payments, payment_splits は一切変更しない
 *   - settlement 関連データも保持
 */
export const POST = withAuthHandler(async (_request, { user, supabase }) => {

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
  // auth 削除に失敗した場合: JWT の有効期限（最大1時間）まで再ログイン可能な状態になる。
  // クライアントは authDeletionFailed: true を受け取ったら強制サインアウトを実行すること。
  let authDeletionFailed = false;

  try {
    const adminClient = createAdminClient();
    const { error: deleteAuthError } =
      await adminClient.auth.admin.deleteUser(user.id);

    if (deleteAuthError) {
      authDeletionFailed = true;
      // [SECURITY] profile already anonymized, but auth user remains → log for monitoring
      console.error("[SECURITY][POST /api/auth/delete-account] Auth user deletion failed:", {
        userId: user.id,
        error: deleteAuthError.message,
        note: "Profile anonymized. JWT valid until expiry.",
      });
    }
  } catch (adminError) {
    authDeletionFailed = true;
    // service role key 未設定などの環境起因エラー
    console.warn("[SECURITY][POST /api/auth/delete-account] Admin client unavailable:", adminError);
  }

  // authDeletionFailed: true の場合、クライアントは supabase.auth.signOut() を呼び出すこと
  return NextResponse.json({
    success: true,
    ...(authDeletionFailed && { authDeletionFailed: true }),
  });
}, "POST /api/auth/delete-account");
