"use client";

import { memo } from "react";
import { t } from "@/lib/i18n";

export type DateFieldProps = {
  value: string;
  onChange: (value: string) => void;
  error?: string;
  id?: string;
};

/**
 * 日付入力フィールド
 *
 * - type="date" による日付選択
 * - エラー時は赤枠とエラーメッセージを表示
 * - React.memo でメモ化（パフォーマンス最適化）
 * - モバイル最適化：タップ領域44px確保
 */
export const DateField = memo(function DateField({
  value,
  onChange,
  error,
  id = "payment-date",
}: DateFieldProps) {
  const errorId = `${id}-error`;

  return (
    <div>
      <label
        htmlFor={id}
        className="block text-sm font-medium text-gray-700 mb-1"
      >
        {t("payments.form.date")}
      </label>
      <input
        id={id}
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
});
