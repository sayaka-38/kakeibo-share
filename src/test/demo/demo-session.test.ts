import { describe, it, expect, vi, beforeEach } from "vitest";
import { createDemoSession } from "@/lib/demo/create-demo-session";

// Supabase クライアントのモック型
type MockSupabaseClient = {
  auth: {
    signInAnonymously: ReturnType<typeof vi.fn>;
  };
  from: ReturnType<typeof vi.fn>;
};

// モックのヘルパー関数
function createMockSupabase(): MockSupabaseClient {
  return {
    auth: {
      signInAnonymously: vi.fn(),
    },
    from: vi.fn(),
  };
}

// profiles の update モックを生成するヘルパー（成功）
function createProfileUpdateMock(userId: string) {
  return {
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: userId, display_name: "デモユーザー" },
            error: null,
          }),
        }),
      }),
    }),
  };
}

// profiles の update モックを生成するヘルパー（失敗）
function createProfileUpdateErrorMock() {
  return {
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { message: "Update failed" },
          }),
        }),
      }),
    }),
  };
}

describe("Demo Session Creation - デモセッション作成", () => {
  let mockSupabase: MockSupabaseClient;

  beforeEach(() => {
    mockSupabase = createMockSupabase();
    vi.clearAllMocks();
  });

  // ============================================
  // 異常系：匿名認証の失敗
  // ============================================
  describe("匿名認証の失敗ハンドリング", () => {
    it("Supabase匿名認証が失敗した場合エラーを返す", async () => {
      mockSupabase.auth.signInAnonymously.mockResolvedValue({
        data: { user: null, session: null },
        error: { message: "Anonymous sign-in is disabled" },
      });

      const result = await createDemoSession(mockSupabase as never);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("AUTH_FAILED");
      expect(result.error?.message).toBe(
        "デモセッションの開始に失敗しました。しばらく経ってからお試しください。"
      );
    });

    it("匿名ユーザーのIDが取得できない場合エラーを返す", async () => {
      mockSupabase.auth.signInAnonymously.mockResolvedValue({
        data: { user: null, session: {} },
        error: null,
      });

      const result = await createDemoSession(mockSupabase as never);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("AUTH_FAILED");
    });
  });

  // ============================================
  // 異常系：プロフィール更新の失敗
  // ============================================
  describe("プロフィール更新の失敗ハンドリング", () => {
    it("プロフィール更新が失敗した場合エラーを返す", async () => {
      mockSupabase.auth.signInAnonymously.mockResolvedValue({
        data: {
          user: { id: "demo-user-123" },
          session: { access_token: "token" },
        },
        error: null,
      });

      mockSupabase.from.mockReturnValue(createProfileUpdateErrorMock());

      const result = await createDemoSession(mockSupabase as never);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("PROFILE_CREATION_FAILED");
      expect(result.error?.message).toBe(
        "デモユーザーの作成に失敗しました。"
      );
    });
  });

  // ============================================
  // 異常系：グループ作成の失敗
  // ============================================
  describe("グループ作成の失敗ハンドリング", () => {
    it("デモグループ作成が失敗した場合エラーを返す", async () => {
      mockSupabase.auth.signInAnonymously.mockResolvedValue({
        data: {
          user: { id: "demo-user-123" },
          session: { access_token: "token" },
        },
        error: null,
      });

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "profiles") {
          return createProfileUpdateMock("demo-user-123");
        }
        if (table === "groups") {
          return {
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: null,
                  error: { message: "Group insert failed" },
                }),
              }),
            }),
          };
        }
        return { insert: vi.fn(), update: vi.fn() };
      });

      const result = await createDemoSession(mockSupabase as never);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("GROUP_CREATION_FAILED");
      expect(result.error?.message).toBe(
        "デモグループの作成に失敗しました。"
      );
    });
  });

  // ============================================
  // 異常系：デモセッションレコード作成の失敗
  // ============================================
  describe("デモセッションレコード作成の失敗ハンドリング", () => {
    it("demo_sessions テーブルへの登録が失敗した場合エラーを返す", async () => {
      mockSupabase.auth.signInAnonymously.mockResolvedValue({
        data: {
          user: { id: "demo-user-123" },
          session: { access_token: "token" },
        },
        error: null,
      });

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "profiles") {
          return createProfileUpdateMock("demo-user-123");
        }
        if (table === "groups") {
          return {
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: "demo-group-123" },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "group_members") {
          return {
            insert: vi.fn().mockResolvedValue({
              data: {},
              error: null,
            }),
          };
        }
        if (table === "demo_sessions") {
          return {
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: null,
                  error: { message: "Demo session insert failed" },
                }),
              }),
            }),
          };
        }
        return { insert: vi.fn(), update: vi.fn() };
      });

      const result = await createDemoSession(mockSupabase as never);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("SESSION_CREATION_FAILED");
      expect(result.error?.message).toBe(
        "デモセッションの記録に失敗しました。"
      );
    });
  });

  // ============================================
  // 異常系：ネットワークエラー
  // ============================================
  describe("ネットワークエラーのハンドリング", () => {
    it("Supabase接続がタイムアウトした場合エラーを返す", async () => {
      mockSupabase.auth.signInAnonymously.mockRejectedValue(
        new Error("Network timeout")
      );

      const result = await createDemoSession(mockSupabase as never);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("NETWORK_ERROR");
      expect(result.error?.message).toBe(
        "ネットワークエラーが発生しました。接続を確認してください。"
      );
    });

    it("予期しないエラーが発生した場合汎用エラーを返す", async () => {
      mockSupabase.auth.signInAnonymously.mockRejectedValue(
        new Error("Unexpected error")
      );

      const result = await createDemoSession(mockSupabase as never);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("NETWORK_ERROR");
    });
  });

  // ============================================
  // 正常系：デモセッション作成成功
  // ============================================
  describe("デモセッション作成成功", () => {
    it("全ての処理が成功した場合セッション情報を返す", async () => {
      const mockUserId = "demo-user-123";
      const mockGroupId = "demo-group-456";
      const mockSessionId = "demo-session-789";

      mockSupabase.auth.signInAnonymously.mockResolvedValue({
        data: {
          user: { id: mockUserId },
          session: { access_token: "token" },
        },
        error: null,
      });

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "profiles") {
          return createProfileUpdateMock(mockUserId);
        }
        if (table === "groups") {
          return {
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: mockGroupId,
                    name: "デモ用シェアハウス",
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "group_members") {
          return {
            insert: vi.fn().mockResolvedValue({
              data: {},
              error: null,
            }),
          };
        }
        if (table === "demo_sessions") {
          return {
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: mockSessionId,
                    user_id: mockUserId,
                    group_id: mockGroupId,
                    expires_at: new Date(
                      Date.now() + 24 * 60 * 60 * 1000
                    ).toISOString(),
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        return { insert: vi.fn(), update: vi.fn() };
      });

      const result = await createDemoSession(mockSupabase as never);

      expect(result.success).toBe(true);
      expect(result.data?.userId).toBe(mockUserId);
      expect(result.data?.groupId).toBe(mockGroupId);
      expect(result.data?.sessionId).toBe(mockSessionId);
      expect(result.data?.expiresAt).toBeDefined();
    });

    it("プロフィールにis_demoフラグがtrueで設定される", async () => {
      const mockUserId = "demo-user-123";

      mockSupabase.auth.signInAnonymously.mockResolvedValue({
        data: {
          user: { id: mockUserId },
          session: { access_token: "token" },
        },
        error: null,
      });

      let capturedProfileUpdate: { display_name?: string; is_demo?: boolean } = {};
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "profiles") {
          return {
            update: vi.fn().mockImplementation((data: { display_name?: string; is_demo?: boolean }) => {
              capturedProfileUpdate = data;
              return {
                eq: vi.fn().mockReturnValue({
                  select: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({
                      data: { id: mockUserId, ...data },
                      error: null,
                    }),
                  }),
                }),
              };
            }),
          };
        }
        if (table === "groups") {
          return {
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: "group-123", name: "デモ用シェアハウス" },
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
                  data: { id: "session-123", expires_at: new Date().toISOString() },
                  error: null,
                }),
              }),
            }),
          };
        }
        return { insert: vi.fn(), update: vi.fn() };
      });

      await createDemoSession(mockSupabase as never);

      expect(capturedProfileUpdate.is_demo).toBe(true);
      expect(capturedProfileUpdate.display_name).toBe("デモユーザー");
    });

    it("作成されたデモグループに適切な名前が設定されている", async () => {
      const mockUserId = "demo-user-123";

      mockSupabase.auth.signInAnonymously.mockResolvedValue({
        data: {
          user: { id: mockUserId },
          session: { access_token: "token" },
        },
        error: null,
      });

      let capturedGroupName = "";
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "profiles") {
          return createProfileUpdateMock(mockUserId);
        }
        if (table === "groups") {
          return {
            insert: vi.fn().mockImplementation((data: { name: string }) => {
              capturedGroupName = data.name;
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
        return { insert: vi.fn(), update: vi.fn() };
      });

      await createDemoSession(mockSupabase as never);

      expect(capturedGroupName).toBe("デモ用シェアハウス");
    });
  });
});
