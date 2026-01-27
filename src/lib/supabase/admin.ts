import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Service Role クライアントを作成
 *
 * RLS をバイパスするため、サーバーサイドでのみ使用すること
 * - 招待コードでのグループ検索
 * - 管理者機能
 *
 * 注意: このクライアントは全てのデータにアクセスできるため、
 * クライアントサイドには絶対に公開しないこと
 */
export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY environment variable. " +
        "This is required for admin operations."
    );
  }

  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
