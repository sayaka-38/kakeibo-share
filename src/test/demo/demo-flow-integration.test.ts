/**
 * デモフロー統合テスト
 *
 * createDemoSession ラッパーが Edge Function を正しく呼び出し、
 * レスポンスを適切にマッピングすることを検証する。
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
      session: { access_token: "token", refresh_token: "refresh" },
      sessionId: "demo-session-789",
      userId: "demo-user-123",
      groupId: "demo-group-456",
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      ...overrides,
    },
    error: null,
  };
}

describe("Demo Flow Integration - デモフロー統合テスト", () => {
  let mockSupabase: MockSupabaseClient;

  beforeEach(() => {
    mockSupabase = createMockSupabase();
    vi.clearAllMocks();
  });

  // ============================================
  // Edge Function 呼び出しの検証
  // ============================================
  describe("Edge Function 呼び出しの検証", () => {
    it("create-demo Edge Function が呼び出される", async () => {
      mockSupabase.functions.invoke.mockResolvedValue(makeSuccessResponse());

      await createDemoSession(mockSupabase as never);

      expect(mockSupabase.functions.invoke).toHaveBeenCalledWith(
        "create-demo",
        expect.any(Object)
      );
    });

    it("Turnstile トークンなしで呼び出した場合 null が渡される", async () => {
      mockSupabase.functions.invoke.mockResolvedValue(makeSuccessResponse());

      await createDemoSession(mockSupabase as never);

      expect(mockSupabase.functions.invoke).toHaveBeenCalledWith(
        "create-demo",
        { body: { turnstileToken: null } }
      );
    });

    it("Turnstile トークンありで呼び出した場合トークンが渡される", async () => {
      mockSupabase.functions.invoke.mockResolvedValue(makeSuccessResponse());

      await createDemoSession(mockSupabase as never, "my-captcha-token");

      expect(mockSupabase.functions.invoke).toHaveBeenCalledWith(
        "create-demo",
        { body: { turnstileToken: "my-captcha-token" } }
      );
    });

    it("Edge Function には owner_id / invite_code などの DB カラムを直接渡さない", async () => {
      mockSupabase.functions.invoke.mockResolvedValue(makeSuccessResponse());

      await createDemoSession(mockSupabase as never);

      const [, options] = mockSupabase.functions.invoke.mock.calls[0];
      expect(options.body).not.toHaveProperty("owner_id");
      expect(options.body).not.toHaveProperty("invite_code");
      expect(options.body).not.toHaveProperty("group_name");
    });
  });

  // ============================================
  // デモセッション完全フロー
  // ============================================
  describe("デモセッション完全フロー", () => {
    it("全ステップが正常に完了する", async () => {
      const userId = "demo-user-123";
      const groupId = "demo-group-456";
      const sessionId = "demo-session-789";

      mockSupabase.functions.invoke.mockResolvedValue(
        makeSuccessResponse({ userId, groupId, sessionId })
      );

      const result = await createDemoSession(mockSupabase as never);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.userId).toBe(userId);
      expect(result.data?.groupId).toBe(groupId);
      expect(result.data?.sessionId).toBe(sessionId);
    });

    it("成功後に auth.setSession が呼ばれる", async () => {
      const mockSession = {
        access_token: "access-token",
        refresh_token: "refresh-token",
      };
      mockSupabase.functions.invoke.mockResolvedValue(
        makeSuccessResponse({ session: mockSession })
      );

      await createDemoSession(mockSupabase as never);

      expect(mockSupabase.auth.setSession).toHaveBeenCalledWith(mockSession);
    });

    it("expiresAt が Date オブジェクトとして返される", async () => {
      mockSupabase.functions.invoke.mockResolvedValue(makeSuccessResponse());

      const result = await createDemoSession(mockSupabase as never);

      expect(result.data?.expiresAt).toBeInstanceOf(Date);
    });
  });
});
