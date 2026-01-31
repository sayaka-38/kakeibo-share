/**
 * authenticateRequest() 共通認証ヘルパー テスト
 *
 * Phase A-1: API 認証の共通化
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// モック: @/lib/supabase/server
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { authenticateRequest } from "@/lib/api/authenticate";

const mockCreateClient = vi.mocked(createClient);

describe("authenticateRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // 異常系（AuthFailure）
  // ==========================================================================
  describe("異常系", () => {
    it("Supabase getUser がエラーを返した場合 → AuthFailure (401)", async () => {
      const mockSupabase = {
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: null },
            error: new Error("Auth error"),
          }),
        },
      };
      mockCreateClient.mockResolvedValue(mockSupabase as never);

      const result = await authenticateRequest();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.response.status).toBe(401);
        const body = await result.response.json();
        expect(body.error).toBe("Unauthorized");
      }
    });

    it("user が null の場合 → AuthFailure (401)", async () => {
      const mockSupabase = {
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: null },
            error: null,
          }),
        },
      };
      mockCreateClient.mockResolvedValue(mockSupabase as never);

      const result = await authenticateRequest();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.response.status).toBe(401);
        const body = await result.response.json();
        expect(body.error).toBe("Unauthorized");
      }
    });

    it("レスポンスの Content-Type が application/json であること", async () => {
      const mockSupabase = {
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: null },
            error: null,
          }),
        },
      };
      mockCreateClient.mockResolvedValue(mockSupabase as never);

      const result = await authenticateRequest();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.response.headers.get("content-type")).toContain(
          "application/json"
        );
      }
    });
  });

  // ==========================================================================
  // 正常系（AuthSuccess）
  // ==========================================================================
  describe("正常系", () => {
    it("認証成功時 → AuthSuccess (user + supabase を返す)", async () => {
      const mockUser = { id: "user-123", email: "test@example.com" };
      const mockSupabase = {
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: mockUser },
            error: null,
          }),
        },
      };
      mockCreateClient.mockResolvedValue(mockSupabase as never);

      const result = await authenticateRequest();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.user).toEqual(mockUser);
        expect(result.supabase).toBe(mockSupabase);
      }
    });

    it("user オブジェクトの id が正しく返ること", async () => {
      const mockUser = { id: "abc-def-ghi", email: "user@test.com" };
      const mockSupabase = {
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: mockUser },
            error: null,
          }),
        },
      };
      mockCreateClient.mockResolvedValue(mockSupabase as never);

      const result = await authenticateRequest();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.user.id).toBe("abc-def-ghi");
      }
    });
  });

  // ==========================================================================
  // 型テスト（判別共用体の分岐が正しく機能すること）
  // ==========================================================================
  describe("型テスト", () => {
    it("success: false の場合、response プロパティにアクセスできる", async () => {
      const mockSupabase = {
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: null },
            error: null,
          }),
        },
      };
      mockCreateClient.mockResolvedValue(mockSupabase as never);

      const result = await authenticateRequest();

      if (!result.success) {
        // 型安全: response にアクセスできる
        expect(result.response).toBeDefined();
        expect(result.response.status).toBe(401);
      } else {
        // ここに到達しないはず
        expect.unreachable("Should be AuthFailure");
      }
    });

    it("success: true の場合、user と supabase にアクセスできる", async () => {
      const mockUser = { id: "user-456", email: "type@test.com" };
      const mockSupabase = {
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: mockUser },
            error: null,
          }),
        },
      };
      mockCreateClient.mockResolvedValue(mockSupabase as never);

      const result = await authenticateRequest();

      if (result.success) {
        // 型安全: user と supabase にアクセスできる
        expect(result.user).toBeDefined();
        expect(result.supabase).toBeDefined();
      } else {
        expect.unreachable("Should be AuthSuccess");
      }
    });
  });
});
