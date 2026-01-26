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
import type { DashboardPaymentResult } from "@/types/query-results";

interface RecentPaymentListProps {
  groupId: string;
  limit?: number;
}

export async function RecentPaymentList({
  groupId,
  limit = 5,
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
      profiles (
        display_name,
        email
      )
    `
    )
    .eq("group_id", groupId)
    .order("payment_date", { ascending: false })
    .limit(limit)) as { data: DashboardPaymentResult[] | null };

  if (!payments || payments.length === 0) {
    return (
      <p className="px-4 py-6 text-center text-gray-700">
        {t("payments.noPayments")}
      </p>
    );
  }

  return (
    <ul className="divide-y divide-gray-200">
      {payments.map((payment) => (
        <li key={payment.id} className="px-4 py-3">
          <div className="flex justify-between items-start">
            <div>
              <p className="font-medium text-gray-900">{payment.description}</p>
              <p className="text-sm text-gray-700">
                {payment.profiles?.display_name || payment.profiles?.email} -{" "}
                {payment.payment_date}
              </p>
            </div>
            <span className="font-medium text-gray-900">
              ¥{Number(payment.amount).toLocaleString("ja-JP")}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
