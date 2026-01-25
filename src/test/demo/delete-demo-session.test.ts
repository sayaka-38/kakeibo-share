import { describe, it, expect, vi, beforeEach } from "vitest";
import { deleteDemoSession } from "@/lib/demo/delete-demo-session";

// Supabase クライアントのモック型
type MockSupabaseClient = {
  from: ReturnType<typeof vi.fn>;
};

// モックデータ
const mockDemoSession = {
  id: "session-1",
  user_id: "demo-user-1",
  group_id: "demo-group-1",
  expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
};

describe("deleteDemoSession - デモセッション削除", () => {
  let mockSupabase: MockSupabaseClient;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ============================================
  // 異常系：非デモデータの削除を拒否
  // ============================================
  describe("非デモデータの削除を拒否する", () => {
    it("demo_sessions に存在しないグループの削除を拒否する", async () => {
      // Arrange: デモセッションが空（対象グループはデモではない）
      mockSupabase = createMockSupabase({
        demoSessions: [],
      });

      // Act
      const result = await deleteDemoSession(mockSupabase as never, {
        type: "group",
        id: "non-demo-group-id",
        requestedBy: "some-user",
      });

      // Assert
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("NOT_DEMO_DATA");
      expect(result.error?.message).toContain("デモデータではない");
    });

    it("demo_sessions に存在しないユーザーの削除を拒否する", async () => {
      // Arrange
      mockSupabase = createMockSupabase({
        demoSessions: [],
      });

      // Act
      const result = await deleteDemoSession(mockSupabase as never, {
        type: "user",
        id: "non-demo-user-id",
        requestedBy: "some-user",
      });

      // Assert
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("NOT_DEMO_DATA");
    });
  });

  // ============================================
  // 異常系：他セッションのデータ削除を拒否
  // ============================================
  describe("他のセッションのデータ削除を拒否する", () => {
    it("他のユーザーのデモグループは削除できない", async () => {
      // Arrange: 別のユーザーが所有するデモセッション
      mockSupabase = createMockSupabase({
        demoSessions: [
          {
            ...mockDemoSession,
            user_id: "other-user",
            group_id: "other-users-group",
          },
        ],
      });

      // Act: 自分のIDで他人のグループを削除しようとする
      const result = await deleteDemoSession(mockSupabase as never, {
        type: "group",
        id: "other-users-group",
        requestedBy: "demo-user-1", // 異なるユーザー
      });

      // Assert
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("NOT_OWNER");
      expect(result.error?.message).toContain("他のデモセッション");
    });
  });

  // ============================================
  // 異常系：入力バリデーションエラー
  // ============================================
  describe("入力バリデーションエラー", () => {
    it("削除対象のIDが空の場合エラーを返す", async () => {
      mockSupabase = createMockSupabase({ demoSessions: [] });

      const result = await deleteDemoSession(mockSupabase as never, {
        type: "group",
        id: "",
        requestedBy: "demo-user-1",
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("INVALID_INPUT");
    });

    it("requestedBy が未指定の場合エラーを返す", async () => {
      mockSupabase = createMockSupabase({ demoSessions: [mockDemoSession] });

      const result = await deleteDemoSession(mockSupabase as never, {
        type: "group",
        id: "demo-group-1",
        requestedBy: "", // 空
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("INVALID_INPUT");
    });
  });

  // ============================================
  // 異常系：データベースエラー
  // ============================================
  describe("データベースエラーのハンドリング", () => {
    it("demo_sessions 取得時のエラーを適切にハンドリングする", async () => {
      mockSupabase = createMockSupabase({
        demoSessions: [],
        fetchError: new Error("Database connection failed"),
      });

      const result = await deleteDemoSession(mockSupabase as never, {
        type: "group",
        id: "demo-group-1",
        requestedBy: "demo-user-1",
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("DATABASE_ERROR");
    });

    it("削除実行時のエラーを適切にハンドリングする", async () => {
      mockSupabase = createMockSupabase({
        demoSessions: [mockDemoSession],
        deleteError: new Error("Delete failed"),
      });

      const result = await deleteDemoSession(mockSupabase as never, {
        type: "group",
        id: "demo-group-1",
        requestedBy: "demo-user-1",
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("DELETE_FAILED");
    });
  });

  // ============================================
  // 正常系：デモデータの削除成功
  // ============================================
  describe("デモデータの削除を実行する", () => {
    it("自分のデモグループを正常に削除できる", async () => {
      mockSupabase = createMockSupabase({
        demoSessions: [mockDemoSession],
        deleteSuccess: true,
      });

      const result = await deleteDemoSession(mockSupabase as never, {
        type: "group",
        id: "demo-group-1",
        requestedBy: "demo-user-1",
      });

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("削除時に関連データも削除される（カスケード確認）", async () => {
      const deleteCalls: string[] = [];
      mockSupabase = createMockSupabase({
        demoSessions: [mockDemoSession],
        deleteSuccess: true,
        onDelete: (table: string) => deleteCalls.push(table),
      });

      await deleteDemoSession(mockSupabase as never, {
        type: "group",
        id: "demo-group-1",
        requestedBy: "demo-user-1",
      });

      // 削除順序: payments → group_members → groups → demo_sessions
      expect(deleteCalls).toContain("payments");
      expect(deleteCalls).toContain("group_members");
      expect(deleteCalls).toContain("groups");
      expect(deleteCalls).toContain("demo_sessions");
    });
  });
});

// ============================================
// ヘルパー：モック Supabase クライアント作成
// ============================================
interface MockOptions {
  demoSessions: typeof mockDemoSession[];
  fetchError?: Error;
  deleteError?: Error;
  deleteSuccess?: boolean;
  onDelete?: (table: string) => void;
}

function createMockSupabase(options: MockOptions): MockSupabaseClient {
  const { demoSessions, fetchError, deleteError, deleteSuccess, onDelete } =
    options;

  return {
    from: vi.fn((table: string) => {
      // demo_sessions テーブルへのクエリ
      if (table === "demo_sessions") {
        return {
          select: vi.fn().mockReturnValue({
            data: fetchError ? null : demoSessions,
            error: fetchError || null,
          }),
          delete: vi.fn().mockImplementation(() => {
            if (onDelete) onDelete(table); // 削除時も記録
            return {
              eq: vi.fn().mockReturnValue({
                data: deleteError ? null : {},
                error: deleteError || null,
              }),
            };
          }),
        };
      }

      // その他のテーブルへの削除
      if (onDelete) onDelete(table);
      return {
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            data: deleteSuccess ? {} : null,
            error: deleteError || null,
          }),
        }),
      };
    }),
  };
}
