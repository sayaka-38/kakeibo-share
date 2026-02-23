import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api/authenticate";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { changePasswordRequestSchema } from "@/lib/validation/schemas";

/**
 * POST /api/auth/change-password
 *
 * パスワードを変更する。
 * Supabase Auth の updateUser を使用（認証済みセッション必須）。
 */
export const POST = withErrorHandler(async (request: Request) => {
  const auth = await authenticateRequest();
  if (!auth.success) return auth.response;
  const { supabase } = auth;

  const body = await request.json();
  const { newPassword } = changePasswordRequestSchema.parse(body);

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
}, "POST /api/auth/change-password");
