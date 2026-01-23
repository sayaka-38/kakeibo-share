import { describe, it, expect } from "vitest";
import {
  validateDemoDataDeletion,
  type DemoSession,
  type DeletionTarget,
} from "@/lib/demo/delete-demo-data";

describe("Demo Data Protection - 本番データ保護", () => {
  // ============================================
  // 異常系：非デモデータの削除拒否
  // ============================================
  describe("非デモデータの削除を拒否する", () => {
    it("demo_sessions に存在しないグループIDの削除を拒否する", () => {
      const demoSessions: DemoSession[] = [
        {
          id: "session-1",
          userId: "demo-user-1",
          groupId: "demo-group-1",
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      ];

      const target: DeletionTarget = {
        type: "group",
        id: "production-group-1", // デモセッションに存在しないID
      };

      const result = validateDemoDataDeletion(target, demoSessions);

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe(
        "このグループはデモデータではないため削除できません"
      );
    });

    it("demo_sessions に存在しないユーザーIDの削除を拒否する", () => {
      const demoSessions: DemoSession[] = [
        {
          id: "session-1",
          userId: "demo-user-1",
          groupId: "demo-group-1",
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      ];

      const target: DeletionTarget = {
        type: "user",
        id: "production-user-1", // デモセッションに存在しないID
      };

      const result = validateDemoDataDeletion(target, demoSessions);

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe(
        "このユーザーはデモデータではないため削除できません"
      );
    });

    it("空のデモセッションリストでは全ての削除を拒否する", () => {
      const demoSessions: DemoSession[] = [];

      const target: DeletionTarget = {
        type: "group",
        id: "any-group-id",
      };

      const result = validateDemoDataDeletion(target, demoSessions);

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe(
        "このグループはデモデータではないため削除できません"
      );
    });
  });

  // ============================================
  // 異常系：期限切れセッションのバリデーション
  // ============================================
  describe("期限切れセッションの検証", () => {
    it("期限切れのデモセッションは削除対象として無効", () => {
      const expiredSession: DemoSession[] = [
        {
          id: "session-1",
          userId: "demo-user-1",
          groupId: "demo-group-1",
          expiresAt: new Date(Date.now() - 1000), // 1秒前に期限切れ
        },
      ];

      const target: DeletionTarget = {
        type: "group",
        id: "demo-group-1",
      };

      const result = validateDemoDataDeletion(target, expiredSession);

      // 期限切れでも削除は許可（クリーンアップ目的）
      expect(result.allowed).toBe(true);
    });
  });

  // ============================================
  // 異常系：不正な入力のバリデーション
  // ============================================
  describe("不正な入力の検証", () => {
    it("削除対象のIDが空文字の場合エラーを返す", () => {
      const demoSessions: DemoSession[] = [
        {
          id: "session-1",
          userId: "demo-user-1",
          groupId: "demo-group-1",
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      ];

      const target: DeletionTarget = {
        type: "group",
        id: "", // 空文字
      };

      const result = validateDemoDataDeletion(target, demoSessions);

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("削除対象のIDが指定されていません");
    });

    it("削除対象のタイプが不正な場合エラーを返す", () => {
      const demoSessions: DemoSession[] = [
        {
          id: "session-1",
          userId: "demo-user-1",
          groupId: "demo-group-1",
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      ];

      const target = {
        type: "invalid" as "group" | "user",
        id: "some-id",
      };

      const result = validateDemoDataDeletion(target, demoSessions);

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("不正な削除対象タイプです");
    });
  });

  // ============================================
  // 異常系：複数セッション存在時の検証
  // ============================================
  describe("複数セッション存在時の検証", () => {
    it("他のデモセッションのグループは削除できない", () => {
      const demoSessions: DemoSession[] = [
        {
          id: "session-1",
          userId: "demo-user-1",
          groupId: "demo-group-1",
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
        {
          id: "session-2",
          userId: "demo-user-2",
          groupId: "demo-group-2",
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      ];

      // session-1 のユーザーが session-2 のグループを削除しようとする
      const target: DeletionTarget = {
        type: "group",
        id: "demo-group-2",
        requestedBy: "demo-user-1", // 別のセッションのユーザー
      };

      const result = validateDemoDataDeletion(target, demoSessions);

      // 自分のセッションのデータでなければ削除不可
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe(
        "他のデモセッションのデータは削除できません"
      );
    });
  });

  // ============================================
  // 正常系：デモデータの削除許可
  // ============================================
  describe("デモデータの削除を許可する", () => {
    it("demo_sessions に存在するグループIDの削除を許可する", () => {
      const demoSessions: DemoSession[] = [
        {
          id: "session-1",
          userId: "demo-user-1",
          groupId: "demo-group-1",
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      ];

      const target: DeletionTarget = {
        type: "group",
        id: "demo-group-1",
        requestedBy: "demo-user-1",
      };

      const result = validateDemoDataDeletion(target, demoSessions);

      expect(result.allowed).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it("demo_sessions に存在するユーザーIDの削除を許可する", () => {
      const demoSessions: DemoSession[] = [
        {
          id: "session-1",
          userId: "demo-user-1",
          groupId: "demo-group-1",
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      ];

      const target: DeletionTarget = {
        type: "user",
        id: "demo-user-1",
        requestedBy: "demo-user-1",
      };

      const result = validateDemoDataDeletion(target, demoSessions);

      expect(result.allowed).toBe(true);
      expect(result.reason).toBeUndefined();
    });
  });
});
