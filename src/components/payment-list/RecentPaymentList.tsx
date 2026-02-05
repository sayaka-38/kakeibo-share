/**
 * RecentPaymentList - 最近の支払い一覧
 *
 * Phase 2-2: Suspense 対応のサーバーコンポーネント
 *
 * グループの最近の支払いを非同期で取得して表示。
 * Suspense と組み合わせてスケルトンローディングを実現。
 */
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
  profiles: { display_name: string | null; email: string } | null;
};

type RecentPaymentRow = {
  id: string;
  amount: number;
  description: string;
  payment_date: string;
  payer_id: string;
  settlement_id: string | null;
  profiles: { display_name: string | null; email: string } | null;
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
      profiles (
        display_name,
        email
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
    .limit(limit)) as { data: RecentPaymentRow[] | null };

  if (!payments || payments.length === 0) {
    return (
      <p className="px-4 py-6 text-center text-gray-700">
        {t("payments.noPayments")}
      </p>
    );
  }

  return (
    <ul className="divide-y divide-gray-200">
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

        const rowContent = (
          <>
            <div className="flex justify-between items-start">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium text-gray-900">
                    {payment.description}
                  </p>
                  {payment.settlement_id && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">
                      清算済
                    </span>
                  )}
                  {isProxy && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-700">
                      {t("payments.display.proxyBadge")}
                    </span>
                  )}
                  {custom && <SplitBadge />}
                </div>
                <p className="text-sm text-gray-700">
                  {payment.profiles?.display_name || payment.profiles?.email} -{" "}
                  {payment.payment_date}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-medium text-gray-900">
                  {formatCurrency(Number(payment.amount))}
                </span>
                {currentUserId && payment.payer_id === currentUserId && (
                  <DeletePaymentForm paymentId={payment.id} />
                )}
              </div>
            </div>
            {custom && <SplitContent splits={splitsWithProfile} />}
          </>
        );

        return (
          <li key={payment.id} className="px-4 py-3">
            {custom ? (
              <SplitAccordionProvider>{rowContent}</SplitAccordionProvider>
            ) : (
              rowContent
            )}
          </li>
        );
      })}
    </ul>
  );
}
