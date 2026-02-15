/**
 * PaymentRow - Shared payment item component
 *
 * Used by both RecentPaymentList (dashboard) and PaymentListWithFilter (/payments).
 * Keeps layout, badges, and action slots in a single source of truth.
 */
import Link from "next/link";
import { t } from "@/lib/i18n";
import { formatCurrency } from "@/lib/format/currency";
import { isCustomSplit, isProxySplit } from "@/lib/calculation/split";
import { DeletePaymentForm } from "@/components/DeletePaymentButton";
import {
  SplitAccordionProvider,
  SplitBadge,
  SplitContent,
  type SplitWithProfile,
} from "./PaymentSplitAccordion";
import type { PaymentRowData } from "./types";

type PaymentRowProps = {
  payment: PaymentRowData;
  userId?: string;
  groupName?: string;
  showCategoryBadge?: boolean;
};

export function PaymentRow({
  payment,
  userId,
  groupName,
  showCategoryBadge,
}: PaymentRowProps) {
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
  const isOwner = userId ? payment.payer_id === userId : false;
  const isSettled = !!payment.settlement_id;

  const rowContent = (
    <>
      <div className="grid grid-cols-[1fr_auto] gap-3 items-start">
        {/* Left: Icon + Title/subtitle (truncatable) */}
        <div className="flex items-start gap-3 min-w-0">
          <span className="w-9 h-9 rounded-full bg-theme-primary/15 flex items-center justify-center text-base shrink-0">
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
                <span className="text-[10px] bg-theme-bg text-theme-muted px-1.5 py-0.5 rounded shrink-0">
                  {payment.categories.name}
                </span>
              )}
              {isProxy && (
                <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-theme-secondary/15 text-theme-secondary shrink-0">
                  {t("payments.display.proxyBadge")}
                </span>
              )}
              {custom && <SplitBadge />}
            </div>
          </div>
        </div>

        {/* Right: Amount + Actions (pixel-stable slot) */}
        <div className="flex flex-col items-end gap-1">
          <span className="font-semibold text-sm text-theme-headline whitespace-nowrap">
            {formatCurrency(Number(payment.amount))}
          </span>
          <div className="flex items-center gap-1.5">
            <div className="w-16 flex items-center justify-end gap-1">
              {isSettled && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-theme-text/15 text-theme-text">
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
              {isOwner && !isSettled && (
                <Link
                  href={`/payments/${payment.id}/edit`}
                  className="p-1 text-theme-muted/50 hover:text-theme-primary-text transition-colors"
                  aria-label={t("payments.edit")}
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                    />
                  </svg>
                </Link>
              )}
              {isOwner && !isSettled && (
                <DeletePaymentForm paymentId={payment.id} />
              )}
            </div>
            <Link
              href={`/payments/new?copyFrom=${payment.id}`}
              className="p-1 text-theme-muted/50 hover:text-theme-primary-text transition-colors"
              aria-label={t("payments.duplicate")}
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
            </Link>
          </div>
        </div>
      </div>
      {custom && <SplitContent splits={splitsWithProfile} />}
    </>
  );

  return (
    <div className="px-4 py-3">
      {custom ? (
        <SplitAccordionProvider>{rowContent}</SplitAccordionProvider>
      ) : (
        rowContent
      )}
    </div>
  );
}
