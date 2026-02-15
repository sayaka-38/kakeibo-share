/**
 * 固定費ルールのバリデーション（API + フロントエンド共通）
 */

import { t } from "@/lib/i18n";

export type RecurringRuleInput = {
  description: string;
  dayOfMonth: number;
  defaultPayerId: string;
  isVariable: boolean;
  defaultAmount: number | null | undefined;
  intervalMonths: number;
  splitType: string;
  percentageTotal?: number;
};

export type RuleValidationErrors = {
  description?: string;
  dayOfMonth?: string;
  defaultPayerId?: string;
  amount?: string;
  intervalMonths?: string;
  percentages?: string;
  isVariable?: string;
};

export type RuleValidationResult =
  | { success: true; errors?: undefined }
  | { success: false; errors: RuleValidationErrors };

export function validateDescription(description: string): string | undefined {
  const trimmed = description.trim();
  if (trimmed.length < 1) {
    return t("recurringRules.validation.descriptionRequired");
  }
  if (trimmed.length > 100) {
    return t("recurringRules.validation.descriptionMax");
  }
  return undefined;
}

export function validateDayOfMonth(day: number): string | undefined {
  if (!Number.isFinite(day) || day < 1 || day > 31) {
    return t("recurringRules.validation.dayRange");
  }
  return undefined;
}

export function validateIntervalMonths(interval: number): string | undefined {
  if (!Number.isInteger(interval) || interval < 1 || interval > 12) {
    return t("recurringRules.validation.intervalRange");
  }
  return undefined;
}

export function validateAmount(
  isVariable: boolean,
  amount: number | null | undefined
): string | undefined {
  if (isVariable) {
    if (amount !== null && amount !== undefined) {
      return t("recurringRules.validation.variableNoAmount");
    }
    return undefined;
  }
  if (amount === null || amount === undefined || amount <= 0) {
    return t("recurringRules.validation.amountRequired");
  }
  return undefined;
}

export function validateRecurringRule(
  input: RecurringRuleInput
): RuleValidationResult {
  const errors: RuleValidationErrors = {};

  const descErr = validateDescription(input.description);
  if (descErr) errors.description = descErr;

  const dayErr = validateDayOfMonth(input.dayOfMonth);
  if (dayErr) errors.dayOfMonth = dayErr;

  if (!input.defaultPayerId) {
    errors.defaultPayerId = t("recurringRules.validation.payerRequired");
  }

  const amountErr = validateAmount(input.isVariable, input.defaultAmount);
  if (amountErr) errors.amount = amountErr;

  const intervalErr = validateIntervalMonths(input.intervalMonths);
  if (intervalErr) errors.intervalMonths = intervalErr;

  if (
    input.splitType === "custom" &&
    input.percentageTotal !== undefined &&
    Math.abs(input.percentageTotal - 100) > 0.1
  ) {
    errors.percentages = t("recurringRules.percentageMismatch");
  }

  if (Object.keys(errors).length > 0) {
    return { success: false, errors };
  }
  return { success: true };
}
