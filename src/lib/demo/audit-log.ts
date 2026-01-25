/**
 * デモデータ操作の監査ログ
 *
 * 削除などの破壊的操作を追跡するためのログ機能
 * 本番環境では外部ログサービスへの連携も可能
 */

export type DemoAuditAction =
  | "DELETE_START"
  | "DELETE_SUCCESS"
  | "DELETE_FAILED"
  | "VALIDATION_REJECTED";

export interface DemoAuditLogEntry {
  /** ログのタイムスタンプ */
  timestamp: Date;
  /** 実行されたアクション */
  action: DemoAuditAction;
  /** 対象の種類（group, user） */
  targetType: "group" | "user";
  /** 対象のID */
  targetId: string;
  /** 操作を要求したユーザーID */
  requestedBy: string;
  /** 操作の成否 */
  success?: boolean;
  /** 削除されたテーブル一覧 */
  deletedTables?: string[];
  /** エラーコード */
  errorCode?: string;
  /** エラーメッセージ */
  errorMessage?: string;
}

export interface CreateAuditLogParams {
  action: DemoAuditAction;
  targetType: "group" | "user";
  targetId: string;
  requestedBy: string;
  success?: boolean;
  deletedTables?: string[];
  errorCode?: string;
  errorMessage?: string;
}

/**
 * 監査ログエントリを作成し、ログ出力を行う
 *
 * @param params - ログエントリのパラメータ
 * @returns 作成されたログエントリ
 */
export function createDemoAuditLog(
  params: CreateAuditLogParams
): DemoAuditLogEntry {
  const entry: DemoAuditLogEntry = {
    timestamp: new Date(),
    action: params.action,
    targetType: params.targetType,
    targetId: params.targetId,
    requestedBy: params.requestedBy,
    success: params.success,
    deletedTables: params.deletedTables,
    errorCode: params.errorCode,
    errorMessage: params.errorMessage,
  };

  // ログ出力
  outputLog(entry);

  return entry;
}

/**
 * ログエントリをフォーマットして出力する
 */
function outputLog(entry: DemoAuditLogEntry): void {
  const timestamp = entry.timestamp.toISOString();
  const status = entry.success === true ? "OK" : entry.success === false ? "NG" : "-";

  let message = `[DEMO_AUDIT] ${timestamp} | ${entry.action} | ${entry.targetType}:${entry.targetId} | by:${entry.requestedBy} | ${status}`;

  if (entry.deletedTables && entry.deletedTables.length > 0) {
    message += ` | tables:[${entry.deletedTables.join(",")}]`;
  }

  if (entry.errorCode) {
    message += ` | error:${entry.errorCode}`;
  }

  if (entry.errorMessage) {
    message += ` | msg:${entry.errorMessage}`;
  }

  console.info(message);
}
