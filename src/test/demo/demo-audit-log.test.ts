import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createDemoAuditLog,
  type DemoAuditAction,
} from "@/lib/demo/audit-log";

describe("Demo Audit Log - 削除操作の監査ログ", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let originalEnv: string | undefined;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    originalEnv = process.env.NODE_ENV;
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    process.env.NODE_ENV = originalEnv;
  });

  // ============================================
  // 正常系：ログエントリの作成
  // ============================================
  describe("ログエントリの作成", () => {
    it("削除開始時のログエントリを作成できる", () => {
      const entry = createDemoAuditLog({
        action: "DELETE_START",
        targetType: "group",
        targetId: "group-123",
        requestedBy: "user-456",
      });

      expect(entry.action).toBe("DELETE_START");
      expect(entry.targetType).toBe("group");
      expect(entry.targetId).toBe("group-123");
      expect(entry.requestedBy).toBe("user-456");
      expect(entry.timestamp).toBeInstanceOf(Date);
      expect(entry.success).toBeUndefined();
    });

    it("削除成功時のログエントリを作成できる", () => {
      const entry = createDemoAuditLog({
        action: "DELETE_SUCCESS",
        targetType: "group",
        targetId: "group-123",
        requestedBy: "user-456",
        success: true,
        deletedTables: ["payments", "group_members", "groups", "demo_sessions"],
      });

      expect(entry.action).toBe("DELETE_SUCCESS");
      expect(entry.success).toBe(true);
      expect(entry.deletedTables).toEqual([
        "payments",
        "group_members",
        "groups",
        "demo_sessions",
      ]);
    });

    it("削除失敗時のログエントリを作成できる", () => {
      const entry = createDemoAuditLog({
        action: "DELETE_FAILED",
        targetType: "group",
        targetId: "group-123",
        requestedBy: "user-456",
        success: false,
        errorCode: "NOT_DEMO_DATA",
        errorMessage: "このグループはデモデータではないため削除できません",
      });

      expect(entry.action).toBe("DELETE_FAILED");
      expect(entry.success).toBe(false);
      expect(entry.errorCode).toBe("NOT_DEMO_DATA");
      expect(entry.errorMessage).toContain("デモデータではない");
    });

    it("バリデーション拒否時のログエントリを作成できる", () => {
      const entry = createDemoAuditLog({
        action: "VALIDATION_REJECTED",
        targetType: "user",
        targetId: "user-789",
        requestedBy: "user-456",
        success: false,
        errorCode: "NOT_OWNER",
        errorMessage: "他のデモセッションのデータは削除できません",
      });

      expect(entry.action).toBe("VALIDATION_REJECTED");
      expect(entry.errorCode).toBe("NOT_OWNER");
    });
  });

  // ============================================
  // ログ出力の検証
  // ============================================
  describe("ログ出力", () => {
    it("ログエントリ作成時にconsole.infoが呼ばれる", () => {
      createDemoAuditLog({
        action: "DELETE_START",
        targetType: "group",
        targetId: "group-123",
        requestedBy: "user-456",
      });

      expect(consoleSpy).toHaveBeenCalled();
    });

    it("ログ出力にはプレフィックス [DEMO_AUDIT] が含まれる", () => {
      createDemoAuditLog({
        action: "DELETE_START",
        targetType: "group",
        targetId: "group-123",
        requestedBy: "user-456",
      });

      const logCall = consoleSpy.mock.calls[0][0];
      expect(logCall).toContain("[DEMO_AUDIT]");
    });

    it("ログ出力にアクション名が含まれる", () => {
      createDemoAuditLog({
        action: "DELETE_SUCCESS",
        targetType: "group",
        targetId: "group-123",
        requestedBy: "user-456",
        success: true,
      });

      const logCall = consoleSpy.mock.calls[0][0];
      expect(logCall).toContain("DELETE_SUCCESS");
    });
  });

  // ============================================
  // タイムスタンプの検証
  // ============================================
  describe("タイムスタンプ", () => {
    it("タイムスタンプは現在時刻に近い", () => {
      const before = new Date();
      const entry = createDemoAuditLog({
        action: "DELETE_START",
        targetType: "group",
        targetId: "group-123",
        requestedBy: "user-456",
      });
      const after = new Date();

      expect(entry.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(entry.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  // ============================================
  // 型安全性の検証
  // ============================================
  describe("型安全性", () => {
    it("有効なアクションタイプのみ受け付ける", () => {
      const validActions: DemoAuditAction[] = [
        "DELETE_START",
        "DELETE_SUCCESS",
        "DELETE_FAILED",
        "VALIDATION_REJECTED",
      ];

      validActions.forEach((action) => {
        const entry = createDemoAuditLog({
          action,
          targetType: "group",
          targetId: "test-id",
          requestedBy: "user-id",
        });
        expect(entry.action).toBe(action);
      });
    });
  });
});
