import { z } from "zod";

// 金額: 整数、1〜1,000,000
export const amountSchema = z.number().int().min(1).max(1_000_000);

// 説明: トリム後 1〜100 文字
export const descriptionSchema = z.string().trim().min(1).max(100);

// 日付文字列 (YYYY-MM-DD)
export const dateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

// 支払いリクエスト body スキーマ（API Route 用）
export const paymentRequestSchema = z.object({
  amount: amountSchema,
  description: descriptionSchema,
  paymentDate: dateStringSchema,
  categoryId: z.string().uuid().nullable().optional(),
  splitType: z.enum(["equal", "ratio", "proxy"]).default("equal"),
  splits: z
    .array(
      z.object({
        userId: z.string().uuid(),
        ratio: z.number().optional(),
      })
    )
    .optional(),
});

// 繰り返しルールスキーマ
export const recurringRuleRequestSchema = z.object({
  description: descriptionSchema,
  dayOfMonth: z.number().int().min(1).max(31),
  intervalMonths: z.number().int().min(1).max(12),
  isVariable: z.boolean(),
  defaultAmount: amountSchema.nullable().optional(),
  defaultPayerId: z.string().uuid(),
  splitType: z.enum(["equal", "ratio", "proxy"]).default("equal"),
});

// カテゴリスキーマ（API Route body: name/icon/color フィールド）
export const categoryRequestSchema = z.object({
  name: z.string().trim().min(1).max(50),
  icon: z.string().nullable().optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable()
    .optional(),
});

// カテゴリ作成リクエスト（groupId を含む）
export const createCategoryRequestSchema = categoryRequestSchema.extend({
  groupId: z.string().uuid(),
});

// 型エクスポート
export type PaymentRequest = z.infer<typeof paymentRequestSchema>;
export type RecurringRuleRequest = z.infer<typeof recurringRuleRequestSchema>;
export type CategoryRequest = z.infer<typeof categoryRequestSchema>;
export type CreateCategoryRequest = z.infer<typeof createCategoryRequestSchema>;
