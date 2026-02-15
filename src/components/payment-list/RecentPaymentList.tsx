/**
 * RecentPaymentList - Dashboard widget for recent payments
 *
 * Server component: fetches data from Supabase and renders
 * date-grouped payment rows using shared PaymentRow.
 */
import { createClient } from "@/lib/supabase/server";
import { t } from "@/lib/i18n";
import { formatDateHeader, groupPaymentsByDate } from "@/lib/format/date-group";
import { PaymentRow } from "./PaymentRow";
import type { PaymentSplitRow } from "./types";

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

  const { dateOrder, byDate } = groupPaymentsByDate(payments);

  return (
    <div>
      {dateOrder.map((date, dateIdx) => (
        <div
          key={date}
          className={
            dateIdx > 0 ? "border-t border-theme-card-border" : ""
          }
        >
          <div className="px-4 py-1.5 text-xs font-semibold text-theme-text bg-theme-bg">
            {formatDateHeader(date)}
          </div>
          <div className="divide-y divide-dashed divide-theme-card-border/60">
            {byDate[date]!.map((payment) => (
              <PaymentRow
                key={payment.id}
                payment={payment}
                userId={currentUserId}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
