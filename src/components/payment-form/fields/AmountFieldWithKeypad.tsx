/**
 * AmountFieldWithKeypad コンポーネント
 *
 * Phase 2-2: UI/UX最適化 - NumericKeypad 統合
 *
 * 金額入力フィールドにカスタム数値キーパッドを統合。
 * モバイルでの金額入力体験を向上。
 */
"use client";

import { memo, useState, useRef, useEffect, useCallback } from "react";
import { NumericKeypad } from "@/components/ui/NumericKeypad";
import { t } from "@/lib/i18n";

export type AmountFieldWithKeypadProps = {
  value: string;
  onChange: (value: string) => void;
  error?: string;
  id?: string;
};

export const AmountFieldWithKeypad = memo(function AmountFieldWithKeypad({
  value,
  onChange,
  error,
  id = "payment-amount",
}: AmountFieldWithKeypadProps) {
  const [showKeypad, setShowKeypad] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const errorId = `${id}-error`;

  // キーパッド外クリックで閉じる
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setShowKeypad(false);
      }
    };

    if (showKeypad) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showKeypad]);

  const handleFocus = useCallback(() => {
    setShowKeypad(true);
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      // 数字のみ許可
      const newValue = e.target.value.replace(/[^0-9]/g, "");
      onChange(newValue);
    },
    [onChange]
  );

  const handleKeypadChange = useCallback(
    (newValue: string) => {
      onChange(newValue);
    },
    [onChange]
  );

  const handleConfirm = useCallback(() => {
    setShowKeypad(false);
    // 次のフィールドへフォーカスを移す（親コンポーネントで制御可能）
  }, []);

  return (
    <div ref={containerRef}>
      <label
        htmlFor={id}
        className="block text-sm font-medium text-theme-text mb-1"
      >
        {t("payments.form.amount")}
      </label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-text pointer-events-none">
          {t("common.currency")}
        </span>
        <input
          ref={inputRef}
          id={id}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={value}
          onChange={handleInputChange}
          onFocus={handleFocus}
          placeholder={t("payments.form.amountPlaceholder")}
          className={`block w-full pl-8 pr-3 py-3 border rounded-lg shadow-sm text-theme-headline placeholder:text-theme-muted/70 focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary transition-colors ${
            error ? "border-theme-accent" : "border-theme-card-border"
          }`}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : undefined}
        />
      </div>
      {error && (
        <p id={errorId} className="mt-1 text-sm text-theme-accent" role="alert">
          {error}
        </p>
      )}

      {/* NumericKeypad */}
      {showKeypad && (
        <div className="mt-3">
          <NumericKeypad
            value={value}
            onChange={handleKeypadChange}
            onConfirm={handleConfirm}
            maxLength={7}
            aria-label={t("payments.form.amount")}
          />
        </div>
      )}
    </div>
  );
});
