/**
 * Supabase 接続に必要な環境変数を検証して返す
 *
 * `process.env.XXX!` の非安全な non-null assertion を排除し、
 * 未設定時に明確なエラーメッセージを提供する
 */
export function getSupabaseEnv(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url) {
    throw new Error(
      `Missing required environment variable: NEXT_PUBLIC_SUPABASE_URL. ` +
        (!anonKey
          ? "Also missing: NEXT_PUBLIC_SUPABASE_ANON_KEY. "
          : "") +
        "Check your .env.local file."
    );
  }
  if (!anonKey) {
    throw new Error(
      "Missing required environment variable: NEXT_PUBLIC_SUPABASE_ANON_KEY. " +
        "Check your .env.local file."
    );
  }

  return { url, anonKey };
}

/**
 * Cloudflare Turnstile のサイトキーを返す
 *
 * CAPTCHA はオプション機能のため、未設定時は undefined を返す。
 * undefined の場合、DemoButton は Turnstile ウィジェットを表示しない。
 */
export function getTurnstileSiteKey(): string | undefined {
  return process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
}
