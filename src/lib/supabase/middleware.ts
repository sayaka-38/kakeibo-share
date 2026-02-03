import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnv } from "@/lib/env";

/**
 * 公開パス（認証不要）
 * ここに列挙されたパスは未ログインでもアクセス可能。
 * それ以外の非APIパスは未ログイン時に /login へリダイレクトする。
 */
const PUBLIC_PATHS = ["/", "/login", "/signup", "/auth/callback", "/groups/join"];

/**
 * ログイン済みユーザーがアクセスすべきでない認証ページ
 */
const AUTH_PATHS = ["/login", "/signup"];

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const { url, anonKey } = getSupabaseEnv();
  const supabase = createServerClient(url, anonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  // APIルート: セッションリフレッシュのみ（リダイレクトしない）
  if (pathname.startsWith("/api/")) {
    return supabaseResponse;
  }

  // 公開パスかどうかを判定
  const isPublicPath = PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(path + "/")
  );

  // 未ログインユーザーが非公開パスにアクセス → /login にリダイレクト
  if (!isPublicPath && !user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    return NextResponse.redirect(redirectUrl);
  }

  // ログイン済みユーザーが認証ページにアクセス → /dashboard にリダイレクト
  const isAuthPath = AUTH_PATHS.some(
    (path) => pathname === path || pathname.startsWith(path + "/")
  );
  if (isAuthPath && user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/dashboard";
    return NextResponse.redirect(redirectUrl);
  }

  return supabaseResponse;
}
