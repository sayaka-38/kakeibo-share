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
      ? `${t("recurringRules.dayOfMonthHint", { day: "末" })}`
      : t("recurringRules.dayOfMonthHint", { day: String(rule.day_of_month) });

  // 金額の表示
  const amountDisplay = rule.is_variable
    ? t("recurringRules.variableAmount")
    : formatCurrency(rule.default_amount || 0);

  // 分割タイプの表示
  const splitDisplay =
    rule.split_type === "custom"
      ? t("recurringRules.splitCustom")
      : t("recurringRules.splitEqual");

  // カスタム分割の詳細
  const splitDetails =
    rule.split_type === "custom" && rule.splits.length > 0
      ? rule.splits
          .map((s) => {
            const name = s.user?.display_name || s.user?.email || "Unknown";
            const value = s.percentage !== null ? `${s.percentage}%` : formatCurrency(s.amount || 0);
            return `${name}: ${value}`;
          })
          .join(", ")
      : null;

  return (
    <div
      className={`bg-white rounded-lg shadow border p-4 ${
        !rule.is_active ? "opacity-60" : ""
      }`}
    >
      {/* Header Row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-gray-900 truncate">
              {rule.description}
            </h3>
            {!rule.is_active && (
              <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded">
                {t("recurringRules.inactive")}
              </span>
            )}
          </div>
          {rule.category && (
            <span className="text-xs text-gray-500">{rule.category.name}</span>
          )}
        </div>
        <div className="text-right shrink-0">
          <div
            className={`font-semibold ${
              rule.is_variable ? "text-amber-600" : "text-gray-900"
            }`}
          >
            {amountDisplay}
          </div>
          <div className="text-xs text-gray-500">{dayDisplay}</div>
        </div>
      </div>

      {/* Details Row */}
      <div className="mt-3 flex items-center gap-4 text-sm text-gray-600">
        <div className="flex items-center gap-1">
          <span className="text-gray-400">支払:</span>
          <span>
            {rule.default_payer?.display_name || rule.default_payer?.email}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-gray-400">分割:</span>
          <span>{splitDisplay}</span>
        </div>
      </div>

      {/* Custom Split Details */}
      {splitDetails && (
        <div className="mt-2 text-xs text-gray-500 bg-gray-50 rounded px-2 py-1">
          {splitDetails}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mt-2 text-sm text-red-600">{error}</div>
      )}

      {/* Actions */}
      <div className="mt-3 flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onEdit}>
          {t("common.edit")}
        </Button>
        {isOwner && (
          <>
            {showDeleteConfirm ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">
                  {t("recurringRules.deleteConfirm")}
                </span>
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
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowDeleteConfirm(true)}
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                {t("common.delete")}
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
