/**
 * NumericKeypad コンポーネント
 *
 * Phase 2-2: UI/UX最適化 - 数値キーパッド
 *
 * 金額入力に特化したカスタム数値キーパッド。
 * 44px タッチターゲットを全キーで確保。
 */
"use client";

import { type HTMLAttributes, useCallback } from "react";
import { t } from "@/lib/i18n";

interface NumericKeypadProps extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  value: string;
  onChange: (value: string) => void;
  onConfirm?: (value: string) => void;
  maxLength?: number;
  disabled?: boolean;
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

export function NumericKeypad({
  value,
  onChange,
  onConfirm,
  maxLength = 7,
  disabled = false,
  className = "",
  ...props
}: NumericKeypadProps) {
  const handleDigitPress = useCallback(
    (digit: string) => {
      if (disabled) return;

      // 最大桁数チェック
      if (value.length >= maxLength) return;

      // 先頭の0の処理
      if (value === "0" && digit !== "0") {
        onChange(digit);
        return;
      }

      // 0の連続入力を防止
      if (value === "0" && digit === "0") {
        onChange("0");
        return;
      }

      onChange(value + digit);
    },
    [value, onChange, maxLength, disabled]
  );

  const handleDelete = useCallback(() => {
    if (disabled) return;

    if (value.length === 0) {
      onChange("");
      return;
    }

    onChange(value.slice(0, -1));
  }, [value, onChange, disabled]);

  const handleConfirm = useCallback(() => {
    if (disabled) return;
    onConfirm?.(value);
  }, [value, onConfirm, disabled]);

  const keyButtonClasses =
    "flex items-center justify-center min-h-11 text-xl font-medium bg-gray-100 rounded-lg transition-colors hover:bg-gray-200 active:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed";

  return (
    <div
      data-testid="numeric-keypad"
      role="group"
      className={`grid grid-cols-3 gap-2 ${className}`.trim()}
      {...props}
    >
      {/* 1-9 キー */}
      {KEYS.map((digit) => (
        <button
          key={digit}
          type="button"
          className={keyButtonClasses}
          onClick={() => handleDigitPress(digit)}
          disabled={disabled}
          aria-label={digit}
        >
          {digit}
        </button>
      ))}

      {/* 削除キー */}
      <button
        type="button"
        className={keyButtonClasses}
        onClick={handleDelete}
        disabled={disabled}
        aria-label={t("common.delete")}
      >
        <svg
          className="w-6 h-6"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l6.414 6.414a2 2 0 001.414.586H19a2 2 0 002-2V7a2 2 0 00-2-2h-8.172a2 2 0 00-1.414.586L3 12z"
          />
        </svg>
      </button>

      {/* 0 キー */}
      <button
        type="button"
        className={keyButtonClasses}
        onClick={() => handleDigitPress("0")}
        disabled={disabled}
        aria-label="0"
      >
        0
      </button>

      {/* 確定キー */}
      <button
        type="button"
        className={`${keyButtonClasses} bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800`}
        onClick={handleConfirm}
        disabled={disabled}
        aria-label={t("common.confirm")}
      >
        <svg
          className="w-6 h-6"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 13l4 4L19 7"
          />
        </svg>
      </button>
    </div>
  );
}
