import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePaymentForm } from "@/components/payment-form/hooks/usePaymentForm";
import { t } from "@/lib/i18n";

describe("usePaymentForm", () => {
  // ============================================
  // 初期状態テスト
  // ============================================
  describe("初期状態", () => {
    it("金額の初期値は空文字である", () => {
      const { result } = renderHook(() => usePaymentForm());
      expect(result.current.amount).toBe("");
    });

    it("説明の初期値は空文字である", () => {
      const { result } = renderHook(() => usePaymentForm());
      expect(result.current.description).toBe("");
    });

    it("日付の初期値は今日である", () => {
      const { result } = renderHook(() => usePaymentForm());
      const today = new Date().toISOString().split("T")[0];
      expect(result.current.paymentDate).toBe(today);
    });

    it("エラーの初期値は空オブジェクトである", () => {
      const { result } = renderHook(() => usePaymentForm());
      expect(result.current.errors).toEqual({});
    });

    it("isSubmitting の初期値は false である", () => {
      const { result } = renderHook(() => usePaymentForm());
      expect(result.current.isSubmitting).toBe(false);
    });

    it("splitType の初期値は 'equal' である", () => {
      const { result } = renderHook(() => usePaymentForm());
      expect(result.current.splitType).toBe("equal");
    });

    it("proxyBeneficiaryId の初期値は空文字である", () => {
      const { result } = renderHook(() => usePaymentForm());
      expect(result.current.proxyBeneficiaryId).toBe("");
    });
  });

  // ============================================
  // フィールド変更テスト
  // ============================================
  describe("フィールド変更", () => {
    it("setAmount で金額を更新できる", () => {
      const { result } = renderHook(() => usePaymentForm());

      act(() => {
        result.current.setAmount("1500");
      });

      expect(result.current.amount).toBe("1500");
    });

    it("setAmount は数値以外を除去する", () => {
      const { result } = renderHook(() => usePaymentForm());

      act(() => {
        result.current.setAmount("1,500円");
      });

      expect(result.current.amount).toBe("1500");
    });

    it("setDescription で説明を更新できる", () => {
      const { result } = renderHook(() => usePaymentForm());

      act(() => {
        result.current.setDescription("スーパーで買い物");
      });

      expect(result.current.description).toBe("スーパーで買い物");
    });

    it("setPaymentDate で日付を更新できる", () => {
      const { result } = renderHook(() => usePaymentForm());

      act(() => {
        result.current.setPaymentDate("2024-01-15");
      });

      expect(result.current.paymentDate).toBe("2024-01-15");
    });
  });

  // ============================================
  // バリデーションテスト（異常系ファースト）
  // ============================================
  describe("バリデーション", () => {
    it("金額が空の場合エラーを返す", () => {
      const { result } = renderHook(() => usePaymentForm());

      act(() => {
        result.current.setDescription("テスト");
      });

      let isValid: boolean;
      act(() => {
        isValid = result.current.validate();
      });

      expect(isValid!).toBe(false);
      expect(result.current.errors.amount).toBe(t("payments.validation.amountMin"));
    });

    it("金額が0の場合エラーを返す", () => {
      const { result } = renderHook(() => usePaymentForm());

      act(() => {
        result.current.setAmount("0");
        result.current.setDescription("テスト");
      });

      let isValid: boolean;
      act(() => {
        isValid = result.current.validate();
      });

      expect(isValid!).toBe(false);
      expect(result.current.errors.amount).toBe(t("payments.validation.amountMin"));
    });

    it("金額が100万円を超える場合エラーを返す", () => {
      const { result } = renderHook(() => usePaymentForm());

      act(() => {
        result.current.setAmount("1000001");
        result.current.setDescription("テスト");
      });

      let isValid: boolean;
      act(() => {
        isValid = result.current.validate();
      });

      expect(isValid!).toBe(false);
      expect(result.current.errors.amount).toBe(t("payments.validation.amountMax"));
    });

    it("説明が空の場合エラーを返す", () => {
      const { result } = renderHook(() => usePaymentForm());

      act(() => {
        result.current.setAmount("1000");
      });

      let isValid: boolean;
      act(() => {
        isValid = result.current.validate();
      });

      expect(isValid!).toBe(false);
      expect(result.current.errors.description).toBe(
        t("payments.validation.descriptionRequired")
      );
    });

    it("説明が100文字を超える場合エラーを返す", () => {
      const { result } = renderHook(() => usePaymentForm());

      act(() => {
        result.current.setAmount("1000");
        result.current.setDescription("あ".repeat(101));
      });

      let isValid: boolean;
      act(() => {
        isValid = result.current.validate();
      });

      expect(isValid!).toBe(false);
      expect(result.current.errors.description).toBe(
        t("payments.validation.descriptionMax")
      );
    });

    it("未来の日付の場合エラーを返す", () => {
      const { result } = renderHook(() => usePaymentForm());

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split("T")[0];

      act(() => {
        result.current.setAmount("1000");
        result.current.setDescription("テスト");
        result.current.setPaymentDate(tomorrowStr);
      });

      let isValid: boolean;
      act(() => {
        isValid = result.current.validate();
      });

      expect(isValid!).toBe(false);
      expect(result.current.errors.paymentDate).toBe(
        t("payments.validation.dateFuture")
      );
    });

    it("1年以上前の日付の場合エラーを返す", () => {
      const { result } = renderHook(() => usePaymentForm());

      const tooOld = new Date();
      tooOld.setFullYear(tooOld.getFullYear() - 1);
      tooOld.setDate(tooOld.getDate() - 1);
      const tooOldStr = tooOld.toISOString().split("T")[0];

      act(() => {
        result.current.setAmount("1000");
        result.current.setDescription("テスト");
        result.current.setPaymentDate(tooOldStr);
      });

      let isValid: boolean;
      act(() => {
        isValid = result.current.validate();
      });

      expect(isValid!).toBe(false);
      expect(result.current.errors.paymentDate).toBe(
        t("payments.validation.dateTooOld")
      );
    });

    it("複数のエラーがある場合すべて返す", () => {
      const { result } = renderHook(() => usePaymentForm());

      // 何も入力しない状態で validate
      let isValid: boolean;
      act(() => {
        isValid = result.current.validate();
      });

      expect(isValid!).toBe(false);
      expect(result.current.errors.amount).toBeDefined();
      expect(result.current.errors.description).toBeDefined();
    });

    it("代理購入で受益者未選択の場合エラーを返す", () => {
      const { result } = renderHook(() => usePaymentForm());

      act(() => {
        result.current.setAmount("1000");
        result.current.setDescription("テスト");
        result.current.setSplitType("proxy");
      });

      let isValid: boolean;
      act(() => {
        isValid = result.current.validate();
      });

      expect(isValid!).toBe(false);
      expect(result.current.errors.proxyBeneficiaryId).toBe(
        t("payments.validation.beneficiaryRequired")
      );
    });

    it("代理購入で受益者が支払者と同じ場合エラーを返す", () => {
      const { result } = renderHook(() => usePaymentForm());

      act(() => {
        result.current.setAmount("1000");
        result.current.setDescription("テスト");
        result.current.setSplitType("proxy");
        result.current.setProxyBeneficiaryId("user-1");
      });

      let isValid: boolean;
      act(() => {
        isValid = result.current.validate({ currentUserId: "user-1" });
      });

      expect(isValid!).toBe(false);
      expect(result.current.errors.proxyBeneficiaryId).toBe(
        t("payments.validation.beneficiarySameAsPayer")
      );
    });

    it("代理購入で受益者が正しく選択されている場合は通る", () => {
      const { result } = renderHook(() => usePaymentForm());

      act(() => {
        result.current.setAmount("1000");
        result.current.setDescription("テスト");
        result.current.setSplitType("proxy");
        result.current.setProxyBeneficiaryId("user-2");
      });

      let isValid: boolean;
      act(() => {
        isValid = result.current.validate({ currentUserId: "user-1" });
      });

      expect(isValid!).toBe(true);
    });

    it("有効な入力の場合 true を返しエラーをクリアする", () => {
      const { result } = renderHook(() => usePaymentForm());

      act(() => {
        result.current.setAmount("1500");
        result.current.setDescription("スーパーで買い物");
      });

      let isValid: boolean;
      act(() => {
        isValid = result.current.validate();
      });

      expect(isValid!).toBe(true);
      expect(result.current.errors).toEqual({});
    });
  });

  // ============================================
  // リセットテスト
  // ============================================
  describe("リセット", () => {
    it("reset でフォームを初期状態に戻せる", () => {
      const { result } = renderHook(() => usePaymentForm());

      // 値を変更
      act(() => {
        result.current.setAmount("1500");
        result.current.setDescription("テスト");
        result.current.setPaymentDate("2024-01-15");
        result.current.setSplitType("proxy");
        result.current.setProxyBeneficiaryId("user-2");
      });

      // リセット
      act(() => {
        result.current.reset();
      });

      const today = new Date().toISOString().split("T")[0];
      expect(result.current.amount).toBe("");
      expect(result.current.description).toBe("");
      expect(result.current.paymentDate).toBe(today);
      expect(result.current.splitType).toBe("equal");
      expect(result.current.proxyBeneficiaryId).toBe("");
      expect(result.current.errors).toEqual({});
    });

    it("reset でエラーもクリアされる", () => {
      const { result } = renderHook(() => usePaymentForm());

      // バリデーションエラーを発生させる
      act(() => {
        result.current.validate();
      });

      expect(Object.keys(result.current.errors).length).toBeGreaterThan(0);

      // リセット
      act(() => {
        result.current.reset();
      });

      expect(result.current.errors).toEqual({});
    });
  });

  // ============================================
  // getFormData テスト
  // ============================================
  describe("getFormData", () => {
    it("フォームデータを適切な型で取得できる", () => {
      const { result } = renderHook(() => usePaymentForm());

      act(() => {
        result.current.setAmount("1500");
        result.current.setDescription("  スーパーで買い物  ");
        result.current.setPaymentDate("2024-01-15");
      });

      const formData = result.current.getFormData();

      expect(formData).toEqual({
        amount: 1500,
        description: "スーパーで買い物", // トリム済み
        paymentDate: new Date("2024-01-15"),
        categoryId: null,
        splitType: "equal",
        proxyBeneficiaryId: null,
      });
    });
  });

  // ============================================
  // handleSubmit テスト
  // ============================================
  describe("handleSubmit", () => {
    it("バリデーション失敗時はコールバックを呼ばない", async () => {
      const { result } = renderHook(() => usePaymentForm());
      const onSubmit = vi.fn();

      await act(async () => {
        await result.current.handleSubmit(onSubmit);
      });

      expect(onSubmit).not.toHaveBeenCalled();
    });

    it("バリデーション成功時はコールバックを呼ぶ", async () => {
      const { result } = renderHook(() => usePaymentForm());
      const onSubmit = vi.fn().mockResolvedValue(undefined);

      act(() => {
        result.current.setAmount("1500");
        result.current.setDescription("テスト");
      });

      await act(async () => {
        await result.current.handleSubmit(onSubmit);
      });

      expect(onSubmit).toHaveBeenCalledTimes(1);
      expect(onSubmit).toHaveBeenCalledWith({
        amount: 1500,
        description: "テスト",
        paymentDate: expect.any(Date),
        categoryId: null,
        splitType: "equal",
        proxyBeneficiaryId: null,
      });
    });

    it("送信中は isSubmitting が true になる", async () => {
      const { result } = renderHook(() => usePaymentForm());
      let resolveSubmit: () => void;
      const onSubmit = vi.fn().mockImplementation(
        () => new Promise<void>((resolve) => {
          resolveSubmit = resolve;
        })
      );

      act(() => {
        result.current.setAmount("1500");
        result.current.setDescription("テスト");
      });

      // 送信開始（await しない）
      let submitPromise: Promise<void>;
      act(() => {
        submitPromise = result.current.handleSubmit(onSubmit);
      });

      // 送信中
      expect(result.current.isSubmitting).toBe(true);

      // 送信完了
      await act(async () => {
        resolveSubmit!();
        await submitPromise;
      });

      expect(result.current.isSubmitting).toBe(false);
    });

    it("送信成功後はフォームがリセットされる", async () => {
      const { result } = renderHook(() => usePaymentForm());
      const onSubmit = vi.fn().mockResolvedValue(undefined);

      act(() => {
        result.current.setAmount("1500");
        result.current.setDescription("テスト");
      });

      await act(async () => {
        await result.current.handleSubmit(onSubmit);
      });

      expect(result.current.amount).toBe("");
      expect(result.current.description).toBe("");
    });

    it("送信失敗時はフォームがリセットされない", async () => {
      const { result } = renderHook(() => usePaymentForm());
      const onSubmit = vi.fn().mockRejectedValue(new Error("API Error"));

      act(() => {
        result.current.setAmount("1500");
        result.current.setDescription("テスト");
      });

      await act(async () => {
        try {
          await result.current.handleSubmit(onSubmit);
        } catch {
          // エラーを握りつぶす（テスト目的）
        }
      });

      // フォームはリセットされない
      expect(result.current.amount).toBe("1500");
      expect(result.current.description).toBe("テスト");
      expect(result.current.isSubmitting).toBe(false);
    });
  });
});
