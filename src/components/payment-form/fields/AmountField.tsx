"use client";

import { memo } from "react";
import { t } from "@/lib/i18n";

export type AmountFieldProps = {
  value: string;
  onChange: (value: string) => void;
  error?: string;
  id?: string;
};

/**
 * 金額入力フィールド
 *
 * - 数値のみ入力可能（inputMode="numeric", pattern="[0-9]*"）
 * - 通貨記号を左側に表示
 * - エラー時は赤枠とエラーメッセージを表示
 * - React.memo でメモ化（パフォーマンス最適化）
 * - モバイル最適化：タップ領域44px確保
 */
export const AmountField = memo(function AmountField({
  value,
  onChange,
  error,
  id = "payment-amount",
}: AmountFieldProps) {
  const errorId = `${id}-error`;

  return (
    <div>
      <label
        htmlFor={id}
        className="block text-sm font-medium text-gray-700 mb-1"
      >
        {t("payments.form.amount")}
      </label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-700 pointer-events-none">
          {t("common.currency")}
        </span>
        <input
          id={id}
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
});
