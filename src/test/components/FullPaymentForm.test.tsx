import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import FullPaymentForm from "@/components/payment-form/FullPaymentForm";
import type { DuplicatePaymentData } from "@/components/payment-form/FullPaymentForm";
import type { Group, Category, Profile } from "@/types/database";

// Next.js router mock
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

// Supabase client mock
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: vi.fn(),
  }),
}));

const mockGroup: Group = {
  id: "group-1",
  name: "テストグループ",
  description: null,
  owner_id: "user-1",
  invite_code: "abc123",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const mockCategory: Category = {
  id: "cat-1",
  name: "食費・日用品",
  icon: "🛒",
  color: null,
  is_default: true,
  group_id: null,
  created_at: "2026-01-01T00:00:00Z",
};

const mockCurrentUser: Profile = {
  id: "user-1",
  display_name: "テストユーザー",
  email: "test@example.com",
  avatar_url: null,
  is_demo: false,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const mockPartner: Profile = {
  id: "user-2",
  display_name: "パートナー",
  email: "partner@example.com",
  avatar_url: null,
  is_demo: false,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("FullPaymentForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("1人グループの割り勘ガード", () => {
    it("メンバーが1人のとき割り勘セクションを非表示", () => {
      render(
        <FullPaymentForm
          groups={[mockGroup]}
          categories={[mockCategory]}
          members={{ "group-1": [mockCurrentUser] }}
          currentUserId="user-1"
        />
      );

      // 割り勘ラジオボタンが表示されないことを確認
      expect(screen.queryByText("均等に分ける")).not.toBeInTheDocument();
      expect(screen.queryByText("カスタム")).not.toBeInTheDocument();
      expect(screen.queryByText("全額立替")).not.toBeInTheDocument();
    });

    it("メンバーが2人以上のとき割り勘セクションを表示", () => {
      render(
        <FullPaymentForm
          groups={[mockGroup]}
          categories={[mockCategory]}
          members={{ "group-1": [mockCurrentUser, mockPartner] }}
          currentUserId="user-1"
        />
      );

      expect(screen.getByText("均等に分ける")).toBeInTheDocument();
      expect(screen.getByText("カスタム")).toBeInTheDocument();
      expect(screen.getByText("全額立替")).toBeInTheDocument();
    });
  });

  describe("複製モードの可視化", () => {
    const duplicateData: DuplicatePaymentData = {
      groupId: "group-1",
      amount: 1500,
      description: "スーパーで買い物",
      categoryId: "cat-1",
      paymentDate: "2026-01-15",
      splitType: "equal",
      proxyBeneficiaryId: null,
      customSplits: {},
    };

    it("複製時にバッジが表示される", () => {
      render(
        <FullPaymentForm
          groups={[mockGroup]}
          categories={[mockCategory]}
          members={{ "group-1": [mockCurrentUser, mockPartner] }}
          currentUserId="user-1"
          duplicateData={duplicateData}
        />
      );

      expect(screen.getByText("内容をコピーして新規作成")).toBeInTheDocument();
    });

    it("複製時にボタンが「複製を保存」になる", () => {
      render(
        <FullPaymentForm
          groups={[mockGroup]}
          categories={[mockCategory]}
          members={{ "group-1": [mockCurrentUser, mockPartner] }}
          currentUserId="user-1"
          duplicateData={duplicateData}
        />
      );

      expect(screen.getByRole("button", { name: "複製を保存" })).toBeInTheDocument();
    });

    it("通常モードではバッジが非表示", () => {
      render(
        <FullPaymentForm
          groups={[mockGroup]}
          categories={[mockCategory]}
          members={{ "group-1": [mockCurrentUser, mockPartner] }}
          currentUserId="user-1"
        />
      );

      expect(screen.queryByText("内容をコピーして新規作成")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "登録する" })).toBeInTheDocument();
    });

    it("複製時に金額が事前入力される", () => {
      render(
        <FullPaymentForm
          groups={[mockGroup]}
          categories={[mockCategory]}
          members={{ "group-1": [mockCurrentUser, mockPartner] }}
          currentUserId="user-1"
          duplicateData={duplicateData}
        />
      );

      const amountInput = screen.getByLabelText("金額") as HTMLInputElement;
      expect(amountInput.value).toBe("1500");
    });
  });
});
