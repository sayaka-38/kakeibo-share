"use client";

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
 */
export function InlinePaymentForm({ onSubmit }: InlinePaymentFormProps) {
  const form = usePaymentForm();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await form.handleSubmit(onSubmit);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <AmountField
        value={form.amount}
        onChange={form.setAmount}
        error={form.errors.amount}
      />

      <DescriptionField
        value={form.description}
        onChange={form.setDescription}
        error={form.errors.description}
      />

      <DateField
        value={form.paymentDate}
        onChange={form.setPaymentDate}
        error={form.errors.paymentDate}
      />

      <button
        type="submit"
        disabled={form.isSubmitting}
        className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {form.isSubmitting
          ? t("payments.form.submitting")
          : t("payments.form.submit")}
      </button>
    </form>
  );
}
