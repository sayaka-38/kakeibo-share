/**
 * デモセッション削除機能
 *
 * validateDemoDataDeletion を使用して、
 * 本番データを誤って削除しないよう保護しながら削除を実行する
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  validateDemoDataDeletion,
  type DemoSession,
  type DeletionTarget,
} from "./delete-demo-data";
import { createDemoAuditLog } from "./audit-log";

export type DeleteDemoSessionErrorCode =
  | "INVALID_INPUT"
  | "NOT_DEMO_DATA"
  | "NOT_OWNER"
  | "DATABASE_ERROR"
  | "DELETE_FAILED";

export interface DeleteDemoSessionError {
  code: DeleteDemoSessionErrorCode;
  message: string;
}

export interface DeleteDemoSessionResult {
  success: boolean;
  error?: DeleteDemoSessionError;
}

export interface DeleteTarget {
  type: "group" | "user";
  id: string;
  requestedBy: string;
}

/**
 * デモセッションとその関連データを削除する
 *
 * 削除前に validateDemoDataDeletion で検証を行い、
 * 本番データの誤削除を防止する
 *
 * @param supabase - Supabase クライアント
 * @param target - 削除対象の情報
 * @returns 削除結果
 */
export async function deleteDemoSession(
  supabase: SupabaseClient,
  target: DeleteTarget
): Promise<DeleteDemoSessionResult> {
  // 入力バリデーション
  if (!target.id || target.id.trim() === "") {
    return {
      success: false,
      error: {
        code: "INVALID_INPUT",
        message: "削除対象のIDが指定されていません",
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

  // 3. validateDemoDataDeletion で検証
  const deletionTarget: DeletionTarget = {
    type: target.type,
    id: target.id,
    requestedBy: target.requestedBy,
  };

  const validation = validateDemoDataDeletion(deletionTarget, demoSessions);

  if (!validation.allowed) {
    // 拒否理由に応じてエラーコードを決定
    const errorCode = determineErrorCode(validation.reason || "");

    // 監査ログ：バリデーション拒否
    createDemoAuditLog({
      action: "VALIDATION_REJECTED",
      targetType: target.type,
      targetId: target.id,
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

  // 4. グループ削除の場合、関連データを順番に削除
  if (target.type === "group") {
    // 監査ログ：削除開始
    createDemoAuditLog({
      action: "DELETE_START",
      targetType: target.type,
      targetId: target.id,
      requestedBy: target.requestedBy,
    });

    const deletedTables: string[] = [];

    try {
      // 支払いデータを削除
      const { error: paymentsError } = await supabase
        .from("payments")
        .delete()
        .eq("group_id", target.id);

      if (paymentsError) {
        throw new Error("payments deletion failed");
      }
      deletedTables.push("payments");

      // グループメンバーを削除
      const { error: membersError } = await supabase
        .from("group_members")
        .delete()
        .eq("group_id", target.id);

      if (membersError) {
        throw new Error("group_members deletion failed");
      }
      deletedTables.push("group_members");

      // グループを削除
      const { error: groupError } = await supabase
        .from("groups")
        .delete()
        .eq("id", target.id);

      if (groupError) {
        throw new Error("groups deletion failed");
      }
      deletedTables.push("groups");

      // デモセッションを削除
      const { error: sessionError } = await supabase
        .from("demo_sessions")
        .delete()
        .eq("group_id", target.id);

      if (sessionError) {
        throw new Error("demo_sessions deletion failed");
      }
      deletedTables.push("demo_sessions");

      // 監査ログ：削除成功
      createDemoAuditLog({
        action: "DELETE_SUCCESS",
        targetType: target.type,
        targetId: target.id,
        requestedBy: target.requestedBy,
        success: true,
        deletedTables,
      });

      return { success: true };
    } catch (error) {
      // 監査ログ：削除失敗
      createDemoAuditLog({
        action: "DELETE_FAILED",
        targetType: target.type,
        targetId: target.id,
        requestedBy: target.requestedBy,
        success: false,
        errorCode: "DELETE_FAILED",
        errorMessage:
          error instanceof Error ? error.message : "Unknown error",
        deletedTables,
      });

      return {
        success: false,
        error: {
          code: "DELETE_FAILED",
          message: "データの削除に失敗しました",
        },
      };
    }
  }

  // TODO: ユーザー削除の実装（必要に応じて）
  return { success: true };
}

/**
 * バリデーション拒否理由からエラーコードを決定する
 */
function determineErrorCode(reason: string): DeleteDemoSessionErrorCode {
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
