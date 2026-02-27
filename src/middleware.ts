import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * Next.js ミドルウェア — 認証セッション管理の一元化
 *
 * すべてのリクエストで Supabase セッションをリフレッシュし、
 * 未ログインユーザーを /login へリダイレクトする。
 * 詳細なロジックは src/lib/supabase/middleware.ts の updateSession を参照。
 */
export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * 以下を除くすべてのパスにマッチ:
     *   - _next/static（静的ファイル）
     *   - _next/image（画像最適化）
     *   - favicon.ico、sitemap.xml、robots.txt（メタデータ）
     */
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
