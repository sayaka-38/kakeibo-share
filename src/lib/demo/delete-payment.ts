/**
 * 個別支払い削除機能
 *
 * デモデータの支払いのみ削除を許可し、
 * 本番データは保護する
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  validateDemoDataDeletion,
  type DemoSession,
} from "./delete-demo-data";
import { createDemoAuditLog } from "./audit-log";

export type DeletePaymentErrorCode =
  | "INVALID_INPUT"
  | "NOT_DEMO_DATA"
  | "NOT_OWNER"
  | "DATABASE_ERROR"
  | "DELETE_FAILED";

export interface DeletePaymentError {
  code: DeletePaymentErrorCode;
  message: string;
}

export interface DeletePaymentResult {
  success: boolean;
  error?: DeletePaymentError;
}

export interface DeletePaymentTarget {
  paymentId: string;
  groupId: string;
  requestedBy: string;
}

/**
 * 個別の支払いを削除する
 *
 * 削除前に validateDemoDataDeletion で検証を行い、
 * 本番データの誤削除を防止する
 *
 * @param supabase - Supabase クライアント
 * @param target - 削除対象の情報
 * @returns 削除結果
 */
export async function deletePayment(
  supabase: SupabaseClient,
  target: DeletePaymentTarget
): Promise<DeletePaymentResult> {
  // 入力バリデーション
  if (!target.paymentId || target.paymentId.trim() === "") {
    return {
      success: false,
      error: {
        code: "INVALID_INPUT",
        message: "支払いIDが指定されていません",
      },
    };
  }

  if (!target.groupId || target.groupId.trim() === "") {
    return {
      success: false,
      error: {
        code: "INVALID_INPUT",
        message: "グループIDが指定されていません",
      },
    };
  }

  if (!target.requestedBy || target.requestedBy.trim() === "") {
    return {
      success: false,
      error: {
        code: "INVALID_INPUT",
        message: "削除要求者のIDが指定されていません",
      },
    };
  }

  // 1. デモセッション一覧を取得
  const { data: sessionsData, error: fetchError } = await supabase
    .from("demo_sessions")
    .select();

  if (fetchError) {
    return {
      success: false,
      error: {
        code: "DATABASE_ERROR",
        message: "デモセッションの取得に失敗しました",
      },
    };
  }

  // 2. DemoSession 型に変換
  const demoSessions: DemoSession[] = (sessionsData || []).map(
    (session: {
      id: string;
      user_id: string;
      group_id: string;
      expires_at: string;
    }) => ({
      id: session.id,
      userId: session.user_id,
      groupId: session.group_id,
      expiresAt: new Date(session.expires_at),
    })
  );

  // 3. グループがデモデータかどうかを検証
  const validation = validateDemoDataDeletion(
    {
      type: "group",
      id: target.groupId,
      requestedBy: target.requestedBy,
    },
    demoSessions
  );

  if (!validation.allowed) {
    const errorCode = determineErrorCode(validation.reason || "");

    // 監査ログ：バリデーション拒否
    createDemoAuditLog({
      action: "VALIDATION_REJECTED",
      targetType: "group",
      targetId: `payment:${target.paymentId}`,
      requestedBy: target.requestedBy,
      success: false,
      errorCode: errorCode,
      errorMessage: validation.reason,
    });

    return {
      success: false,
      error: {
        code: errorCode,
        message: validation.reason || "削除が許可されませんでした",
      },
    };
  }

  // 4. 支払いを削除
  // 監査ログ：削除開始
  createDemoAuditLog({
    action: "DELETE_START",
    targetType: "group",
    targetId: `payment:${target.paymentId}`,
    requestedBy: target.requestedBy,
  });

  const { error: deleteError } = await supabase
    .from("payments")
    .delete()
    .eq("id", target.paymentId);

  if (deleteError) {
    // 監査ログ：削除失敗
    createDemoAuditLog({
      action: "DELETE_FAILED",
      targetType: "group",
      targetId: `payment:${target.paymentId}`,
      requestedBy: target.requestedBy,
      success: false,
      errorCode: "DELETE_FAILED",
      errorMessage: deleteError.message,
    });

    return {
      success: false,
      error: {
        code: "DELETE_FAILED",
        message: "支払いの削除に失敗しました",
      },
    };
  }

  // 監査ログ：削除成功（PAYMENT_DELETE アクション）
  createDemoAuditLog({
    action: "DELETE_SUCCESS",
    targetType: "group",
    targetId: `payment:${target.paymentId}`,
    requestedBy: target.requestedBy,
    success: true,
    deletedTables: ["payments"],
  });

  // 追加：PAYMENT_DELETE 専用ログ
  console.info(
    `[DEMO_AUDIT] ${new Date().toISOString()} | PAYMENT_DELETE | payment:${target.paymentId} | group:${target.groupId} | by:${target.requestedBy} | OK`
  );

  return { success: true };
}

/**
 * バリデーション拒否理由からエラーコードを決定する
 */
function determineErrorCode(reason: string): DeletePaymentErrorCode {
  if (reason.includes("デモデータではない")) {
    return "NOT_DEMO_DATA";
  }
  if (reason.includes("他のデモセッション")) {
    return "NOT_OWNER";
  }
  if (reason.includes("ID")) {
    return "INVALID_INPUT";
  }
  return "NOT_DEMO_DATA";
}
