import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type AuthSuccess = {
  success: true;
  user: User;
  supabase: SupabaseClient<Database>;
};

type AuthFailure = {
  success: false;
  response: NextResponse;
};

export type AuthResult = AuthSuccess | AuthFailure;

/**
 * API Route 共通の認証ヘルパー
 *
 * Supabase クライアントを生成し、ユーザー認証を確認する。
 * 認証失敗時は 401 レスポンスを含む AuthFailure を返す。
 *
 * @example
 * const auth = await authenticateRequest();
 * if (!auth.success) return auth.response;
 * const { user, supabase } = auth;
 */
export async function authenticateRequest(): Promise<AuthResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      success: false,
      response: NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      ),
    };
  }

  return {
    success: true,
    user,
    supabase,
  };
}
