"use client";

import { memo, useCallback } from "react";
import { t } from "@/lib/i18n";

export type SmartChip = {
  description: string;
  categoryId: string | null;
};

export type DescriptionFieldProps = {
  value: string;
  onChange: (value: string) => void;
  error?: string;
  id?: string;
  chips?: SmartChip[];
  onSelectChip?: (chip: SmartChip) => void;
};

/**
 * 説明入力フィールド（スマートチップ対応）
 *
 * - チップはデータがある場合に常時表示（フォーカス不要）
 * - 入力中はインクリメンタルサーチでフィルタリング
 * - チップタップでdescription＋categoryIdを同時設定
 * - チップ領域は常に1行分の高さを確保（レイアウトシフト防止）
 * - React.memo でメモ化（パフォーマンス最適化）
 * - モバイル最適化：タップ領域44px確保
 */
export const DescriptionField = memo(function DescriptionField({
  value,
  onChange,
  error,
  id = "payment-description",
  chips = [],
  onSelectChip,
}: DescriptionFieldProps) {
  const errorId = `${id}-error`;

  const visibleChips = chips.length > 0
    ? chips.filter(
        (c) =>
          !value ||
          c.description.toLowerCase().includes(value.toLowerCase())
      )
    : [];

  const handleSelectChip = useCallback(
    (chip: SmartChip) => {
      onChange(chip.description);
      onSelectChip?.(chip);
    },
    [onChange, onSelectChip]
  );

  return (
    <div>
      <label
        htmlFor={id}
        className="block text-sm font-medium text-theme-text mb-1"
      >
        {t("payments.form.description")}
      </label>

      {/* スマートチップ領域 — 常に h-8 を確保してレイアウトシフトを防ぐ */}
      <div
        className="h-8 flex items-center gap-1.5 overflow-x-auto scrollbar-none mb-1"
        aria-label={visibleChips.length > 0 ? t("payments.form.smartChipsLabel") : undefined}
        aria-hidden={visibleChips.length === 0 ? true : undefined}
      >
        {visibleChips.map((chip) => (
          <button
            key={chip.description}
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              handleSelectChip(chip);
            }}
            className="flex-shrink-0 px-2.5 py-0.5 text-xs rounded-full border border-theme-primary/40 bg-theme-primary/10 text-theme-primary hover:bg-theme-primary/20 transition-colors whitespace-nowrap"
          >
            {chip.description}
          </button>
        ))}
      </div>

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
