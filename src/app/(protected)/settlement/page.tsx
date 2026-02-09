import { createClient } from "@/lib/supabase/server";
import { t } from "@/lib/i18n";
import { formatCurrency } from "@/lib/format/currency";
import { isProxySplit, getProxyBeneficiaryId } from "@/lib/calculation/split";
import {
  calculateBalances,
  suggestSettlements,
  splitEqually,
  type Member,
  type Payment,
} from "@/lib/settlement";
import type { GroupMembershipResult, MemberResult } from "@/types/query-results";

type PaymentSplitRow = {
  user_id: string;
  amount: number;
};

type PaymentWithDetails = {
  id: string;
  payer_id: string;
  amount: number;
  description: string;
  payment_date: string;
  payer: { display_name: string | null; email: string | null } | null;
  payment_splits: PaymentSplitRow[];
};

export default async function SettlementPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Get user's groups
  const { data: groupMemberships } = await supabase
    .from("group_members")
    .select(
      `
      group_id,
      groups (
        id,
        name
      )
    `
    )
    .eq("user_id", user?.id || "");

  const groups =
    (groupMemberships as GroupMembershipResult[] | null)
      ?.map((m) => m.groups)
      .filter((g): g is NonNullable<typeof g> => g !== null) || [];

  // Calculate settlements for each group
  const groupSettlements: {
    group: { id: string; name: string };
    balances: ReturnType<typeof calculateBalances>;
    settlements: ReturnType<typeof suggestSettlements>["settlements"];
    unsettledRemainder: number;
    totalExpenses: number;
    memberCount: number;
    perPersonAmount: number;
    payments: PaymentWithDetails[];
    hasSplits: boolean;
    memberProfiles: { id: string; display_name: string | null; email: string | null }[];
  }[] = [];

  for (const group of groups) {
    // Get all members of this group
    const { data: members } = await supabase
      .from("group_members")
      .select(
        `
        user_id,
        profiles (
          id,
          display_name,
          email
        )
      `
      )
      .eq("group_id", group.id);

    const memberProfiles =
      (members as MemberResult[] | null)
        ?.map((m) => m.profiles)
        .filter((p): p is NonNullable<typeof p> => p !== null) || [];

    // Member を新ロジックの型に変換
    const memberList: Member[] = memberProfiles.map((p) => ({
      id: p.id,
      displayName: p.display_name || p.email || "Unknown",
    }));

    // Get all payments for this group with payer info + splits
    const { data: rawPayments } = (await supabase
      .from("payments")
      .select(
        `
        id,
        payer_id,
        amount,
        description,
        payment_date,
        payer:profiles!payments_payer_id_fkey (
          display_name,
          email
        ),
        payment_splits (
          user_id,
          amount
        )
      `
      )
      .eq("group_id", group.id)
      .order("payment_date", { ascending: false })
      .order("created_at", { ascending: false })) as {
      data: PaymentWithDetails[] | null;
    };

    const payments = rawPayments || [];

    // 支払いを新ロジックの型に変換（splits参照方式）
    const paymentList: Payment[] = payments.map((p) => ({
      id: p.id,
      payerId: p.payer_id,
      amount: Number(p.amount),
      splits:
        p.payment_splits.length > 0
          ? p.payment_splits.map((s) => ({
              userId: s.user_id,
              amount: Number(s.amount),
            }))
          : undefined,
    }));

    // 新ロジックで残高計算
    const balances = calculateBalances(memberList, paymentList);

    // 新ロジックで清算提案
    const { settlements, unsettledRemainder } = suggestSettlements(balances);

    // 総額計算
    const totalExpenses = paymentList.reduce((sum, p) => sum + p.amount, 0);

    // 1人あたり負担額（計算プロセス表示用）
    const { amountPerPerson } =
      memberList.length > 0 ? splitEqually(totalExpenses, memberList.length) : { amountPerPerson: 0 };

    const hasSplits = payments.some((p) => p.payment_splits.length > 0);

    groupSettlements.push({
      group,
      balances,
      settlements,
      unsettledRemainder,
      totalExpenses,
      memberCount: memberList.length,
      perPersonAmount: amountPerPerson,
      payments,
      hasSplits,
      memberProfiles,
    });
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-theme-headline mb-6">
        {t("settlement.title")}
      </h1>

      {groupSettlements.length === 0 ? (
        <div className="bg-theme-card-bg rounded-lg shadow p-6 text-center">
          <p className="text-theme-text">{t("settlement.noGroups")}</p>
        </div>
      ) : (
        <div className="space-y-8">
          {groupSettlements.map(
            ({
              group,
              balances,
              settlements,
              unsettledRemainder,
              totalExpenses,
              memberCount,
              perPersonAmount,
              payments,
              hasSplits,
              memberProfiles,
            }) => (
              <div key={group.id} className="bg-theme-card-bg rounded-lg shadow">
                <div className="px-4 py-3 border-b border-theme-card-border">
                  <h2 className="text-lg font-medium text-theme-headline">
                    {group.name}
                  </h2>
                </div>

                <div className="p-4 space-y-6">
                  {/* 計算プロセス（Calculation Breakdown） */}
                  <div className="bg-theme-primary/10 rounded-lg p-4">
                    <h3 className="text-sm font-medium text-theme-primary-text mb-3">
                      {t("settlement.calculationBreakdown")}
                    </h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-theme-primary-text">
                          {t("settlement.totalExpenses")}
                        </span>
                        <span className="font-medium text-theme-primary-text">
                          {formatCurrency(totalExpenses)}
                        </span>
                      </div>
                      {hasSplits ? (
                        <div className="border-t border-theme-primary/30 pt-2">
                          <p className="text-xs text-theme-primary-text">
                            {t("settlement.splitsBasedNote")}
                          </p>
                        </div>
                      ) : (
                        <>
                          <div className="flex justify-between">
                            <span className="text-theme-primary-text">
                              {t("settlement.memberCount", { count: memberCount })}
                            </span>
                            <span className="text-theme-primary-text">÷ {memberCount}</span>
                          </div>
                          <div className="border-t border-theme-primary/30 pt-2 flex justify-between">
                            <span className="text-theme-primary-text">
                              {t("settlement.perPerson")}
                            </span>
                            <span className="font-bold text-theme-primary-text">
                              {formatCurrency(perPersonAmount)}
                            </span>
                          </div>
                        </>
                      )}
                      {unsettledRemainder > 0 && (
                        <div className="flex justify-between text-xs">
                          <span className="text-theme-primary-text">
                            {t("settlement.unsettledRemainder")}
                          </span>
                          <span className="text-theme-primary-text">
                            {formatCurrency(unsettledRemainder)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Balance Summary */}
                  <div>
                    <h3 className="text-sm font-medium text-theme-text mb-3">
                      {t("settlement.balanceSummary")}
                    </h3>
                    <div className="space-y-2">
                      {balances.map((balance) => (
                        <div
                          key={balance.memberId}
                          className="flex justify-between items-center text-sm"
                        >
                          <span className="text-theme-muted">
                            {balance.displayName}
                          </span>
                          <div className="text-right">
                            <span className="text-theme-text mr-4">
                              {t("settlement.paid")}: {formatCurrency(balance.totalPaid)}
                            </span>
                            <span className="text-theme-muted mr-4">
                              {t("settlement.owed")}: {formatCurrency(balance.totalOwed)}
                            </span>
                            <span
                              className={
                                balance.balance >= 0
                                  ? "text-theme-primary-text font-medium"
                                  : "text-theme-accent font-medium"
                              }
                            >
                              {formatCurrency(balance.balance, { showSign: true })}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Settlements */}
                  <div>
                    <h3 className="text-sm font-medium text-theme-text mb-3">
                      {t("settlement.requiredSettlements")}
                    </h3>
                    {settlements.length > 0 ? (
                      <div className="space-y-3">
                        {settlements.map((settlement, index) => (
                          <div
                            key={index}
                            className="flex items-center justify-between p-3 bg-theme-bg rounded-lg"
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-theme-headline">
                                {settlement.fromName}
                              </span>
                              <svg
                                className="w-4 h-4 text-theme-muted"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M14 5l7 7m0 0l-7 7m7-7H3"
                                />
                              </svg>
                              <span className="font-medium text-theme-headline">
                                {settlement.toName}
                              </span>
                            </div>
                            <span className="text-lg font-semibold text-theme-primary-text">
                              {formatCurrency(settlement.amount)}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-theme-text text-sm">
                        {t("settlement.allSettled")}
                      </p>
                    )}
                  </div>

                  {/* Payment History（時系列リスト） */}
                  <div>
                    <h3 className="text-sm font-medium text-theme-text mb-3">
                      {t("settlement.paymentHistory")}
                    </h3>
                    {payments.length > 0 ? (
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                          <thead>
                            <tr className="border-b border-theme-card-border">
                              <th className="text-left py-2 px-2 font-medium text-theme-muted">
                                {t("settlement.date")}
                              </th>
                              <th className="text-left py-2 px-2 font-medium text-theme-muted">
                                {t("settlement.description")}
                              </th>
                              <th className="text-left py-2 px-2 font-medium text-theme-muted">
                                {t("settlement.paidBy")}
                              </th>
                              <th className="text-right py-2 px-2 font-medium text-theme-muted">
                                {t("settlement.amount")}
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {payments.slice(0, 10).map((payment) => {
                              const isProxy = isProxySplit(payment.payment_splits, payment.payer_id);
                              const beneficiaryUserId = getProxyBeneficiaryId(payment.payment_splits, payment.payer_id);
                              const beneficiaryName = beneficiaryUserId
                                ? memberProfiles.find(
                                    (p) => p.id === beneficiaryUserId
                                  )?.display_name || undefined
                                : undefined;

                              return (
                                <tr
                                  key={payment.id}
                                  className="border-b border-theme-card-border hover:bg-theme-bg"
                                >
                                  <td className="py-2 px-2 text-theme-muted">
                                    {new Date(
                                      payment.payment_date
                                    ).toLocaleDateString("ja-JP")}
                                  </td>
                                  <td className="py-2 px-2 text-theme-headline">
                                    <span>{payment.description}</span>
                                    {isProxy && (
                                      <>
                                        <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-theme-secondary/15 text-theme-secondary">
                                          {t("payments.display.proxyBadge")}
                                        </span>
                                        {beneficiaryName && (
                                          <span className="ml-1 text-xs text-theme-secondary">
                                            ({t("payments.display.proxyFor", { name: beneficiaryName })})
                                          </span>
                                        )}
                                      </>
                                    )}
                                  </td>
                                  <td className="py-2 px-2 text-theme-muted">
                                    {payment.payer?.display_name ||
                                      payment.payer?.email ||
                                      "-"}
                                  </td>
                                  <td className="py-2 px-2 text-right text-theme-headline font-medium">
                                    {formatCurrency(Number(payment.amount))}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                        {payments.length > 10 && (
                          <p className="text-xs text-theme-muted mt-2 text-center">
                            他 {payments.length - 10} 件の支払い
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="text-theme-muted text-sm">
                        {t("dashboard.noPayments")}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
