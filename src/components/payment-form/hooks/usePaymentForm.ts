"use client";

import { useState, useCallback } from "react";
import { validatePayment, type ValidationErrors } from "@/lib/validation/payment";
import { t } from "@/lib/i18n";

/** 割り勘タイプ */
export type SplitType = "equal" | "custom" | "proxy";

/**
 * フォームデータの型（送信時に使用）
 */
export type PaymentFormData = {
  amount: number;
  description: string;
  paymentDate: Date;
  categoryId: string | null;
  splitType: SplitType;
  proxyBeneficiaryId: string | null;
};

/**
 * usePaymentForm の戻り値の型
 */
export type UsePaymentFormReturn = {
  // 状態
  amount: string;
  description: string;
  paymentDate: string;
  categoryId: string;
  splitType: SplitType;
  proxyBeneficiaryId: string;
  errors: ValidationErrors;
  isSubmitting: boolean;

  // セッター
  setAmount: (value: string) => void;
  setDescription: (value: string) => void;
  setPaymentDate: (value: string) => void;
  setCategoryId: (value: string) => void;
  setSplitType: (value: SplitType) => void;
  setProxyBeneficiaryId: (value: string) => void;

  // アクション
  validate: (options?: { currentUserId?: string }) => boolean;
  reset: () => void;
  getFormData: () => PaymentFormData;
  handleSubmit: (onSubmit: (data: PaymentFormData) => Promise<void>) => Promise<void>;
};

/**
 * 今日の日付を YYYY-MM-DD 形式で取得
 */
function getTodayString(): string {
  return new Date().toISOString().split("T")[0];
}

/**
 * 支払いフォームの共通ロジックを提供するカスタムフック
 *
 * @example
 * ```tsx
 * function PaymentForm({ onSubmit }) {
 *   const form = usePaymentForm();
 *
 *   return (
 *     <form onSubmit={(e) => { e.preventDefault(); form.handleSubmit(onSubmit); }}>
 *       <input value={form.amount} onChange={(e) => form.setAmount(e.target.value)} />
 *       ...
 *     </form>
 *   );
 * }
 * ```
 */
export function usePaymentForm(): UsePaymentFormReturn {
  // 状態
  const [amount, setAmountRaw] = useState("");
  const [description, setDescription] = useState("");
  const [paymentDate, setPaymentDate] = useState(getTodayString);
  const [categoryId, setCategoryId] = useState("");
  const [splitType, setSplitType] = useState<SplitType>("equal");
  const [proxyBeneficiaryId, setProxyBeneficiaryId] = useState("");
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 金額のセッター（数値以外を除去）
  const setAmount = useCallback((value: string) => {
    setAmountRaw(value.replace(/[^0-9]/g, ""));
  }, []);

  // バリデーション
  const validate = useCallback((options?: { currentUserId?: string }): boolean => {
    const input = {
      amount: amount === "" ? 0 : parseFloat(amount),
      description,
      paymentDate: new Date(paymentDate),
    };

    const result = validatePayment(input);

    const allErrors: ValidationErrors = result.success ? {} : { ...result.errors };

    // 代理購入時の追加バリデーション
    if (splitType === "proxy") {
      if (!proxyBeneficiaryId) {
        allErrors.proxyBeneficiaryId = t("payments.validation.beneficiaryRequired");
      } else if (options?.currentUserId && proxyBeneficiaryId === options.currentUserId) {
        allErrors.proxyBeneficiaryId = t("payments.validation.beneficiarySameAsPayer");
      }
    }

    if (Object.keys(allErrors).length > 0) {
      setErrors(allErrors);
      return false;
    }

    setErrors({});
    return true;
  }, [amount, description, paymentDate, splitType, proxyBeneficiaryId]);

  // リセット
  const reset = useCallback(() => {
    setAmountRaw("");
    setDescription("");
    setPaymentDate(getTodayString());
    setCategoryId("");
    setSplitType("equal");
    setProxyBeneficiaryId("");
    setErrors({});
  }, []);

  // フォームデータ取得
  const getFormData = useCallback((): PaymentFormData => {
    return {
      amount: parseFloat(amount) || 0,
      description: description.trim(),
      paymentDate: new Date(paymentDate),
      categoryId: categoryId || null,
      splitType,
      proxyBeneficiaryId: splitType === "proxy" ? proxyBeneficiaryId || null : null,
    };
  }, [amount, description, paymentDate, categoryId, splitType, proxyBeneficiaryId]);

  // 送信ハンドラ
  const handleSubmit = useCallback(
    async (onSubmit: (data: PaymentFormData) => Promise<void>): Promise<void> => {
      // バリデーション
      if (!validate()) {
        return;
      }

      setIsSubmitting(true);

      try {
        await onSubmit(getFormData());
        // 成功時のみリセット
        reset();
      } catch (error) {
        // エラー時はリセットしない、再スロー
        throw error;
      } finally {
        setIsSubmitting(false);
      }
    },
    [validate, getFormData, reset]
  );

  return {
    // 状態
    amount,
    description,
    paymentDate,
    categoryId,
    splitType,
    proxyBeneficiaryId,
    errors,
    isSubmitting,

    // セッター
    setAmount,
    setDescription,
    setPaymentDate,
    setCategoryId,
    setSplitType,
    setProxyBeneficiaryId,

    // アクション
    validate,
    reset,
    getFormData,
    handleSubmit,
  };
}
