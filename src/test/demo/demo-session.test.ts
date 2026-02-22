/**
 * デモセッション作成テスト
 *
 * create-demo Edge Function ラッパー (`createDemoSession`) の
 * インターフェースとエラーハンドリングを検証する。
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createDemoSession } from "@/lib/demo/create-demo-session";

// i18n モック
vi.mock("@/lib/i18n", () => ({
  t: (key: string) => key,
}));

type MockSupabaseClient = {
  functions: {
    invoke: ReturnType<typeof vi.fn>;
  };
  auth: {
    setSession: ReturnType<typeof vi.fn>;
  };
};

function createMockSupabase(): MockSupabaseClient {
  return {
    functions: {
      invoke: vi.fn(),
    },
    auth: {
      setSession: vi.fn().mockResolvedValue({ error: null }),
    },
  };
}

function makeSuccessResponse(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      success: true,
      session: { access_token: "token-abc", refresh_token: "refresh-xyz" },
      sessionId: "demo-session-789",
      userId: "demo-user-123",
      groupId: "demo-group-456",
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      ...overrides,
    },
    error: null,
  };
}

describe("Demo Session Creation - Edge Function ラッパー", () => {
  let mockSupabase: MockSupabaseClient;

  beforeEach(() => {
    mockSupabase = createMockSupabase();
    vi.clearAllMocks();
  });

  // ============================================
  // 異常系：エラーハンドリング
  // ============================================
  describe("エラーハンドリング", () => {
    it("functions.invoke が例外を投げた場合 NETWORK_ERROR を返す", async () => {
      mockSupabase.functions.invoke.mockRejectedValue(
        new Error("Network error")
      );

      const result = await createDemoSession(mockSupabase as never);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("NETWORK_ERROR");
    });

    it("429 レート制限エラーの場合 RATE_LIMITED を返す", async () => {
      mockSupabase.functions.invoke.mockResolvedValue({
        data: null,
        error: { message: "Too many requests", context: { status: 429 } },
      });

      const result = await createDemoSession(mockSupabase as never);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("RATE_LIMITED");
      expect(result.error?.message).toBe("common.rateLimited");
    });

    it("Edge Function が success:false を返した場合エラーを伝播する", async () => {
      mockSupabase.functions.invoke.mockResolvedValue({
        data: {
          success: false,
          error: {
            code: "AUTH_FAILED",
            message: "デモセッションの開始に失敗しました。しばらく経ってからお試しください。",
          },
        },
        error: null,
      });

      const result = await createDemoSession(mockSupabase as never);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("AUTH_FAILED");
      expect(result.error?.message).toContain("デモセッションの開始に失敗");
    });

    it("Edge Function が PROFILE_CREATION_FAILED を返した場合エラーを伝播する", async () => {
      mockSupabase.functions.invoke.mockResolvedValue({
        data: {
          success: false,
          error: {
            code: "PROFILE_CREATION_FAILED",
            message: "デモユーザーの作成に失敗しました。",
          },
        },
        error: null,
      });

      const result = await createDemoSession(mockSupabase as never);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("PROFILE_CREATION_FAILED");
    });

    it("Edge Function が GROUP_CREATION_FAILED を返した場合エラーを伝播する", async () => {
      mockSupabase.functions.invoke.mockResolvedValue({
        data: {
          success: false,
          error: {
            code: "GROUP_CREATION_FAILED",
            message: "デモグループの作成に失敗しました。",
          },
        },
        error: null,
      });

      const result = await createDemoSession(mockSupabase as never);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("GROUP_CREATION_FAILED");
    });

    it("Edge Function が SESSION_CREATION_FAILED を返した場合エラーを伝播する", async () => {
      mockSupabase.functions.invoke.mockResolvedValue({
        data: {
          success: false,
          error: {
            code: "SESSION_CREATION_FAILED",
            message: "デモセッションの記録に失敗しました。",
          },
        },
        error: null,
      });

      const result = await createDemoSession(mockSupabase as never);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("SESSION_CREATION_FAILED");
    });

    it("data が null でエラーもない場合 NETWORK_ERROR を返す", async () => {
      mockSupabase.functions.invoke.mockResolvedValue({
        data: null,
        error: null,
      });

      const result = await createDemoSession(mockSupabase as never);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("NETWORK_ERROR");
    });
  });

  // ============================================
  // 正常系：成功ケース
  // ============================================
  describe("成功時の動作", () => {
    it("Edge Function 成功時にセッション情報を返す", async () => {
      mockSupabase.functions.invoke.mockResolvedValue(makeSuccessResponse());

      const result = await createDemoSession(mockSupabase as never);

      expect(result.success).toBe(true);
      expect(result.data?.userId).toBe("demo-user-123");
      expect(result.data?.groupId).toBe("demo-group-456");
      expect(result.data?.sessionId).toBe("demo-session-789");
      expect(result.data?.expiresAt).toBeInstanceOf(Date);
    });

    it("Edge Function 成功後に auth.setSession が呼ばれる", async () => {
      const mockSession = {
        access_token: "access-abc",
        refresh_token: "refresh-xyz",
      };
      mockSupabase.functions.invoke.mockResolvedValue(
        makeSuccessResponse({ session: mockSession })
      );

      await createDemoSession(mockSupabase as never);

      expect(mockSupabase.auth.setSession).toHaveBeenCalledWith(mockSession);
    });

    it("session が null の場合は setSession を呼ばない", async () => {
      mockSupabase.functions.invoke.mockResolvedValue(
        makeSuccessResponse({ session: null })
      );

      await createDemoSession(mockSupabase as never);

      expect(mockSupabase.auth.setSession).not.toHaveBeenCalled();
    });
  });

  // ============================================
  // Edge Function 呼び出しの検証
  // ============================================
  describe("Edge Function 呼び出し検証", () => {
    it("create-demo Edge Function を呼び出す", async () => {
      mockSupabase.functions.invoke.mockResolvedValue(makeSuccessResponse());

      await createDemoSession(mockSupabase as never);

      expect(mockSupabase.functions.invoke).toHaveBeenCalledWith(
        "create-demo",
        expect.any(Object)
      );
    });

    it("turnstileToken なしの場合 null が body に渡される", async () => {
      mockSupabase.functions.invoke.mockResolvedValue(makeSuccessResponse());

      await createDemoSession(mockSupabase as never);

      expect(mockSupabase.functions.invoke).toHaveBeenCalledWith(
        "create-demo",
        { body: { turnstileToken: null } }
      );
    });

    it("turnstileToken ありの場合トークンが body に渡される", async () => {
      mockSupabase.functions.invoke.mockResolvedValue(makeSuccessResponse());

      await createDemoSession(mockSupabase as never, "cf-turnstile-token-xyz");

      expect(mockSupabase.functions.invoke).toHaveBeenCalledWith(
        "create-demo",
        { body: { turnstileToken: "cf-turnstile-token-xyz" } }
      );
    });

    it("予期しない例外が発生した場合 NETWORK_ERROR を返す", async () => {
      mockSupabase.functions.invoke.mockRejectedValue(
        new Error("Unexpected error")
      );

      const result = await createDemoSession(mockSupabase as never);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("NETWORK_ERROR");
    });
  });
});
