/**
 * CancelButton — 「キャンセル」アクションの共通ボタンコンポーネント
 *
 * `common.cancel` i18n キーを使用する。
 */

import { type ButtonHTMLAttributes } from "react";
import { t } from "@/lib/i18n";
import { Button } from "./Button";

interface CancelButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  fullWidth?: boolean;
  disabled?: boolean;
  size?: "sm" | "md" | "lg";
}

/**
 * キャンセルボタン
 *
 * @example
 * ```tsx
 * <CancelButton onClick={onClose} disabled={isSubmitting} fullWidth />
 * ```
 */
export function CancelButton({
  fullWidth = false,
  disabled = false,
  size = "md",
  ...props
}: CancelButtonProps) {
  return (
    <Button
      type="button"
      variant="secondary"
      size={size}
      fullWidth={fullWidth}
      disabled={disabled}
      {...props}
    >
      {t("common.cancel")}
    </Button>
  );
}
