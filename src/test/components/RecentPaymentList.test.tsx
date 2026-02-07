/**
 * RecentPaymentList コンポーネントのテスト
 *
 * Phase 2-2 最終 Step: Suspense 対応の支払い一覧
 *
 * TDD Red Phase: まずテストを書き、失敗することを確認
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { RecentPaymentList } from "@/components/payment-list/RecentPaymentList";

// Mock Supabase
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";

describe("RecentPaymentList", () => {
  const mockPayments = [
    {
      id: "1",
      amount: 1500,
      description: "スーパーで買い物",
      payment_date: "2026-01-25",
      payer_id: "user-1",
      profiles: { display_name: "田中太郎", email: "tanaka@example.com" },
      payment_splits: [],
    },
    {
      id: "2",
      amount: 3000,
      description: "電気代",
      payment_date: "2026-01-24",
      payer_id: "user-2",
      profiles: { display_name: null, email: "suzuki@example.com" },
      payment_splits: [],
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("支払いがある場合", () => {
    beforeEach(() => {
      const orderResult = {
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: mockPayments }),
      } as Record<string, ReturnType<typeof vi.fn>>;
      orderResult.order.mockReturnValue(orderResult);

      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue(orderResult),
            }),
          }),
        }),
      };
      vi.mocked(createClient).mockResolvedValue(mockSupabase as never);
    });

    it("支払い一覧が表示される", async () => {
      const { container } = render(await RecentPaymentList({ groupId: "test-group-id" }));

      expect(container.textContent).toContain("スーパーで買い物");
      expect(container.textContent).toContain("電気代");
    });

    it("金額がフォーマットされて表示される", async () => {
      const { container } = render(await RecentPaymentList({ groupId: "test-group-id" }));

      expect(container.textContent).toContain("¥1,500");
      expect(container.textContent).toContain("¥3,000");
    });

    it("支払者名が表示される（display_name優先）", async () => {
      const { container } = render(await RecentPaymentList({ groupId: "test-group-id" }));

      expect(container.textContent).toContain("田中太郎");
    });

    it("display_nameがない場合はemailが表示される", async () => {
      const { container } = render(await RecentPaymentList({ groupId: "test-group-id" }));

      expect(container.textContent).toContain("suzuki@example.com");
    });

    it("日付が表示される", async () => {
      const { container } = render(await RecentPaymentList({ groupId: "test-group-id" }));

      expect(container.textContent).toContain("2026-01-25");
      expect(container.textContent).toContain("2026-01-24");
    });
  });

  describe("支払いがない場合", () => {
    beforeEach(() => {
      const orderResult = {
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: [] }),
      } as Record<string, ReturnType<typeof vi.fn>>;
      orderResult.order.mockReturnValue(orderResult);

      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue(orderResult),
            }),
          }),
        }),
      };
      vi.mocked(createClient).mockResolvedValue(mockSupabase as never);
    });

    it("空メッセージが表示される", async () => {
      render(await RecentPaymentList({ groupId: "test-group-id" }));

      expect(screen.getByText(/支払いがありません/)).toBeInTheDocument();
    });
  });
});
