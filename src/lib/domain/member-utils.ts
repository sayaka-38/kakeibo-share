/**
 * メンバー表示名ユーティリティ
 *
 * display_name → email → fallback の順でフォールバック。
 * コンポーネント横断で統一された表示名解決を提供する。
 */

type MemberLike = {
  display_name?: string | null;
  email?: string | null;
};

/**
 * プロフィールの表示名を解決する。
 * display_name が未設定の場合は email にフォールバックし、
 * 両方とも未設定の場合は fallback 文字列を返す。
 */
export function getMemberDisplayName(
  profile: MemberLike | null | undefined,
  fallback = "Unknown"
): string {
  return profile?.display_name || profile?.email || fallback;
}
