"use client";

import { useRef, useState, useEffect } from "react";
import { usePaymentForm, type PaymentFormData } from "./hooks/usePaymentForm";
import { useFrequentPayments } from "./hooks/useFrequentPayments";
import type { SmartChip } from "./fields/DescriptionField";
import { AmountFieldWithKeypad, DescriptionField, DateField } from "./fields";
import { Button } from "@/components/ui/Button";
import { t } from "@/lib/i18n";
import type { Category } from "@/types/database";

export type { PaymentFormData };

type MemberInfo = {
  id: string;
  displayName: string;
};

type InlinePaymentFormProps = {
  onSubmit: (data: PaymentFormData) => Promise<void>;
  categories?: Category[];
  currentUserId?: string;
  otherMembers?: MemberInfo[];
  groupId?: string;
  /** 「保存」ボタン押下後に呼び出すコールバック（フォームを閉じる等） */
  onDone?: () => void;
};

/**
 * インライン用のシンプルな支払い登録フォーム
 *
 * /groups/[id] ページで使用
 * 金額・説明・日付のみの入力
 *
 * UX:
 * - 「保存して次へ」: amount/description のみクリアして amount にフォーカス（連続入力）
 * - 「保存」: フルリセット + onDone?() 呼び出し
 * - エラー時は ref ベースで最初のエラーフィールドにフォーカス
 */
export function InlinePaymentForm({
  onSubmit,
  categories = [],
  currentUserId,
  otherMembers = [],
  groupId,
  onDone,
}: InlinePaymentFormProps) {
  const form = usePaymentForm();
  const { filter: filterChips } = useFrequentPayments(groupId);
  const smartChips: SmartChip[] = filterChips(form.description).map((s) => ({
    description: s.description,
    categoryId: s.category_id,
  }));

  // フィールドへの ref（フォーカス制御用）
  const amountRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);

  // 成功フィードバック状態
  const [showSuccess, setShowSuccess] = useState(false);
  useEffect(() => {
    if (showSuccess) {
      const timer = setTimeout(() => setShowSuccess(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [showSuccess]);

  // エラー変化時に最初のエラーフィールドへフォーカス（useEffect で fresh な state を参照）
  useEffect(() => {
    if (form.errors.amount) amountRef.current?.focus();
    else if (form.errors.description) descriptionRef.current?.focus();
    else if (form.errors.paymentDate) dateRef.current?.focus();
  }, [form.errors]);

  /** 「保存して次へ」: amount/description のみクリアして amount にフォーカス */
  const handleSubmitAndNext = async (e: React.FormEvent) => {
    e.preventDefault();
    const isValid = form.validate({ currentUserId });
    if (!isValid) return;

    try {
      await form.handleSubmitAndNext(onSubmit);
      setShowSuccess(true);
      amountRef.current?.focus();
    } catch {
      // エラーハンドリングは親コンポーネントに委譲
    }
  };

  /** 「保存」: フルリセット後に onDone?() を呼び出す */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const isValid = form.validate({ currentUserId });
    if (!isValid) return;

    try {
      await form.handleSubmit(onSubmit);
      setShowSuccess(true);
      onDone?.();
    } catch {
      // エラーハンドリングは親コンポーネントに委譲
    }
  };

  return (
    <form onSubmit={handleSubmitAndNext} className="space-y-5">
      {/* 成功フィードバック */}
      {showSuccess && (
        <div
          className="bg-green-500/10 border border-green-500/30 text-green-700 px-4 py-3 rounded-lg text-sm flex items-center gap-2 animate-fade-in"
          role="status"
          aria-live="polite"
        >
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          {t("payments.form.submitSuccess")}
        </div>
      )}

      <AmountFieldWithKeypad
        value={form.amount}
        onChange={form.setAmount}
        error={form.errors.amount}
        inputRef={amountRef}
      />

      <DescriptionField
        value={form.description}
        onChange={form.setDescription}
        error={form.errors.description}
        inputRef={descriptionRef}
        chips={smartChips}
        onSelectChip={(chip) => {
          form.setDescription(chip.description);
          if (chip.categoryId) form.setCategoryId(chip.categoryId);
        }}
      />

      <DateField
        value={form.paymentDate}
        onChange={form.setPaymentDate}
        error={form.errors.paymentDate}
        inputRef={dateRef}
      />

      {/* カテゴリ選択 */}
      {categories.length > 0 && (
        <div>
          <label
            htmlFor="payment-category"
            className="block text-sm font-medium text-theme-text mb-1"
          >
            {t("payments.form.category")}
          </label>
          <select
            id="payment-category"
            value={form.categoryId}
            onChange={(e) => form.setCategoryId(e.target.value)}
            className="block w-full px-3 py-3 border border-theme-card-border rounded-lg shadow-sm text-theme-headline focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary transition-colors"
          >
            <option value="">{t("payments.form.selectCategory")}</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.icon} {category.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* 代理購入トグル（メンバー情報がある場合のみ表示） */}
      {otherMembers.length > 0 && (
        <div className="space-y-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.splitType === "proxy"}
              onChange={(e) => {
                if (e.target.checked) {
                  form.setSplitType("proxy");
                  if (otherMembers.length === 1) {
                    form.setProxyBeneficiaryId(otherMembers[0].id);
                  }
                } else {
                  form.setSplitType("equal");
                  form.setProxyBeneficiaryId("");
                }
              }}
              className="rounded border-theme-card-border text-theme-secondary focus:ring-theme-primary"
            />
            <span className="text-sm font-medium text-theme-text">
              {t("payments.form.splitProxy")}
            </span>
          </label>

          {form.splitType === "proxy" && (
            otherMembers.length === 1 ? (
              <p className="text-sm text-theme-secondary bg-theme-secondary/10 rounded-lg px-3 py-2">
                {t("payments.form.proxyAutoConfirm", { name: otherMembers[0].displayName })}
              </p>
            ) : (
              <div>
                <label
                  htmlFor="proxy-beneficiary"
                  className="block text-sm font-medium text-theme-text mb-1"
                >
                  {t("payments.form.proxyBeneficiary")}
                </label>
                <select
                  id="proxy-beneficiary"
                  value={form.proxyBeneficiaryId}
                  onChange={(e) => form.setProxyBeneficiaryId(e.target.value)}
                  className={`block w-full px-3 py-3 border rounded-lg shadow-sm text-theme-headline focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary transition-colors ${
                    form.errors.proxyBeneficiaryId
                      ? "border-theme-accent"
                      : "border-theme-card-border"
                  }`}
                  aria-invalid={!!form.errors.proxyBeneficiaryId}
                  aria-describedby={
                    form.errors.proxyBeneficiaryId
                      ? "proxy-beneficiary-error"
                      : undefined
                  }
                >
                  <option value="">
                    {t("payments.form.selectBeneficiary")}
                  </option>
                  {otherMembers.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.displayName}
                    </option>
                  ))}
                </select>
                {form.errors.proxyBeneficiaryId && (
                  <p
                    id="proxy-beneficiary-error"
                    className="mt-1 text-sm text-theme-accent"
                    role="alert"
                  >
                    {form.errors.proxyBeneficiaryId}
                  </p>
                )}
              </div>
            )
          )}
        </div>
      )}

      {/* 2ボタン: 「保存して次へ」(Primary) + 「保存」(Secondary) */}
      <div className="flex flex-col gap-3 sm:flex-row-reverse">
        <Button
          type="submit"
          variant="primary"
          size="md"
          fullWidth
          loading={form.isSubmitting}
        >
          {form.isSubmitting
            ? t("payments.form.submitting")
            : t("payments.form.submitAndNext")}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="md"
          fullWidth
          loading={form.isSubmitting}
          onClick={handleSubmit}
        >
          {t("payments.form.submit")}
        </Button>
      </div>
    </form>
  );
}
