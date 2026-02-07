"use client";

import { memo } from "react";
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
 * - React.memo でメモ化（パフォーマンス最適化）
 * - モバイル最適化：タップ領域44px確保
 */
export const DescriptionField = memo(function DescriptionField({
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
        className="block text-sm font-medium text-theme-text mb-1"
      >
        {t("payments.form.description")}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t("payments.form.descriptionPlaceholder")}
        className={`block w-full px-3 py-3 border rounded-lg shadow-sm text-theme-headline placeholder:text-theme-muted/70 focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary transition-colors ${
          error ? "border-theme-accent" : "border-theme-card-border"
        }`}
        aria-invalid={!!error}
        aria-describedby={error ? errorId : undefined}
      />
      {error && (
        <p id={errorId} className="mt-1 text-sm text-theme-accent" role="alert">
          {error}
        </p>
      )}
    </div>
  );
});
