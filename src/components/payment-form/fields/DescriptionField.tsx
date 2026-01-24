"use client";

import { t } from "@/lib/i18n";

export type DescriptionFieldProps = {
  value: string;
  onChange: (value: string) => void;
  error?: string;
  id?: string;
};

/**
 * 説明入力フィールド
 *
 * - テキスト入力
 * - エラー時は赤枠とエラーメッセージを表示
 */
export function DescriptionField({
  value,
  onChange,
  error,
  id = "payment-description",
}: DescriptionFieldProps) {
  const errorId = `${id}-error`;

  return (
    <div>
      <label
        htmlFor={id}
        className="block text-sm font-medium text-gray-700"
      >
        {t("payments.form.description")}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t("payments.form.descriptionPlaceholder")}
        className={`mt-1 block w-full px-3 py-2 border rounded-lg shadow-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
          error ? "border-red-500" : "border-gray-300"
        }`}
        aria-invalid={!!error}
        aria-describedby={error ? errorId : undefined}
      />
      {error && (
        <p id={errorId} className="mt-1 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
