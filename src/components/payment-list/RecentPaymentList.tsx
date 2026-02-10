/**
 * RecentPaymentList - 最近の支払い一覧
 *
 * Phase 2-2: Suspense 対応のサーバーコンポーネント
 *
 * グループの最近の支払いを非同期で取得して表示。
 * Suspense と組み合わせてスケルトンローディングを実現。
 */
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
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

type PaymentSplitRow = {
  user_id: string;
  amount: number;
  profiles: { display_name: string | null; email: string | null } | null;
};

type RecentPaymentRow = {
  id: string;
  amount: number;
  description: string;
  payment_date: string;
  payer_id: string;
  settlement_id: string | null;
  category_id: string | null;
  profiles: { display_name: string | null; email: string | null } | null;
  categories: { name: string; icon: string | null } | null;
  payment_splits: PaymentSplitRow[];
};

interface RecentPaymentListProps {
  groupId: string;
  limit?: number;
  currentUserId?: string;
}

export async function RecentPaymentList({
  groupId,
  limit = 5,
  currentUserId,
}: RecentPaymentListProps) {
  const supabase = await createClient();

  const { data: payments } = (await supabase
    .from("payments")
    .select(
      `
      id,
      amount,
      description,
      payment_date,
      payer_id,
      settlement_id,
      category_id,
      profiles (
        display_name,
        email
      ),
      categories (
        name,
        icon
      ),
      payment_splits (
        user_id,
        amount,
        profiles (
          display_name,
          email
        )
      )
    `
    )
    .eq("group_id", groupId)
    .order("payment_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit)) as { data: RecentPaymentRow[] | null };

  if (!payments || payments.length === 0) {
    return (
      <p className="px-4 py-6 text-center text-theme-text">
        {t("payments.noPayments")}
      </p>
    );
  }

  return (
    <div className="divide-y divide-theme-card-border">
      {payments.map((payment) => {
        const isProxy = isProxySplit(payment.payment_splits, payment.payer_id);
        const custom = isCustomSplit(
          payment.payment_splits,
          payment.payer_id,
          Number(payment.amount)
        );
        const splitsWithProfile: SplitWithProfile[] =
          payment.payment_splits.map((s) => ({
            user_id: s.user_id,
            amount: s.amount,
            display_name: s.profiles?.display_name ?? null,
            email: s.profiles?.email ?? "",
          }));

        const categoryIcon = payment.categories?.icon || "💰";
        const isOwner = currentUserId && payment.payer_id === currentUserId;
        const isSettled = !!payment.settlement_id;

        const rowContent = (
          <>
            <div className="flex items-center gap-3">
              {/* Category icon */}
              <span className="w-9 h-9 rounded-full bg-theme-primary/15 flex items-center justify-center text-base shrink-0">
                {categoryIcon}
              </span>

              {/* Title + subtitle */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-medium text-theme-headline text-sm truncate">
                    {payment.description}
                  </span>
                  {isSettled && (
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-theme-text/15 text-theme-text">
                      <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                      清算済
                    </span>
                  )}
                  {isProxy && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-theme-secondary/15 text-theme-secondary">
                      {t("payments.display.proxyBadge")}
                    </span>
                  )}
                  {custom && <SplitBadge />}
                </div>
                <div className="text-xs text-theme-muted">
                  {payment.profiles?.display_name || payment.profiles?.email}
                  {" · "}
                  {payment.payment_date}
                </div>
              </div>

              {/* Amount + actions */}
              <span className="font-semibold text-sm text-theme-headline shrink-0">
                {formatCurrency(Number(payment.amount))}
              </span>

              <div className="flex items-center gap-1.5 shrink-0">
                <Link
                  href={`/payments/new?copyFrom=${payment.id}`}
                  className="p-1 text-theme-muted/50 hover:text-theme-primary-text transition-colors"
                  aria-label={t("payments.duplicate")}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </Link>
                {isOwner && !isSettled && (
                  <DeletePaymentForm paymentId={payment.id} />
                )}
              </div>
            </div>
            {custom && <SplitContent splits={splitsWithProfile} />}
          </>
        );

        return (
          <div key={payment.id} className="px-4 py-3">
            {custom ? (
              <SplitAccordionProvider>{rowContent}</SplitAccordionProvider>
            ) : (
              rowContent
            )}
          </div>
        );
      })}
    </div>
  );
}
