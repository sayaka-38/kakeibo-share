import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { DemoButton } from "@/components/demo/DemoButton";

// useRouter のモック
const mockPush = vi.fn();
const mockRefresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    refresh: mockRefresh,
  }),
}));

// createDemoSession のモック
const mockCreateDemoSession = vi.fn();

vi.mock("@/lib/demo/create-demo-session", () => ({
  createDemoSession: () => mockCreateDemoSession(),
}));

// Supabase クライアントのモック
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({}),
}));

describe("DemoButton - デモ体験ボタン", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ============================================
  // 異常系：エラー表示
  // ============================================
  describe("エラー表示", () => {
    it("デモセッション作成が失敗した場合エラーメッセージを表示する", async () => {
      mockCreateDemoSession.mockResolvedValue({
        success: false,
        error: {
          code: "AUTH_FAILED",
          message: "デモセッションの開始に失敗しました。",
        },
      });

      render(<DemoButton />);

      const button = screen.getByRole("button", { name: /デモ体験/i });
      fireEvent.click(button);

      await waitFor(() => {
        expect(
          screen.getByText(/デモセッションの開始に失敗しました/i)
        ).toBeInTheDocument();
      });
    });

    it("ネットワークエラーの場合適切なメッセージを表示する", async () => {
      mockCreateDemoSession.mockResolvedValue({
        success: false,
        error: {
          code: "NETWORK_ERROR",
          message: "ネットワークエラーが発生しました。",
        },
      });

      render(<DemoButton />);

      const button = screen.getByRole("button", { name: /デモ体験/i });
      fireEvent.click(button);

      await waitFor(() => {
        expect(
          screen.getByText(/ネットワークエラーが発生しました/i)
        ).toBeInTheDocument();
      });
    });
  });

  // ============================================
  // 正常系：ボタンの表示と動作
  // ============================================
  describe("ボタンの表示", () => {
    it("「登録なしでデモ体験」ボタンが表示される", () => {
      render(<DemoButton />);

      expect(
        screen.getByRole("button", { name: /デモ体験/i })
      ).toBeInTheDocument();
    });

    it("補足テキストが表示される", () => {
      render(<DemoButton />);

      expect(screen.getByText(/約1分で操作感をお試し/i)).toBeInTheDocument();
    });
  });

  describe("ローディング状態", () => {
    it("ボタンクリック時にローディング状態になる", async () => {
      mockCreateDemoSession.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () => resolve({ success: true, data: { groupId: "test" } }),
              100
            )
          )
      );

      render(<DemoButton />);

      const button = screen.getByRole("button", { name: /デモ体験/i });
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByText(/準備中/i)).toBeInTheDocument();
      });
    });

    it("ローディング中はボタンが無効化される", async () => {
      mockCreateDemoSession.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () => resolve({ success: true, data: { groupId: "test" } }),
              100
            )
          )
      );

      render(<DemoButton />);

      const button = screen.getByRole("button", { name: /デモ体験/i });
      fireEvent.click(button);

      await waitFor(() => {
        expect(button).toBeDisabled();
      });
    });
  });

  describe("成功時の遷移", () => {
    it("デモセッション作成成功後にダッシュボードへ遷移する", async () => {
      mockCreateDemoSession.mockResolvedValue({
        success: true,
        data: {
          sessionId: "session-123",
          userId: "user-123",
          groupId: "group-123",
          expiresAt: new Date(),
        },
      });

      render(<DemoButton />);

      const button = screen.getByRole("button", { name: /デモ体験/i });
      fireEvent.click(button);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith("/dashboard");
      });
    });

    it("遷移後にルーターをリフレッシュする", async () => {
      mockCreateDemoSession.mockResolvedValue({
        success: true,
        data: {
          sessionId: "session-123",
          userId: "user-123",
          groupId: "group-123",
          expiresAt: new Date(),
        },
      });

      render(<DemoButton />);

      const button = screen.getByRole("button", { name: /デモ体験/i });
      fireEvent.click(button);

      await waitFor(() => {
        expect(mockRefresh).toHaveBeenCalled();
      });
    });
  });
});
