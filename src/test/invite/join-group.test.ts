import { describe, it, expect, vi, beforeEach } from "vitest";
import { joinGroupByInviteCode } from "@/lib/invite/join-group";

// Supabase クライアントのモック型
type MockSupabaseClient = {
  auth: {
    getUser: ReturnType<typeof vi.fn>;
  };
  from: ReturnType<typeof vi.fn>;
};

// モックのヘルパー関数
function createMockSupabase(): MockSupabaseClient {
  return {
    auth: {
      getUser: vi.fn(),
    },
    from: vi.fn(),
  };
}

describe("Join Group by Invite Code - 招待リンクでグループ参加", () => {
  let mockSupabase: MockSupabaseClient;

  beforeEach(() => {
    mockSupabase = createMockSupabase();
    vi.clearAllMocks();
  });

  // ============================================
  // 異常系：未ログイン
  // ============================================
  describe("未ログインユーザーのハンドリング", () => {
    it("ログインしていない場合エラーを返す", async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: null,
      });

      const result = await joinGroupByInviteCode(
        mockSupabase as never,
        "valid-invite-code"
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("NOT_AUTHENTICATED");
      expect(result.error?.message).toBe(
        "グループに参加するにはログインが必要です"
      );
    });
  });

  // ============================================
  // 異常系：無効な招待コード
  // ============================================
  describe("無効な招待コードのハンドリング", () => {
    it("存在しない招待コードの場合エラーを返す", async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: "user-123" } },
        error: null,
      });

      // groups テーブルから招待コードで検索 → 見つからない
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "groups") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: null,
                  error: { code: "PGRST116", message: "Not found" },
                }),
              }),
            }),
          };
        }
        return { select: vi.fn() };
      });

      const result = await joinGroupByInviteCode(
        mockSupabase as never,
        "invalid-code"
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("INVALID_INVITE_CODE");
      expect(result.error?.message).toBe(
        "この招待リンクは無効です。リンクを確認してください"
      );
    });

    it("空の招待コードの場合エラーを返す", async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: "user-123" } },
        error: null,
      });

      const result = await joinGroupByInviteCode(mockSupabase as never, "");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("INVALID_INVITE_CODE");
    });
  });

  // ============================================
  // 異常系：既にメンバー
  // ============================================
  describe("既にグループメンバーの場合のハンドリング", () => {
    it("既にグループに参加している場合エラーを返す", async () => {
      const userId = "user-123";
      const groupId = "group-456";

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: userId } },
        error: null,
      });

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "groups") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: groupId, name: "テストグループ" },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "group_members") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { id: "member-789", role: "member" },
                    error: null,
                  }),
                }),
              }),
            }),
            insert: vi.fn(),
          };
        }
        return { select: vi.fn() };
      });

      const result = await joinGroupByInviteCode(
        mockSupabase as never,
        "valid-code"
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("ALREADY_MEMBER");
      expect(result.error?.message).toBe(
        "既にこのグループに参加しています"
      );
    });
  });

  // ============================================
  // 異常系：メンバー上限
  // ============================================
  describe("メンバー上限のハンドリング", () => {
    it("グループのメンバー数が上限（20人）に達している場合エラーを返す", async () => {
      const userId = "user-123";
      const groupId = "group-456";

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: userId } },
        error: null,
      });

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "groups") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: groupId, name: "テストグループ" },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "group_members") {
          return {
            select: vi.fn().mockImplementation((columns: string) => {
              // カウント用クエリ
              if (columns === "id") {
                return {
                  eq: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                      single: vi.fn().mockResolvedValue({
                        data: null,
                        error: { code: "PGRST116" },
                      }),
                    }),
                  }),
                };
              }
              // メンバーシップ確認用 → 未参加
              return {
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({
                      data: null,
                      error: { code: "PGRST116" },
                    }),
                  }),
                }),
              };
            }),
            insert: vi.fn(),
          };
        }
        return { select: vi.fn() };
      });

      // メンバー数カウントをモック（20人）
      let memberCountCalled = false;
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "groups") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: groupId, name: "テストグループ" },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "group_members") {
          return {
            select: vi.fn().mockImplementation(() => {
              // メンバーシップ確認用（自分が参加済みか）
              if (!memberCountCalled) {
                memberCountCalled = true;
                return {
                  eq: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                      single: vi.fn().mockResolvedValue({
                        data: null,
                        error: { code: "PGRST116" },
                      }),
                    }),
                  }),
                };
              }
              // メンバー数カウント
              return {
                eq: vi.fn().mockResolvedValue({
                  data: Array(20).fill({ id: "member" }),
                  count: 20,
                  error: null,
                }),
              };
            }),
            insert: vi.fn(),
          };
        }
        return { select: vi.fn() };
      });

      const result = await joinGroupByInviteCode(
        mockSupabase as never,
        "valid-code"
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("GROUP_FULL");
      expect(result.error?.message).toBe(
        "このグループはメンバー数の上限に達しています"
      );
    });
  });

  // ============================================
  // 異常系：DB操作エラー
  // ============================================
  describe("データベースエラーのハンドリング", () => {
    it("メンバー追加のDB操作が失敗した場合エラーを返す", async () => {
      const userId = "user-123";
      const groupId = "group-456";

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: userId } },
        error: null,
      });

      let callPhase = 0;
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "groups") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: groupId, name: "テストグループ" },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "group_members") {
          return {
            select: vi.fn().mockImplementation(() => {
              callPhase++;
              if (callPhase === 1) {
                // 既存メンバーシップ確認 → 未参加
                return {
                  eq: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                      single: vi.fn().mockResolvedValue({
                        data: null,
                        error: { code: "PGRST116" },
                      }),
                    }),
                  }),
                };
              }
              // メンバー数カウント
              return {
                eq: vi.fn().mockResolvedValue({
                  data: Array(5).fill({ id: "member" }),
                  error: null,
                }),
              };
            }),
            insert: vi.fn().mockResolvedValue({
              data: null,
              error: { message: "Database error" },
            }),
          };
        }
        return { select: vi.fn() };
      });

      const result = await joinGroupByInviteCode(
        mockSupabase as never,
        "valid-code"
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("JOIN_FAILED");
      expect(result.error?.message).toBe(
        "グループへの参加に失敗しました。しばらく経ってからお試しください"
      );
    });
  });

  // ============================================
  // 異常系：ネットワークエラー
  // ============================================
  describe("ネットワークエラーのハンドリング", () => {
    it("ネットワークエラーが発生した場合エラーを返す", async () => {
      mockSupabase.auth.getUser.mockRejectedValue(
        new Error("Network timeout")
      );

      const result = await joinGroupByInviteCode(
        mockSupabase as never,
        "valid-code"
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("NETWORK_ERROR");
      expect(result.error?.message).toBe(
        "ネットワークエラーが発生しました。接続を確認してください"
      );
    });
  });

  // ============================================
  // 正常系：グループ参加成功
  // ============================================
  describe("グループ参加成功", () => {
    it("有効な招待コードでグループに参加できる", async () => {
      const userId = "user-123";
      const groupId = "group-456";
      const groupName = "テストグループ";

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: userId } },
        error: null,
      });

      let callPhase = 0;
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "groups") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: groupId, name: groupName },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "group_members") {
          return {
            select: vi.fn().mockImplementation(() => {
              callPhase++;
              if (callPhase === 1) {
                // 既存メンバーシップ確認 → 未参加
                return {
                  eq: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                      single: vi.fn().mockResolvedValue({
                        data: null,
                        error: { code: "PGRST116" },
                      }),
                    }),
                  }),
                };
              }
              // メンバー数カウント
              return {
                eq: vi.fn().mockResolvedValue({
                  data: Array(3).fill({ id: "member" }),
                  error: null,
                }),
              };
            }),
            insert: vi.fn().mockResolvedValue({
              data: { id: "new-member-id" },
              error: null,
            }),
          };
        }
        return { select: vi.fn() };
      });

      const result = await joinGroupByInviteCode(
        mockSupabase as never,
        "valid-code"
      );

      expect(result.success).toBe(true);
      expect(result.data?.groupId).toBe(groupId);
      expect(result.data?.groupName).toBe(groupName);
    });

    it("参加時のroleはmemberになる", async () => {
      const userId = "user-123";
      const groupId = "group-456";

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: userId } },
        error: null,
      });

      let capturedInsertData: { role?: string } = {};
      let callPhase = 0;

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "groups") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: groupId, name: "テストグループ" },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "group_members") {
          return {
            select: vi.fn().mockImplementation(() => {
              callPhase++;
              if (callPhase === 1) {
                return {
                  eq: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                      single: vi.fn().mockResolvedValue({
                        data: null,
                        error: { code: "PGRST116" },
                      }),
                    }),
                  }),
                };
              }
              return {
                eq: vi.fn().mockResolvedValue({
                  data: Array(3).fill({ id: "member" }),
                  error: null,
                }),
              };
            }),
            insert: vi.fn().mockImplementation((data: { role?: string }) => {
              capturedInsertData = data;
              return Promise.resolve({
                data: { id: "new-member-id" },
                error: null,
              });
            }),
          };
        }
        return { select: vi.fn() };
      });

      await joinGroupByInviteCode(mockSupabase as never, "valid-code");

      expect(capturedInsertData.role).toBe("member");
    });
  });
});
