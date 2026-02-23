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
  /** amount・description・errors のみクリア。日付・splitType 等は維持（連続入力モード用） */
  resetForNext: () => void;
  /** フルリセット（resetForNext + 日付・カテゴリ・split 設定をデフォルトに戻す） */
  reset: () => void;
  getFormData: () => PaymentFormData;
  /** 送信後フルリセット */
  handleSubmit: (onSubmit: (data: PaymentFormData) => Promise<void>) => Promise<void>;
  /** 送信後に resetForNext（「保存して次へ」用） */
  handleSubmitAndNext: (onSubmit: (data: PaymentFormData) => Promise<void>) => Promise<void>;
};

/** 今日の日付を YYYY-MM-DD 形式で取得 */
function getTodayString(): string {
  return new Date().toISOString().split("T")[0];
}

/**
 * usePaymentForm の初期値（編集モード用）
 */
export type PaymentFormInitialData = {
  amount: string;
  description: string;
  paymentDate: string;
  categoryId: string;
  splitType: SplitType;
  proxyBeneficiaryId: string;
};

/**
 * 支払いフォームの共通ロジックを提供するカスタムフック
 *
 * @param initialData 編集モード時の初期値（省略時は新規作成モード）
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
export function usePaymentForm(initialData?: PaymentFormInitialData): UsePaymentFormReturn {
  const [amount, setAmountRaw] = useState(initialData?.amount ?? "");
  const [description, setDescription] = useState(initialData?.description ?? "");
  const [paymentDate, setPaymentDate] = useState(initialData?.paymentDate ?? getTodayString());
  const [categoryId, setCategoryId] = useState(initialData?.categoryId ?? "");
  const [splitType, setSplitType] = useState<SplitType>(initialData?.splitType ?? "equal");
  const [proxyBeneficiaryId, setProxyBeneficiaryId] = useState(initialData?.proxyBeneficiaryId ?? "");
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

  // 連続入力モード用部分リセット: amount・description・errors のみクリア
  const resetForNext = useCallback(() => {
    setAmountRaw("");
    setDescription("");
    setErrors({});
  }, []);

  // フルリセット: resetForNext + 残りのフィールドをデフォルトに戻す
  const reset = useCallback(() => {
    resetForNext();
    setPaymentDate(getTodayString());
    setCategoryId("");
    setSplitType("equal");
    setProxyBeneficiaryId("");
  }, [resetForNext]);

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

  // 送信の共通ロジック（afterSuccess で reset/resetForNext を切り替える）
  const runSubmit = useCallback(
    async (
      onSubmit: (data: PaymentFormData) => Promise<void>,
      afterSuccess: () => void
    ): Promise<void> => {
      if (!validate()) return;

      setIsSubmitting(true);
      try {
        await onSubmit(getFormData());
        afterSuccess();
      } catch (error) {
        throw error;
      } finally {
        setIsSubmitting(false);
      }
    },
    [validate, getFormData]
  );

  const handleSubmit = useCallback(
    (onSubmit: (data: PaymentFormData) => Promise<void>) => runSubmit(onSubmit, reset),
    [runSubmit, reset]
  );

  const handleSubmitAndNext = useCallback(
    (onSubmit: (data: PaymentFormData) => Promise<void>) => runSubmit(onSubmit, resetForNext),
    [runSubmit, resetForNext]
  );

  return {
    amount,
    description,
    paymentDate,
    categoryId,
    splitType,
    proxyBeneficiaryId,
    errors,
    isSubmitting,

    setAmount,
    setDescription,
    setPaymentDate,
    setCategoryId,
    setSplitType,
    setProxyBeneficiaryId,

    validate,
    resetForNext,
    reset,
    getFormData,
    handleSubmit,
    handleSubmitAndNext,
  };
}
