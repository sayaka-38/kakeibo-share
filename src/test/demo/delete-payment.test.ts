import { describe, it, expect, vi, beforeEach } from "vitest";
import { deletePayment } from "@/lib/demo/delete-payment";

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

const mockPayment = {
  id: "payment-1",
  group_id: "demo-group-1",
  payer_id: "demo-user-1",
  amount: 1500,
  description: "テスト支払い",
};

describe("deletePayment - 個別支払い削除", () => {
  let mockSupabase: MockSupabaseClient;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = vi.spyOn(console, "info").mockImplementation(() => {});
  });

  // ============================================
  // 異常系：非デモデータの削除を拒否
  // ============================================
  describe("非デモデータの削除を拒否する", () => {
    it("デモセッションに紐づかないグループの支払いは削除できない", async () => {
      mockSupabase = createMockSupabase({
        demoSessions: [], // デモセッションなし
        payment: mockPayment,
      });

      const result = await deletePayment(mockSupabase as never, {
        paymentId: "payment-1",
        groupId: "non-demo-group",
        requestedBy: "some-user",
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("NOT_DEMO_DATA");
    });

    it("本番グループの支払いは削除できない", async () => {
      mockSupabase = createMockSupabase({
        demoSessions: [mockDemoSession],
        payment: { ...mockPayment, group_id: "production-group" },
      });

      const result = await deletePayment(mockSupabase as never, {
        paymentId: "payment-1",
        groupId: "production-group", // 本番グループ
        requestedBy: "demo-user-1",
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("NOT_DEMO_DATA");
    });
  });

  // ============================================
  // 異常系：他ユーザーの削除を拒否
  // ============================================
  describe("他ユーザーのデモデータ削除を拒否する", () => {
    it("他のデモユーザーの支払いは削除できない", async () => {
      const otherUserSession = {
        ...mockDemoSession,
        user_id: "other-demo-user",
        group_id: "other-demo-group",
      };

      mockSupabase = createMockSupabase({
        demoSessions: [otherUserSession],
        payment: { ...mockPayment, group_id: "other-demo-group" },
      });

      const result = await deletePayment(mockSupabase as never, {
        paymentId: "payment-1",
        groupId: "other-demo-group",
        requestedBy: "demo-user-1", // 別のユーザー
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("NOT_OWNER");
    });
  });

  // ============================================
  // 異常系：入力バリデーション
  // ============================================
  describe("入力バリデーション", () => {
    it("paymentId が空の場合エラー", async () => {
      mockSupabase = createMockSupabase({
        demoSessions: [mockDemoSession],
        payment: mockPayment,
      });

      const result = await deletePayment(mockSupabase as never, {
        paymentId: "",
        groupId: "demo-group-1",
        requestedBy: "demo-user-1",
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("INVALID_INPUT");
    });

    it("groupId が空の場合エラー", async () => {
      mockSupabase = createMockSupabase({
        demoSessions: [mockDemoSession],
        payment: mockPayment,
      });

      const result = await deletePayment(mockSupabase as never, {
        paymentId: "payment-1",
        groupId: "",
        requestedBy: "demo-user-1",
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("INVALID_INPUT");
    });
  });

  // ============================================
  // 正常系：デモ支払いの削除
  // ============================================
  describe("デモ支払いの削除", () => {
    it("自分のデモグループの支払いを削除できる", async () => {
      mockSupabase = createMockSupabase({
        demoSessions: [mockDemoSession],
        payment: mockPayment,
        deleteSuccess: true,
      });

      const result = await deletePayment(mockSupabase as never, {
        paymentId: "payment-1",
        groupId: "demo-group-1",
        requestedBy: "demo-user-1",
      });

      expect(result.success).toBe(true);
    });

    it("削除時に監査ログが出力される", async () => {
      mockSupabase = createMockSupabase({
        demoSessions: [mockDemoSession],
        payment: mockPayment,
        deleteSuccess: true,
      });

      await deletePayment(mockSupabase as never, {
        paymentId: "payment-1",
        groupId: "demo-group-1",
        requestedBy: "demo-user-1",
      });

      // 監査ログが出力されたことを確認
      expect(consoleSpy).toHaveBeenCalled();
      const logCalls = consoleSpy.mock.calls.map((call) => call[0]);
      expect(logCalls.some((log: string) => log.includes("[DEMO_AUDIT]"))).toBe(true);
      expect(logCalls.some((log: string) => log.includes("PAYMENT_DELETE"))).toBe(true);
    });
  });

  // ============================================
  // 異常系：データベースエラー
  // ============================================
  describe("データベースエラーのハンドリング", () => {
    it("削除実行時のエラーを適切にハンドリングする", async () => {
      mockSupabase = createMockSupabase({
        demoSessions: [mockDemoSession],
        payment: mockPayment,
        deleteError: new Error("Database error"),
      });

      const result = await deletePayment(mockSupabase as never, {
        paymentId: "payment-1",
        groupId: "demo-group-1",
        requestedBy: "demo-user-1",
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("DELETE_FAILED");
    });
  });
});

// ============================================
// ヘルパー：モック Supabase クライアント作成
// ============================================
interface MockOptions {
  demoSessions: typeof mockDemoSession[];
  payment?: typeof mockPayment;
  fetchError?: Error;
  deleteError?: Error;
  deleteSuccess?: boolean;
}

function createMockSupabase(options: MockOptions): MockSupabaseClient {
  const { demoSessions, payment, fetchError, deleteError, deleteSuccess } = options;

  return {
    from: vi.fn((table: string) => {
      if (table === "demo_sessions") {
        return {
          select: vi.fn().mockReturnValue({
            data: fetchError ? null : demoSessions,
            error: fetchError || null,
          }),
        };
      }

      if (table === "payments") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockReturnValue({
                data: payment || null,
                error: null,
              }),
            }),
          }),
          delete: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              data: deleteSuccess ? {} : null,
              error: deleteError || null,
            }),
          }),
        };
      }

      return {
        select: vi.fn().mockReturnValue({ data: null, error: null }),
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({ data: null, error: null }),
        }),
      };
    }),
  };
}
