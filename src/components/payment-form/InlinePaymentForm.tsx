"use client";

import { useRef, useState, useEffect } from "react";
import { usePaymentForm, type PaymentFormData } from "./hooks/usePaymentForm";
import { AmountFieldWithKeypad } from "./fields";
import { Button } from "@/components/ui/Button";
import { t } from "@/lib/i18n";
import type { Category } from "@/types/database";

export type { PaymentFormData };

type InlinePaymentFormProps = {
  onSubmit: (data: PaymentFormData) => Promise<void>;
  categories?: Category[];
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
export function InlinePaymentForm({ onSubmit, categories = [] }: InlinePaymentFormProps) {
  const form = usePaymentForm();

  // フィールドへのref（エラー時フォーカス用）
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


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // バリデーション実行
    const isValid = form.validate();

    if (!isValid) {
      // エラー時に最初のエラーフィールドにフォーカス
      if (form.errors.amount) {
        document.getElementById("payment-amount")?.focus();
      } else if (form.errors.description) {
        descriptionRef.current?.focus();
      } else if (form.errors.paymentDate) {
        dateRef.current?.focus();
      }
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
      if (form.errors.amount) {
        document.getElementById("payment-amount")?.focus();
      } else if (form.errors.description) {
        descriptionRef.current?.focus();
      } else if (form.errors.paymentDate) {
        dateRef.current?.focus();
      }
    }
  }, [form.errors]);

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

      <AmountFieldWithKeypad
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

      {/* カテゴリ選択 */}
      {categories.length > 0 && (
        <div>
          <label
            htmlFor="payment-category"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            {t("payments.form.category")}
          </label>
          <select
            id="payment-category"
            value={form.categoryId}
            onChange={(e) => form.setCategoryId(e.target.value)}
            className="block w-full px-3 py-3 border border-gray-300 rounded-lg shadow-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
          >
            <option value="">{t("payments.form.selectCategory")}</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.icon} {category.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <Button
        type="submit"
        variant="primary"
        size="md"
        fullWidth
        loading={form.isSubmitting}
      >
        {form.isSubmitting
          ? t("payments.form.submitting")
          : t("payments.form.submit")}
      </Button>
    </form>
  );
}

// ============================================
// ref対応ラッパーコンポーネント
// ============================================

import { forwardRef, memo } from "react";

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
