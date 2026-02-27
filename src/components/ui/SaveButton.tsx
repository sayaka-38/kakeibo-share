/**
 * SaveButton — 「保存」アクションの共通ボタンコンポーネント
 *
 * `common.save` / `common.saving` i18n キーを使用する。
 * 保存中は自動的にローディングスピナーと "保存中..." テキストを表示する。
 */

import { type ButtonHTMLAttributes } from "react";
import { t } from "@/lib/i18n";
import { Button } from "./Button";

interface SaveButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  /** true の間はローディング状態（スピナー + "保存中..."）を表示する */
  saving?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  disabled?: boolean;
  size?: "sm" | "md" | "lg";
}

/**
 * 保存ボタン
 *
 * @example
 * ```tsx
 * <SaveButton saving={isSubmitting} disabled={hasErrors} fullWidth />
 * ```
 */
export function SaveButton({
  saving = false,
  loading = false,
  fullWidth = false,
  disabled = false,
  size = "md",
  ...props
}: SaveButtonProps) {
  const isLoading = saving || loading;
  return (
    <Button
      type="submit"
      variant="primary"
      size={size}
      loading={isLoading}
      fullWidth={fullWidth}
      disabled={disabled}
      {...props}
    >
      {isLoading ? t("common.saving") : t("common.save")}
    </Button>
  );
}
