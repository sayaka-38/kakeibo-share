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
} from "@/components/payment-list/PaymentSplitAccordion";

export default async function PaymentsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Get user's groups
  const { data: groupMemberships } = (await supabase
    .from("group_members")
    .select("group_id")
    .eq("user_id", user?.id || "")) as { data: { group_id: string }[] | null };

  const groupIds = groupMemberships?.map((m) => m.group_id) || [];

  // Get payments from user's groups
  type PaymentSplitRow = {
    user_id: string;
    amount: number;
    profiles: { display_name: string | null; email: string | null } | null;
  };

  type PaymentWithRelations = {
    id: string;
    group_id: string;
    payer_id: string;
    amount: number;
    description: string;
    category_id: string | null;
    payment_date: string;
    created_at: string;
    updated_at: string;
    settlement_id: string | null;
    profiles: { display_name: string | null; email: string | null } | null;
    categories: { name: string; icon: string | null } | null;
    groups: { name: string } | null;
    payment_splits: PaymentSplitRow[];
  };

  const { data: payments } = groupIds.length
    ? ((await supabase
        .from("payments")
        .select(
          `
        *,
        profiles (
          display_name,
          email
        ),
        categories (
          name,
          icon
        ),
        groups (
          name
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
        .in("group_id", groupIds)
        .order("payment_date", { ascending: false })
        .order("created_at", { ascending: false })) as {
        data: PaymentWithRelations[] | null;
      })
    : { data: [] as PaymentWithRelations[] };

  // Group payments by month
  const paymentsByMonth: {
    [key: string]: PaymentWithRelations[];
  } = {};

  payments?.forEach((payment) => {
    const month = payment.payment_date.substring(0, 7); // YYYY-MM
    if (!paymentsByMonth[month]) {
      paymentsByMonth[month] = [];
    }
    paymentsByMonth[month]!.push(payment);
  });

  const months = Object.keys(paymentsByMonth).sort().reverse();

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-theme-headline">{t("payments.title")}</h1>
        <Link
          href="/payments/new"
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-theme-button-text bg-theme-primary hover:bg-theme-primary/80"
        >
          {t("payments.addPayment")}
        </Link>
      </div>

      {payments && payments.length > 0 ? (
        <div className="space-y-6">
          {months.map((month) => {
            const monthPayments = paymentsByMonth[month] || [];
            const monthTotal = monthPayments.reduce(
              (sum, p) => sum + Number(p.amount),
              0
            );

            const monthDate = new Date(month + "-01");
            const monthName = monthDate.toLocaleDateString("ja-JP", {
              year: "numeric",
              month: "long",
            });

            return (
              <div key={month} className="bg-theme-card-bg rounded-lg border border-theme-card-border overflow-hidden">
                <div className="px-4 py-3 border-b border-theme-card-border flex justify-between items-center">
                  <h2 className="font-medium text-theme-headline">{monthName}</h2>
                  <span className="text-sm font-medium text-theme-muted">
                    {t("common.total")}: {formatCurrency(monthTotal)}
                  </span>
                </div>
                <div className="divide-y divide-theme-card-border">
                  {monthPayments.map((payment) => {
                    const isProxy = isProxySplit(payment.payment_splits, payment.payer_id);
                    const custom = isCustomSplit(
                      payment.payment_splits,
                      payment.payer_id,
                      Number(payment.amount)
                    );
                    const splitsWithProfile: SplitWithProfile[] =
                      payment.payment_splits.map((s, idx) => ({
                        user_id: `${s.user_id}-${idx}`,
                        amount: s.amount,
                        display_name: s.profiles?.display_name ?? null,
                        email: s.profiles?.email ?? "",
                      }));

                    const categoryIcon = payment.categories?.icon || "💰";
                    const isOwner = payment.payer_id === user?.id;
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
                              {payment.categories && (
                                <span className="text-[10px] bg-theme-bg text-theme-muted px-1.5 py-0.5 rounded">
                                  {payment.categories.name}
                                </span>
                              )}
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
                              {" · "}
                              {payment.groups?.name}
                            </div>
                          </div>

                          {/* Amount + actions */}
                          <span className="font-semibold text-sm text-theme-headline shrink-0">
                            {formatCurrency(Number(payment.amount))}
                          </span>

                          {/* Action icons */}
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
                              <Link
                                href={`/payments/${payment.id}/edit`}
                                className="p-1 text-theme-muted/50 hover:text-theme-primary-text transition-colors"
                                aria-label={t("payments.edit")}
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                </svg>
                              </Link>
                            )}
                            {isOwner && !isSettled && (
                              <DeletePaymentForm paymentId={payment.id} />
                            )}
                          </div>
                        </div>
                        {custom && <SplitContent splits={splitsWithProfile} />}
                      </>
                    );

                    return (
                      <div key={`${payment.id}-${payment.updated_at}`} className="px-4 py-3">
                        {custom ? (
                          <SplitAccordionProvider>
                            {rowContent}
                          </SplitAccordionProvider>
                        ) : (
                          rowContent
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-theme-card-bg rounded-lg border border-theme-card-border p-6 text-center">
          <p className="text-theme-text mb-4">{t("payments.noPayments")}</p>
          <Link
            href="/payments/new"
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-theme-button-text bg-theme-primary hover:bg-theme-primary/80"
          >
            {t("payments.addFirstPayment")}
          </Link>
        </div>
      )}
    </div>
  );
}
