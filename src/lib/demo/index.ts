/**
 * デモ機能モジュール
 *
 * デモセッションの作成・削除・保護機能を提供
 */

// セッション作成
export {
  createDemoSession,
  type CreateDemoSessionResult,
  type DemoSessionData,
  type DemoSessionError,
  type DemoSessionErrorCode,
} from "./create-demo-session";

// セッション削除
export {
  deleteDemoSession,
  type DeleteDemoSessionResult,
  type DeleteDemoSessionError,
  type DeleteDemoSessionErrorCode,
  type DeleteTarget,
} from "./delete-demo-session";

// データ保護（バリデーション）
export {
  validateDemoDataDeletion,
  type DemoSession,
  type DeletionTarget,
  type ValidationResult,
} from "./delete-demo-data";

// 監査ログ
export {
  createDemoAuditLog,
  type DemoAuditLogEntry,
  type DemoAuditAction,
  type CreateAuditLogParams,
} from "./audit-log";
