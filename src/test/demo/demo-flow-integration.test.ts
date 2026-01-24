import { describe, it, expect, vi, beforeEach } from "vitest";
import { createDemoSession } from "@/lib/demo/create-demo-session";

/**
 * デモフロー統合テスト
 *
 * デモセッション作成の全フローを検証し、
 * DBスキーマとの整合性を確認する
 */

type MockSupabaseClient = {
  auth: {
    signInAnonymously: ReturnType<typeof vi.fn>;
  };
  from: ReturnType<typeof vi.fn>;
};

function createMockSupabase(): MockSupabaseClient {
  return {
    auth: {
      signInAnonymously: vi.fn(),
    },
    from: vi.fn(),
  };
}

describe("Demo Flow Integration - デモフロー統合テスト", () => {
  let mockSupabase: MockSupabaseClient;

  beforeEach(() => {
    mockSupabase = createMockSupabase();
    vi.clearAllMocks();
  });

  describe("グループ作成時のカラム名検証", () => {
    it("グループ作成時に created_by カラムが使用される", async () => {
      const userId = "demo-user-123";
      let capturedGroupInsertData: Record<string, unknown> = {};

      mockSupabase.auth.signInAnonymously.mockResolvedValue({
        data: {
          user: { id: userId },
          session: { access_token: "token" },
        },
        error: null,
      });

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "profiles") {
          return {
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: userId },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "groups") {
          return {
            insert: vi.fn().mockImplementation((data: Record<string, unknown>) => {
              capturedGroupInsertData = data;
              return {
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { id: "group-123", name: data.name },
                    error: null,
                  }),
                }),
              };
            }),
          };
        }
        if (table === "group_members") {
          return {
            insert: vi.fn().mockResolvedValue({ data: {}, error: null }),
          };
        }
        if (table === "demo_sessions") {
          return {
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: "session-123", expires_at: new Date().toISOString() },
                  error: null,
                }),
              }),
            }),
          };
        }
        return { insert: vi.fn() };
      });

      await createDemoSession(mockSupabase as never);

      // created_by カラムが使用されていることを確認
      expect(capturedGroupInsertData).toHaveProperty("created_by");
      expect(capturedGroupInsertData.created_by).toBe(userId);

      // owner_id が使用されていないことを確認
      expect(capturedGroupInsertData).not.toHaveProperty("owner_id");
    });

    it("invite_code は自動生成されるため明示的に指定しない", async () => {
      const userId = "demo-user-123";
      let capturedGroupInsertData: Record<string, unknown> = {};

      mockSupabase.auth.signInAnonymously.mockResolvedValue({
        data: {
          user: { id: userId },
          session: { access_token: "token" },
        },
        error: null,
      });

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "profiles") {
          return {
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: userId },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "groups") {
          return {
            insert: vi.fn().mockImplementation((data: Record<string, unknown>) => {
              capturedGroupInsertData = data;
              return {
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { id: "group-123", name: data.name, invite_code: "auto-generated" },
                    error: null,
                  }),
                }),
              };
            }),
          };
        }
        if (table === "group_members") {
          return {
            insert: vi.fn().mockResolvedValue({ data: {}, error: null }),
          };
        }
        if (table === "demo_sessions") {
          return {
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: "session-123", expires_at: new Date().toISOString() },
                  error: null,
                }),
              }),
            }),
          };
        }
        return { insert: vi.fn() };
      });

      await createDemoSession(mockSupabase as never);

      // invite_code はDBのデフォルト値で生成されるため、明示的に含まれていないことを確認
      expect(capturedGroupInsertData).not.toHaveProperty("invite_code");
    });
  });

  describe("デモセッション完全フロー", () => {
    it("全ステップが正常に完了する", async () => {
      const userId = "demo-user-123";
      const groupId = "demo-group-456";
      const sessionId = "demo-session-789";
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      mockSupabase.auth.signInAnonymously.mockResolvedValue({
        data: {
          user: { id: userId },
          session: { access_token: "token" },
        },
        error: null,
      });

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "profiles") {
          return {
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: userId, email: `${userId}@demo.kakeibo.local` },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "groups") {
          return {
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: groupId,
                    name: "デモ用シェアハウス",
                    invite_code: "abc123def456",
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "group_members") {
          return {
            insert: vi.fn().mockResolvedValue({ data: {}, error: null }),
          };
        }
        if (table === "demo_sessions") {
          return {
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: sessionId,
                    user_id: userId,
                    group_id: groupId,
                    expires_at: expiresAt,
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        return { insert: vi.fn() };
      });

      const result = await createDemoSession(mockSupabase as never);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.userId).toBe(userId);
      expect(result.data?.groupId).toBe(groupId);
      expect(result.data?.sessionId).toBe(sessionId);
    });
  });
});
