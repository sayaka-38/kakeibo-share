/**
 * カテゴリのバリデーション（API + フロントエンド共通）
 */

import { t } from "@/lib/i18n";

export type CategoryInput = {
  name: string;
  icon?: string | null;
  color?: string | null;
};

export type CategoryValidationErrors = {
  name?: string;
  icon?: string;
  color?: string;
};

export type CategoryValidationResult =
  | { success: true; errors?: undefined }
  | { success: false; errors: CategoryValidationErrors };

const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;
const EMOJI_REGEX = /^[\p{Emoji_Presentation}\p{Extended_Pictographic}]$/u;

export function validateCategoryName(name: string): string | undefined {
  const trimmed = name.trim();
  if (trimmed.length < 1) {
    return t("categories.validation.nameRequired");
  }
  if (trimmed.length > 50) {
    return t("categories.validation.nameMax");
  }
  return undefined;
}

export function validateCategoryIcon(icon: string | null | undefined): string | undefined {
  if (!icon) return undefined;
  if (!EMOJI_REGEX.test(icon)) {
    return t("categories.validation.iconInvalid");
  }
  return undefined;
}

export function validateCategoryColor(color: string | null | undefined): string | undefined {
  if (!color) return undefined;
  if (!HEX_COLOR_REGEX.test(color)) {
    return t("categories.validation.colorInvalid");
  }
  return undefined;
}

export function validateCategory(input: CategoryInput): CategoryValidationResult {
  const errors: CategoryValidationErrors = {};

  const nameErr = validateCategoryName(input.name);
  if (nameErr) errors.name = nameErr;

  const iconErr = validateCategoryIcon(input.icon);
  if (iconErr) errors.icon = iconErr;

  const colorErr = validateCategoryColor(input.color);
  if (colorErr) errors.color = colorErr;

  if (Object.keys(errors).length > 0) {
    return { success: false, errors };
  }
  return { success: true };
}
