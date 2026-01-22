/**
 * 支払い登録フォームのバリデーション
 */

import { t } from "@/lib/i18n";

export type PaymentInput = {
  amount: number;
  description: string;
  paymentDate: Date;
};

export type ValidationErrors = {
  amount?: string;
  description?: string;
  paymentDate?: string;
};

export type ValidationResult =
  | { success: true; errors?: undefined }
  | { success: false; errors: ValidationErrors };

/**
 * 金額のバリデーション
 * @returns エラーメッセージ。有効な場合は undefined
 */
function validateAmount(amount: number): string | undefined {
  if (amount < 1) {
    return t("payments.validation.amountMin");
  }
  if (amount > 1000000) {
    return t("payments.validation.amountMax");
  }
  if (!Number.isInteger(amount)) {
    return t("payments.validation.amountInteger");
  }
  return undefined;
}

/**
 * 説明のバリデーション
 * @returns エラーメッセージ。有効な場合は undefined
 */
function validateDescription(description: string): string | undefined {
  const trimmed = description.trim();
  if (trimmed.length === 0) {
    return t("payments.validation.descriptionRequired");
  }
  if (trimmed.length > 100) {
    return t("payments.validation.descriptionMax");
  }
  return undefined;
}

/**
 * 日付のバリデーション
 * @returns エラーメッセージ。有効な場合は undefined
 */
function validateDate(paymentDate: Date): string | undefined {
  const today = new Date();
  today.setHours(23, 59, 59, 999);

  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  oneYearAgo.setHours(0, 0, 0, 0);

  if (paymentDate > today) {
    return t("payments.validation.dateFuture");
  }
  if (paymentDate < oneYearAgo) {
    return t("payments.validation.dateTooOld");
  }
  return undefined;
}

/**
 * 支払い入力全体のバリデーション
 */
export function validatePayment(input: PaymentInput): ValidationResult {
  const errors: ValidationErrors = {};

  const amountError = validateAmount(input.amount);
  if (amountError) {
    errors.amount = amountError;
  }

  const descriptionError = validateDescription(input.description);
  if (descriptionError) {
    errors.description = descriptionError;
  }

  const dateError = validateDate(input.paymentDate);
  if (dateError) {
    errors.paymentDate = dateError;
  }

  if (Object.keys(errors).length > 0) {
    return { success: false, errors };
  }

  return { success: true };
}
