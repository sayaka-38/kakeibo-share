import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { t } from "@/lib/i18n";
import { formatCurrency } from "@/lib/format/currency";
import { isCustomSplit } from "@/lib/calculation/split";
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

  // デモモードかどうかを確認
  const { data: profile } = (await supabase
    .from("profiles")
    .select("is_demo")
    .eq("id", user?.id || "")
    .single()) as { data: { is_demo: boolean } | null };

  const isDemo = profile?.is_demo ?? false;

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
    profiles: { display_name: string | null; email: string } | null;
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
    profiles: { display_name: string | null; email: string } | null;
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
        .order("payment_date", { ascending: false })) as {
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

  // デバッグ: コンソールに is_demo の値を出力
  console.log("[DEBUG] isDemo:", isDemo, "profile:", profile);

  return (
    <div className="max-w-4xl mx-auto">
      {/* デバッグ: is_demo の状態を表示 */}
      {process.env.NODE_ENV === "development" && (
        <div className="mb-4 p-2 bg-yellow-100 text-yellow-800 text-xs rounded">
          DEBUG: isDemo = {String(isDemo)} | profile.is_demo = {String(profile?.is_demo)}
        </div>
      )}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t("payments.title")}</h1>
        <Link
          href="/payments/new"
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
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
              <div key={month} className="bg-white rounded-lg shadow">
                <div className="px-4 py-3 border-b border-gray-200 flex justify-between items-center">
                  <h2 className="font-medium text-gray-900">{monthName}</h2>
                  <span className="text-sm font-medium text-gray-600">
                    {t("common.total")}: {formatCurrency(monthTotal)}
                  </span>
                </div>
                <ul className="divide-y divide-gray-200">
                  {monthPayments.map((payment) => {
                    const isProxy =
                      payment.payment_splits.length > 0 &&
                      payment.payment_splits.some(
                        (s) =>
                          s.user_id === payment.payer_id && s.amount === 0
                      );

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
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-medium text-gray-900 truncate">
                                {payment.description}
                              </p>
                              {payment.categories && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
                                  {payment.categories.name}
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
                              {payment.profiles?.display_name ||
                                payment.profiles?.email}{" "}
                              - {payment.payment_date}
                            </p>
                            <p className="text-xs text-gray-600">
                              {payment.groups?.name}
                            </p>
                          </div>
                          <div className="flex items-center gap-4 ml-4">
                            <span className="font-medium text-gray-900">
                              {formatCurrency(Number(payment.amount))}
                            </span>
                            {/* デモモード時のみ削除フォームを表示 */}
                            {(isDemo || process.env.NODE_ENV === "development") && (
                              <DeletePaymentForm
                                paymentId={payment.id}
                                groupId={payment.group_id}
                              />
                            )}
                          </div>
                        </div>
                        {custom && <SplitContent splits={splitsWithProfile} />}
                      </>
                    );

                    return (
                      <li key={payment.id} className="px-4 py-3">
                        {custom ? (
                          <SplitAccordionProvider>
                            {rowContent}
                          </SplitAccordionProvider>
                        ) : (
                          rowContent
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow p-6 text-center">
          <p className="text-gray-700 mb-4">{t("payments.noPayments")}</p>
          <Link
            href="/payments/new"
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
          >
            {t("payments.addFirstPayment")}
          </Link>
        </div>
      )}
    </div>
  );
}
