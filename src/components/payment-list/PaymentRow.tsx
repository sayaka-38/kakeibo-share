"use client";

/**
 * PaymentRow - Shared payment item component
 *
 * Used by both RecentPaymentList (dashboard) and PaymentListWithFilter (/payments).
 * Keeps layout, badges, and action slots in a single source of truth.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { t } from "@/lib/i18n";
import { formatCurrency } from "@/lib/format/currency";
import { isCustomSplit, isProxySplit } from "@/lib/calculation/split";
import { ActionSheet, type ActionSheetItem } from "@/components/ui/ActionSheet";
import {
  SplitAccordionProvider,
  SplitBadge,
  SplitContent,
  type SplitWithProfile,
} from "./PaymentSplitAccordion";
import { getCategoryStyle, getContrastTextColor } from "@/lib/format/color";
import type { PaymentRowData } from "@/types/query-results";

/** 全額立替バッジ — Ocean Blue で統一感を持たせる */
const PROXY_BADGE_BG = "#1A5276";
const PROXY_BADGE_COLOR = getContrastTextColor(PROXY_BADGE_BG);

/** 清算済バッジ — Teal で「完了」を視覚表現 */
const SETTLEMENT_BADGE_BG = "#0E7C7B";
const SETTLEMENT_BADGE_COLOR = getContrastTextColor(SETTLEMENT_BADGE_BG);

type PaymentRowProps = {
  payment: PaymentRowData;
  userId?: string;
  showCategoryBadge?: boolean;
};

export function PaymentRow({
  payment,
  userId,
  showCategoryBadge,
}: PaymentRowProps) {
  const router = useRouter();
  const [showActionSheet, setShowActionSheet] = useState(false);

  const groupName = payment.groups?.name;
  const isProxy = isProxySplit(payment.payment_splits, payment.payer_id);
  const custom = isCustomSplit(
    payment.payment_splits,
    payment.payer_id,
    Number(payment.amount)
  );
  const splitsWithProfile: SplitWithProfile[] = payment.payment_splits.map(
    (s) => ({
      user_id: s.user_id,
      amount: s.amount,
      display_name: s.profiles?.display_name ?? null,
      email: s.profiles?.email ?? "",
    })
  );

  const categoryIcon = payment.categories?.icon || "❓";
  const categoryColor = payment.categories?.color || null;
  const categoryBadgeStyle = getCategoryStyle(categoryColor);
  const isOwner = userId ? payment.payer_id === userId : false;
  const isSettled = !!payment.settlement_id;

  const handleDelete = async () => {
    if (!window.confirm(t("payments.deleteConfirm"))) return;
    const res = await fetch(`/api/payments/${payment.id}`, { method: "DELETE" });
    if (res.ok) {
      router.refresh();
    }
  };

  const actionItems: ActionSheetItem[] = [
    ...(isOwner && !isSettled
      ? [
          {
            label: t("payments.edit"),
            onClick: () => router.push(`/payments/${payment.id}/edit`),
          },
        ]
      : []),
    {
      label: t("payments.duplicate"),
      onClick: () => router.push(`/payments/new?copyFrom=${payment.id}`),
    },
    ...(isOwner && !isSettled
      ? [
          {
            label: t("payments.delete"),
            onClick: handleDelete,
            danger: true,
          },
        ]
      : []),
  ];

  const rowContent = (
    <>
      <div className="grid grid-cols-[1fr_auto] gap-3 items-start">
        {/* Left: Icon + Title/subtitle (truncatable) */}
        <div className="flex items-start gap-3 min-w-0">
          <span
            className={`w-9 h-9 rounded-full flex items-center justify-center text-base shrink-0${!categoryColor ? " bg-theme-primary/15" : ""}`}
            style={categoryColor ? { backgroundColor: categoryColor + "26" } : undefined}
          >
            {categoryIcon}
          </span>
          <div className="min-w-0">
            <span className="font-medium text-theme-headline text-sm truncate block">
              {payment.description}
            </span>
            <div className="flex items-center gap-1 mt-0.5 text-xs text-theme-muted overflow-hidden">
              <span className="min-w-0 truncate">
                {payment.profiles?.display_name || payment.profiles?.email}
              </span>
              {groupName && (
                <>
                  <span className="shrink-0">/</span>
                  <span className="max-w-[5rem] min-w-0 truncate">
                    {groupName}
                  </span>
                </>
              )}
              {showCategoryBadge && payment.categories && (
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded shrink-0${!categoryBadgeStyle ? " bg-theme-bg text-theme-muted" : ""}`}
                  style={categoryBadgeStyle || undefined}
                >
                  {payment.categories.name}
                </span>
              )}
              {isProxy && (
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0"
                  style={{ backgroundColor: PROXY_BADGE_BG, color: PROXY_BADGE_COLOR }}
                >
                  {t("payments.display.proxyBadge")}
                </span>
              )}
              {custom && <SplitBadge />}
            </div>
          </div>
        </div>

        {/* Right: Amount + Three-dot menu */}
        <div className="flex flex-col items-end gap-1">
          <span className="font-semibold text-sm text-theme-headline whitespace-nowrap">
            {formatCurrency(Number(payment.amount))}
          </span>
          <div className="flex items-center gap-1.5">
            {isSettled && (
              <span
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium"
                style={{ backgroundColor: SETTLEMENT_BADGE_BG, color: SETTLEMENT_BADGE_COLOR }}
              >
                <svg
                  className="w-2.5 h-2.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.5}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                清算済
              </span>
            )}
            {/* 三点リーダーメニューボタン */}
            <button
              type="button"
              onClick={() => setShowActionSheet(true)}
              className="p-2 text-theme-muted/50 hover:text-theme-primary-text transition-colors"
              aria-label="メニューを開く"
            >
              <svg
                className="w-4 h-4"
                fill="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <circle cx="5" cy="12" r="2" />
                <circle cx="12" cy="12" r="2" />
                <circle cx="19" cy="12" r="2" />
              </svg>
            </button>
          </div>
        </div>
      </div>
      {custom && <SplitContent splits={splitsWithProfile} />}

      {/* ActionSheet */}
      <ActionSheet
        isOpen={showActionSheet}
        onClose={() => setShowActionSheet(false)}
        items={actionItems}
      />
    </>
  );

  return (
    <div className="px-4 py-3 hover:bg-theme-primary/5 transition-colors">
      {custom ? (
        <SplitAccordionProvider>{rowContent}</SplitAccordionProvider>
      ) : (
        rowContent
      )}
    </div>
  );
}
