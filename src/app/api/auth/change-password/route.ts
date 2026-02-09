import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api/authenticate";

/**
 * POST /api/auth/change-password
 *
 * パスワードを変更する。
 * Supabase Auth の updateUser を使用（認証済みセッション必須）。
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const auth = await authenticateRequest();
    if (!auth.success) return auth.response;
    const { supabase } = auth;

    let body: { newPassword?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "リクエストボディが不正です" },
        { status: 400 }
      );
    }

    const newPassword =
      typeof body.newPassword === "string" ? body.newPassword : "";

    if (newPassword.length < 6) {
      return NextResponse.json(
        { error: "パスワードは6文字以上で入力してください" },
        { status: 400 }
      );
    }

    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      console.error("[POST /api/auth/change-password] Error:", error);
      return NextResponse.json(
        { error: "パスワードの変更に失敗しました" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[POST /api/auth/change-password] Unexpected error:", error);
    return NextResponse.json(
      { error: "サーバーエラーが発生しました" },
      { status: 500 }
    );
  }
}
