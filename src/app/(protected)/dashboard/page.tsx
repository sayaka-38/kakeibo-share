import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { t } from "@/lib/i18n";

export default async function DashboardPage() {
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
        name,
        description
      )
    `
    )
    .eq("user_id", user?.id || "");

  type GroupMembershipResult = {
    group_id: string;
    groups: { id: string; name: string; description: string | null } | null;
  };

  const groups = (groupMemberships as GroupMembershipResult[] | null)?.map((m) => m.groups) || [];

  // Get recent payments from all groups
  const groupIds = groups.map((g) => g?.id).filter(Boolean) as string[];

  type PaymentResult = {
    id: string;
    amount: number;
    description: string;
    payment_date: string;
    profiles: { display_name: string | null; email: string } | null;
  };

  const { data: recentPayments } = groupIds.length
    ? (await supabase
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
        .in("group_id", groupIds)
        .order("payment_date", { ascending: false })
        .limit(5)) as { data: PaymentResult[] | null }
    : { data: [] as PaymentResult[] };

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        {t("dashboard.title")}
      </h1>

      {groups.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-6 text-center">
          <h2 className="text-lg font-medium text-gray-900 mb-2">
            {t("dashboard.welcome.title")}
          </h2>
          <p className="text-gray-600 mb-4">
            {t("dashboard.welcome.description")}
          </p>
          <Link
            href="/groups/new"
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
          >
            {t("dashboard.welcome.createGroup")}
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Quick Actions */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Link
              href="/payments/new"
              className="bg-blue-600 text-white rounded-lg p-4 text-center hover:bg-blue-700 transition-colors"
            >
              <span className="block text-2xl mb-1">+</span>
              <span className="text-sm">{t("dashboard.quickActions.addPayment")}</span>
            </Link>
            <Link
              href="/payments"
              className="bg-white border border-gray-200 rounded-lg p-4 text-center hover:bg-gray-50 transition-colors"
            >
              <span className="block text-2xl mb-1 text-gray-600">📋</span>
              <span className="text-sm text-gray-700">
                {t("dashboard.quickActions.viewPayments")}
              </span>
            </Link>
            <Link
              href="/settlement"
              className="bg-white border border-gray-200 rounded-lg p-4 text-center hover:bg-gray-50 transition-colors"
            >
              <span className="block text-2xl mb-1 text-gray-600">💰</span>
              <span className="text-sm text-gray-700">
                {t("dashboard.quickActions.settlement")}
              </span>
            </Link>
            <Link
              href="/groups"
              className="bg-white border border-gray-200 rounded-lg p-4 text-center hover:bg-gray-50 transition-colors"
            >
              <span className="block text-2xl mb-1 text-gray-600">👥</span>
              <span className="text-sm text-gray-700">
                {t("dashboard.quickActions.groups")}
              </span>
            </Link>
          </div>

          {/* My Groups */}
          <div className="bg-white rounded-lg shadow">
            <div className="px-4 py-3 border-b border-gray-200">
              <h2 className="text-lg font-medium text-gray-900">
                {t("dashboard.sections.myGroups")}
              </h2>
            </div>
            <ul className="divide-y divide-gray-200">
              {groups.map((group) =>
                group ? (
                  <li key={group.id}>
                    <Link
                      href={`/groups/${group.id}`}
                      className="block px-4 py-3 hover:bg-gray-50"
                    >
                      <p className="font-medium text-gray-900">{group.name}</p>
                      {group.description && (
                        <p className="text-sm text-gray-700">
                          {group.description}
                        </p>
                      )}
                    </Link>
                  </li>
                ) : null
              )}
            </ul>
          </div>

          {/* Recent Payments */}
          <div className="bg-white rounded-lg shadow">
            <div className="px-4 py-3 border-b border-gray-200 flex justify-between items-center">
              <h2 className="text-lg font-medium text-gray-900">
                {t("dashboard.sections.recentPayments")}
              </h2>
              <Link
                href="/payments"
                className="text-sm text-blue-600 hover:text-blue-500"
              >
                {t("common.viewAll")}
              </Link>
            </div>
            {recentPayments && recentPayments.length > 0 ? (
              <ul className="divide-y divide-gray-200">
                {recentPayments.map((payment) => (
                  <li key={payment.id} className="px-4 py-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium text-gray-900">
                          {payment.description}
                        </p>
                        <p className="text-sm text-gray-700">
                          {payment.profiles?.display_name ||
                            payment.profiles?.email}{" "}
                          - {payment.payment_date}
                        </p>
                      </div>
                      <span className="font-medium text-gray-900">
                        ¥{payment.amount.toLocaleString()}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-6 text-center text-gray-700">
                {t("dashboard.noPayments")}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
