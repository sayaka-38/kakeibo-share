"use client";

import { useState, useCallback } from "react";
import { validatePayment, type ValidationErrors } from "@/lib/validation/payment";

/**
 * フォームデータの型（送信時に使用）
 */
export type PaymentFormData = {
  amount: number;
  description: string;
  paymentDate: Date;
  categoryId: string | null;
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
  errors: ValidationErrors;
  isSubmitting: boolean;

  // セッター
  setAmount: (value: string) => void;
  setDescription: (value: string) => void;
  setPaymentDate: (value: string) => void;
  setCategoryId: (value: string) => void;

  // アクション
  validate: () => boolean;
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
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 金額のセッター（数値以外を除去）
  const setAmount = useCallback((value: string) => {
    setAmountRaw(value.replace(/[^0-9]/g, ""));
  }, []);

  // バリデーション
  const validate = useCallback((): boolean => {
    const input = {
      amount: amount === "" ? 0 : parseFloat(amount),
      description,
      paymentDate: new Date(paymentDate),
    };

    const result = validatePayment(input);

    if (!result.success) {
      setErrors(result.errors);
      return false;
    }

    setErrors({});
    return true;
  }, [amount, description, paymentDate]);

  // リセット
  const reset = useCallback(() => {
    setAmountRaw("");
    setDescription("");
    setPaymentDate(getTodayString());
    setCategoryId("");
    setErrors({});
  }, []);

  // フォームデータ取得
  const getFormData = useCallback((): PaymentFormData => {
    return {
      amount: parseFloat(amount) || 0,
      description: description.trim(),
      paymentDate: new Date(paymentDate),
      categoryId: categoryId || null,
    };
  }, [amount, description, paymentDate, categoryId]);

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
    errors,
    isSubmitting,

    // セッター
    setAmount,
    setDescription,
    setPaymentDate,
    setCategoryId,

    // アクション
    validate,
    reset,
    getFormData,
    handleSubmit,
  };
}
