/**
 * デモセッション作成 — Edge Function ラッパー
 *
 * クライアント側の直接 DB 操作を廃止し、
 * `create-demo` Edge Function を経由することで:
 *  - Cloudflare Turnstile によるボット対策
 *  - service_role による最小権限の原則
 *  - アトミックなトランザクション
 * を実現する。
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { t } from "@/lib/i18n";
import { translateHttpError } from "@/lib/api/translate-rpc-error";

export type DemoSessionErrorCode =
  | "AUTH_FAILED"
  | "PROFILE_CREATION_FAILED"
  | "GROUP_CREATION_FAILED"
  | "SESSION_CREATION_FAILED"
  | "CAPTCHA_FAILED"
  | "RATE_LIMITED"
  | "NETWORK_ERROR";

export interface DemoSessionError {
  code: DemoSessionErrorCode;
  message: string;
}

export interface DemoSessionData {
  sessionId: string;
  userId: string;
  groupId: string;
  expiresAt: Date;
}

export interface CreateDemoSessionResult {
  success: boolean;
  data?: DemoSessionData;
  error?: DemoSessionError;
}

/**
 * デモセッションを作成する
 *
 * `create-demo` Edge Function を呼び出し、
 * 返却されたセッションをブラウザにセットして認証状態を確立する。
 *
 * @param supabase - Supabase ブラウザクライアント
 * @param turnstileToken - Cloudflare Turnstile トークン（任意）
 */
export async function createDemoSession(
  supabase: SupabaseClient,
  turnstileToken?: string
): Promise<CreateDemoSessionResult> {
  try {
    const { data, error } = await supabase.functions.invoke("create-demo", {
      body: { turnstileToken: turnstileToken ?? null },
    });

    if (error) {
      // FunctionsHttpError の場合 error.context.status、
      // リレーエラーの場合 error.status に HTTP ステータスコードが格納される
      const httpStatus = extractHttpStatus(error);
      if (httpStatus === 429) {
        return {
          success: false,
          error: { code: "RATE_LIMITED", message: translateHttpError(429) },
        };
      }
      return {
        success: false,
        error: { code: "NETWORK_ERROR", message: t("common.error") },
      };
    }

    if (!data?.success) {
      return {
        success: false,
        error: data?.error ?? {
          code: "NETWORK_ERROR",
          message: t("common.error"),
        },
      };
    }

    // Edge Function から返却されたセッションをブラウザにセット
    if (data.session) {
      await supabase.auth.setSession(data.session);
    }

    return {
      success: true,
      data: {
        sessionId: data.sessionId,
        userId: data.userId,
        groupId: data.groupId,
        expiresAt: new Date(data.expiresAt),
      },
    };
  } catch {
    return {
      success: false,
      error: { code: "NETWORK_ERROR", message: t("common.error") },
    };
  }
}

/** Supabase FunctionsHttpError / FunctionsRelayError から HTTP ステータスコードを取り出す */
function extractHttpStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const e = error as Record<string, unknown>;
  const fromContext =
    typeof e.context === "object" && e.context !== null
      ? (e.context as Record<string, unknown>).status
      : undefined;
  return typeof fromContext === "number"
    ? fromContext
    : typeof e.status === "number"
      ? e.status
      : undefined;
}
