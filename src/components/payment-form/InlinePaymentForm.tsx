"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { usePaymentForm, type PaymentFormData } from "./hooks/usePaymentForm";
import { AmountField, DescriptionField, DateField } from "./fields";
import { t } from "@/lib/i18n";

export type { PaymentFormData };

type InlinePaymentFormProps = {
  onSubmit: (data: PaymentFormData) => Promise<void>;
};

/**
 * インライン用のシンプルな支払い登録フォーム
 *
 * /groups/[id] ページで使用
 * 金額・説明・日付のみの入力
 *
 * UX改善:
 * - エラー時に最初のエラーフィールドにフォーカス
 * - 送信成功時に柔らかいフィードバック表示
 * - モバイル最適化されたタップ領域
 */
export function InlinePaymentForm({ onSubmit }: InlinePaymentFormProps) {
  const form = usePaymentForm();

  // フィールドへのref（エラー時フォーカス用）
  const amountRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);

  // 成功フィードバック状態
  const [showSuccess, setShowSuccess] = useState(false);

  // 成功メッセージを一定時間後に消す
  useEffect(() => {
    if (showSuccess) {
      const timer = setTimeout(() => {
        setShowSuccess(false);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [showSuccess]);

  // エラー時に最初のエラーフィールドにフォーカス
  const focusFirstError = useCallback((errors: typeof form.errors) => {
    if (errors.amount) {
      amountRef.current?.focus();
    } else if (errors.description) {
      descriptionRef.current?.focus();
    } else if (errors.paymentDate) {
      dateRef.current?.focus();
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // バリデーション実行
    const isValid = form.validate();

    if (!isValid) {
      // エラー時に最初のエラーフィールドにフォーカス
      focusFirstError(form.errors);
      return;
    }

    try {
      await form.handleSubmit(onSubmit);
      // 成功フィードバックを表示
      setShowSuccess(true);
    } catch {
      // エラーハンドリングは親コンポーネントに委譲
    }
  };

  // バリデーション後にエラーがあればフォーカス
  useEffect(() => {
    if (Object.keys(form.errors).length > 0) {
      focusFirstError(form.errors);
    }
  }, [form.errors, focusFirstError]);

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* 成功フィードバック */}
      {showSuccess && (
        <div
          className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm animate-fade-in"
          role="status"
          aria-live="polite"
        >
          {t("payments.form.submitSuccess")}
        </div>
      )}

      <AmountFieldWithRef
        ref={amountRef}
        value={form.amount}
        onChange={form.setAmount}
        error={form.errors.amount}
      />

      <DescriptionFieldWithRef
        ref={descriptionRef}
        value={form.description}
        onChange={form.setDescription}
        error={form.errors.description}
      />

      <DateFieldWithRef
        ref={dateRef}
        value={form.paymentDate}
        onChange={form.setPaymentDate}
        error={form.errors.paymentDate}
      />

      <button
        type="submit"
        disabled={form.isSubmitting}
        className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {form.isSubmitting
          ? t("payments.form.submitting")
          : t("payments.form.submit")}
      </button>
    </form>
  );
}

// ============================================
// ref対応ラッパーコンポーネント
// ============================================

import { forwardRef, memo } from "react";

type AmountFieldWithRefProps = {
  value: string;
  onChange: (value: string) => void;
  error?: string;
};

const AmountFieldWithRef = memo(
  forwardRef<HTMLInputElement, AmountFieldWithRefProps>(
    function AmountFieldWithRef({ value, onChange, error }, ref) {
      const errorId = "payment-amount-error";

      return (
        <div>
          <label
            htmlFor="payment-amount"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            {t("payments.form.amount")}
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-700 pointer-events-none">
              {t("common.currency")}
            </span>
            <input
              ref={ref}
              id="payment-amount"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={t("payments.form.amountPlaceholder")}
              className={`block w-full pl-8 pr-3 py-3 border rounded-lg shadow-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                error ? "border-red-500" : "border-gray-300"
              }`}
              aria-invalid={!!error}
              aria-describedby={error ? errorId : undefined}
            />
          </div>
          {error && (
            <p id={errorId} className="mt-1 text-sm text-red-600" role="alert">
              {error}
            </p>
          )}
        </div>
      );
    }
  )
);

type DescriptionFieldWithRefProps = {
  value: string;
  onChange: (value: string) => void;
  error?: string;
};

const DescriptionFieldWithRef = memo(
  forwardRef<HTMLInputElement, DescriptionFieldWithRefProps>(
    function DescriptionFieldWithRef({ value, onChange, error }, ref) {
      const errorId = "payment-description-error";

      return (
        <div>
          <label
            htmlFor="payment-description"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            {t("payments.form.description")}
          </label>
          <input
            ref={ref}
            id="payment-description"
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={t("payments.form.descriptionPlaceholder")}
            className={`block w-full px-3 py-3 border rounded-lg shadow-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
              error ? "border-red-500" : "border-gray-300"
            }`}
            aria-invalid={!!error}
            aria-describedby={error ? errorId : undefined}
          />
          {error && (
            <p id={errorId} className="mt-1 text-sm text-red-600" role="alert">
              {error}
            </p>
          )}
        </div>
      );
    }
  )
);

type DateFieldWithRefProps = {
  value: string;
  onChange: (value: string) => void;
  error?: string;
};

const DateFieldWithRef = memo(
  forwardRef<HTMLInputElement, DateFieldWithRefProps>(
    function DateFieldWithRef({ value, onChange, error }, ref) {
      const errorId = "payment-date-error";

      return (
        <div>
          <label
            htmlFor="payment-date"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            {t("payments.form.date")}
          </label>
          <input
            ref={ref}
            id="payment-date"
            type="date"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={`block w-full px-3 py-3 border rounded-lg shadow-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
              error ? "border-red-500" : "border-gray-300"
            }`}
            aria-invalid={!!error}
            aria-describedby={error ? errorId : undefined}
          />
          {error && (
            <p id={errorId} className="mt-1 text-sm text-red-600" role="alert">
              {error}
            </p>
          )}
        </div>
      );
    }
  )
);
