import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { DeletePaymentForm } from "@/components/DeletePaymentButton";

// next/navigation のモック
const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: mockRefresh,
  }),
}));

// fetch のモック
const mockFetch = vi.fn();
global.fetch = mockFetch;

// window.confirm のモック
const mockConfirm = vi.fn();
global.confirm = mockConfirm;

describe("DeletePaymentForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConfirm.mockReturnValue(true);
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });
  });

  describe("表示", () => {
    it("削除ボタンが表示される", () => {
      render(
        <DeletePaymentForm paymentId="payment-1" groupId="group-1" />
      );

      const button = screen.getByRole("button", { name: /削除/i });
      expect(button).toBeInTheDocument();
    });

    it("削除ボタンはbuttonタイプである", () => {
      render(
        <DeletePaymentForm paymentId="payment-1" groupId="group-1" />
      );

      const button = screen.getByRole("button", { name: /削除/i });
      expect(button).toHaveAttribute("type", "button");
    });
  });

  describe("ボタンのスタイル", () => {
    it("削除ボタンは赤いテキスト色を持つ", () => {
      render(
        <DeletePaymentForm paymentId="payment-1" groupId="group-1" />
      );

      const button = screen.getByRole("button", { name: /削除/i });
      expect(button.className).toContain("text-red-600");
    });
  });

  describe("削除動作", () => {
    it("確認ダイアログでキャンセルすると削除しない", async () => {
      mockConfirm.mockReturnValue(false);

      render(
        <DeletePaymentForm paymentId="payment-1" groupId="group-1" />
      );

      const button = screen.getByRole("button", { name: /削除/i });
      fireEvent.click(button);

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("確認ダイアログで承認すると削除APIを呼び出す", async () => {
      mockConfirm.mockReturnValue(true);

      render(
        <DeletePaymentForm paymentId="payment-1" groupId="group-1" />
      );

      const button = screen.getByRole("button", { name: /削除/i });
      fireEvent.click(button);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith("/api/payments/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paymentId: "payment-1", groupId: "group-1" }),
        });
      });
    });

    it("削除成功後にページをリフレッシュする", async () => {
      mockConfirm.mockReturnValue(true);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      render(
        <DeletePaymentForm paymentId="payment-1" groupId="group-1" />
      );

      const button = screen.getByRole("button", { name: /削除/i });
      fireEvent.click(button);

      await waitFor(() => {
        expect(mockRefresh).toHaveBeenCalled();
      });
    });
  });
});
