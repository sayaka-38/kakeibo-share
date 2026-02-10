import { t } from "@/lib/i18n";

/**
 * Supabase Auth のエラーメッセージを日本語に変換する。
 * 既知のメッセージパターンにマッチした場合は i18n キーで返し、
 * 不明な場合は汎用エラーメッセージを返す。
 */
const ERROR_MAP: [RegExp, string][] = [
  [/invalid login credentials/i, "auth.errors.invalidCredentials"],
  [/email not confirmed/i, "auth.errors.emailNotConfirmed"],
  [/user already registered/i, "auth.errors.userAlreadyRegistered"],
  [/password.*(too short|at least|6 char)/i, "auth.errors.passwordTooShort"],
  [/rate limit|too many requests|request rate/i, "auth.errors.rateLimitExceeded"],
  [/invalid.*email|email.*invalid|not a valid email|validate email/i, "auth.errors.invalidEmail"],
  [/fetch|network|ECONNREFUSED/i, "auth.errors.networkError"],
  [/same.*(password|as old)|new password should be different/i, "auth.errors.samePassword"],
];

export function translateAuthError(message: string): string {
  for (const [pattern, key] of ERROR_MAP) {
    if (pattern.test(message)) {
      return t(key);
    }
  }
  return t("auth.errors.unknown");
}
