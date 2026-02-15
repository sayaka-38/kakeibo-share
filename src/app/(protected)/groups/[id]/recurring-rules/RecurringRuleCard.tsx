"use client";

import { useState } from "react";
import { t } from "@/lib/i18n";
import { formatCurrency } from "@/lib/format/currency";
import { Button } from "@/components/ui/Button";
import type { RuleWithRelations } from "./RecurringRuleList";

type RecurringRuleCardProps = {
  rule: RuleWithRelations;
  onEdit: () => void;
  onDelete: () => void;
  isOwner: boolean;
};

export default function RecurringRuleCard({
  rule,
  onEdit,
  onDelete,
  isOwner,
}: RecurringRuleCardProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    setIsDeleting(true);
    setError(null);

    try {
      const res = await fetch(`/api/recurring-rules/${rule.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || t("recurringRules.errors.deleteFailed"));
        return;
      }

      onDelete();
    } catch {
      setError(t("recurringRules.errors.deleteFailed"));
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  // 発生日の表示
  const dayDisplay =
    rule.day_of_month === 31
      ? t("recurringRules.dayOfMonthHint", { day: "末" })
      : t("recurringRules.dayOfMonthHint", { day: String(rule.day_of_month) });

  // 発生間隔の表示
  const intervalDisplay =
    rule.interval_months > 1
      ? t("recurringRules.intervalEveryNMonths", { n: String(rule.interval_months) })
      : null;

  // 金額の表示
  const amountDisplay = rule.is_variable
    ? t("recurringRules.variableAmount")
    : formatCurrency(rule.default_amount || 0);

  // カテゴリアイコン
  const categoryIcon = rule.category?.icon || "📋";

  // 削除確認モード
  if (showDeleteConfirm) {
    return (
      <div className={`flex items-center justify-between px-4 py-3 ${!rule.is_active ? "opacity-60" : ""}`}>
        <span className="text-sm text-theme-muted">
          {t("recurringRules.deleteConfirm")}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="danger"
            size="sm"
            onClick={handleDelete}
            loading={isDeleting}
          >
            {t("common.delete")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowDeleteConfirm(false)}
            disabled={isDeleting}
          >
            {t("common.cancel")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={!rule.is_active ? "opacity-60" : ""}>
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Category icon */}
        <span className="w-9 h-9 rounded-full bg-theme-primary/15 flex items-center justify-center text-base shrink-0">
          {categoryIcon}
        </span>

        {/* Title + subtitle — clickable to edit */}
        <button
          type="button"
          onClick={onEdit}
          className="flex-1 min-w-0 text-left hover:opacity-80 transition-opacity"
        >
          <div className="flex items-center gap-2">
            <span className="font-medium text-theme-headline text-sm truncate">
              {rule.description}
            </span>
            {!rule.is_active && (
              <span className="text-[10px] bg-theme-card-border text-theme-muted px-1.5 py-0.5 rounded shrink-0">
                {t("recurringRules.inactive")}
              </span>
            )}
          </div>
          <span className="text-xs text-theme-muted">
            {dayDisplay}
            {intervalDisplay && (
              <> · <span className="text-theme-primary-text">{intervalDisplay}</span></>
            )}
          </span>
        </button>

        {/* Amount */}
        <span
          className={`font-semibold text-sm shrink-0 ${
            rule.is_variable ? "text-theme-primary-text" : "text-theme-headline"
          }`}
        >
          {amountDisplay}
        </span>

        {/* Delete icon (owner only) */}
        {isOwner && (
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            className="p-1 text-theme-muted/50 hover:text-theme-accent transition-colors shrink-0"
            aria-label={t("common.delete")}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        )}

        {/* Chevron */}
        <button
          type="button"
          onClick={onEdit}
          className="p-1 text-theme-muted shrink-0"
          aria-label={t("common.edit")}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 pb-2 text-sm text-theme-accent">{error}</div>
      )}
    </div>
  );
}
