import { createClient } from "@/lib/supabase/server";
import { t } from "@/lib/i18n";

type Balance = {
  id: string;
  displayName: string;
  totalPaid: number;
  totalOwed: number;
  balance: number;
};

type Settlement = {
  from: string;
  fromName: string;
  to: string;
  toName: string;
  amount: number;
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

  type GroupMembershipResult = {
    group_id: string;
    groups: { id: string; name: string } | null;
  };

  const groups =
    (groupMemberships as GroupMembershipResult[] | null)
      ?.map((m) => m.groups)
      .filter((g): g is NonNullable<typeof g> => g !== null) || [];

  // Calculate settlements for each group
  const groupSettlements: {
    group: { id: string; name: string };
    balances: Balance[];
    settlements: Settlement[];
    totalExpenses: number;
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

    type MemberResult = {
      user_id: string;
      profiles: { id: string; display_name: string | null; email: string } | null;
    };

    const memberProfiles =
      (members as MemberResult[] | null)
        ?.map((m) => m.profiles)
        .filter((p): p is NonNullable<typeof p> => p !== null) || [];

    // Get all payments for this group
    type PaymentResult = {
      id: string;
      payer_id: string;
      amount: number;
      payment_splits: { user_id: string; amount: number }[] | null;
    };

    const { data: payments } = await supabase
      .from("payments")
      .select(
        `
        id,
        payer_id,
        amount,
        payment_splits (
          user_id,
          amount
        )
      `
      )
      .eq("group_id", group.id) as { data: PaymentResult[] | null };

    // Calculate balances
    const balanceMap: { [userId: string]: Balance } = {};

    memberProfiles.forEach((member) => {
      balanceMap[member.id] = {
        id: member.id,
        displayName: member.display_name || member.email,
        totalPaid: 0,
        totalOwed: 0,
        balance: 0,
      };
    });

    let totalExpenses = 0;

    payments?.forEach((payment) => {
      const amount = Number(payment.amount);
      totalExpenses += amount;

      // Add to total paid
      if (balanceMap[payment.payer_id]) {
        balanceMap[payment.payer_id].totalPaid += amount;
      }

      // Add to total owed from splits
      payment.payment_splits?.forEach((split) => {
        if (balanceMap[split.user_id]) {
          balanceMap[split.user_id].totalOwed += Number(split.amount);
        }
      });
    });

    // Calculate net balance (positive = owed money, negative = owes money)
    Object.values(balanceMap).forEach((b) => {
      b.balance = b.totalPaid - b.totalOwed;
    });

    // Calculate settlements (who pays whom)
    const settlements: Settlement[] = [];
    const debtors = Object.values(balanceMap)
      .filter((b) => b.balance < 0)
      .sort((a, b) => a.balance - b.balance);
    const creditors = Object.values(balanceMap)
      .filter((b) => b.balance > 0)
      .sort((a, b) => b.balance - a.balance);

    let i = 0;
    let j = 0;

    while (i < debtors.length && j < creditors.length) {
      const debtor = debtors[i];
      const creditor = creditors[j];
      const amount = Math.min(-debtor.balance, creditor.balance);

      if (amount > 0) {
        settlements.push({
          from: debtor.id,
          fromName: debtor.displayName,
          to: creditor.id,
          toName: creditor.displayName,
          amount: Math.round(amount),
        });
      }

      debtor.balance += amount;
      creditor.balance -= amount;

      if (debtor.balance >= 0) i++;
      if (creditor.balance <= 0) j++;
    }

    groupSettlements.push({
      group,
      balances: Object.values(balanceMap),
      settlements,
      totalExpenses,
    });
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        {t("settlement.title")}
      </h1>

      {groupSettlements.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-6 text-center">
          <p className="text-gray-500">{t("settlement.noGroups")}</p>
        </div>
      ) : (
        <div className="space-y-8">
          {groupSettlements.map(
            ({ group, balances, settlements, totalExpenses }) => (
              <div key={group.id} className="bg-white rounded-lg shadow">
                <div className="px-4 py-3 border-b border-gray-200">
                  <h2 className="text-lg font-medium text-gray-900">
                    {group.name}
                  </h2>
                  <p className="text-sm text-gray-500">
                    {t("settlement.totalExpenses")}: {t("common.currency")}{totalExpenses.toLocaleString()}
                  </p>
                </div>

                <div className="p-4 space-y-6">
                  {/* Balance Summary */}
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 mb-3">
                      {t("settlement.balanceSummary")}
                    </h3>
                    <div className="space-y-2">
                      {balances.map((balance) => (
                        <div
                          key={balance.id}
                          className="flex justify-between items-center text-sm"
                        >
                          <span className="text-gray-600">
                            {balance.displayName}
                          </span>
                          <div className="text-right">
                            <span className="text-gray-500 mr-4">
                              {t("settlement.paid")}: {t("common.currency")}{balance.totalPaid.toLocaleString()}
                            </span>
                            <span
                              className={
                                balance.totalPaid - balance.totalOwed >= 0
                                  ? "text-green-600 font-medium"
                                  : "text-red-600 font-medium"
                              }
                            >
                              {balance.totalPaid - balance.totalOwed >= 0
                                ? "+"
                                : ""}
                              {t("common.currency")}
                              {(
                                balance.totalPaid - balance.totalOwed
                              ).toLocaleString()}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Settlements */}
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 mb-3">
                      {t("settlement.requiredSettlements")}
                    </h3>
                    {settlements.length > 0 ? (
                      <div className="space-y-3">
                        {settlements.map((settlement, index) => (
                          <div
                            key={index}
                            className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-gray-900">
                                {settlement.fromName}
                              </span>
                              <svg
                                className="w-4 h-4 text-gray-400"
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
                              <span className="font-medium text-gray-900">
                                {settlement.toName}
                              </span>
                            </div>
                            <span className="text-lg font-semibold text-blue-600">
                              {t("common.currency")}{settlement.amount.toLocaleString()}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-gray-500 text-sm">
                        {t("settlement.allSettled")}
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
