import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { t } from "@/lib/i18n";
import { formatCurrency } from "@/lib/format/currency";
import type {
  GroupMembershipWithDescriptionResult,
  DashboardPaymentResult,
} from "@/types/query-results";

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

  const groups = (groupMemberships as GroupMembershipWithDescriptionResult[] | null)?.map((m) => m.groups) || [];

  // Get recent payments from all groups
  const groupIds = groups.map((g) => g?.id).filter(Boolean) as string[];

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
        .order("created_at", { ascending: false })
        .limit(5)) as { data: DashboardPaymentResult[] | null }
    : { data: [] as DashboardPaymentResult[] };

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-theme-headline mb-6">
        {t("dashboard.title")}
      </h1>

      {groups.length === 0 ? (
        <div className="bg-theme-card-bg rounded-lg shadow p-6 text-center">
          <h2 className="text-lg font-medium text-theme-headline mb-2">
            {t("dashboard.welcome.title")}
          </h2>
          <p className="text-theme-muted mb-4">
            {t("dashboard.welcome.description")}
          </p>
          <Link
            href="/groups/new"
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-theme-button-text bg-theme-primary hover:bg-theme-primary/80"
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
              className="bg-theme-primary text-theme-button-text rounded-lg p-4 text-center hover:bg-theme-primary/80 transition-colors"
            >
              <span className="block text-2xl mb-1">+</span>
              <span className="text-sm">{t("dashboard.quickActions.addPayment")}</span>
            </Link>
            <Link
              href="/payments"
              className="bg-theme-card-bg border border-theme-card-border rounded-lg p-4 text-center hover:bg-theme-bg transition-colors"
            >
              <span className="block text-2xl mb-1 text-theme-muted">📋</span>
              <span className="text-sm text-theme-text">
                {t("dashboard.quickActions.viewPayments")}
              </span>
            </Link>
            <Link
              href="/settlement"
              className="bg-theme-card-bg border border-theme-card-border rounded-lg p-4 text-center hover:bg-theme-bg transition-colors"
            >
              <span className="block text-2xl mb-1 text-theme-muted">💰</span>
              <span className="text-sm text-theme-text">
                {t("dashboard.quickActions.settlement")}
              </span>
            </Link>
            <Link
              href="/groups"
              className="bg-theme-card-bg border border-theme-card-border rounded-lg p-4 text-center hover:bg-theme-bg transition-colors"
            >
              <span className="block text-2xl mb-1 text-theme-muted">👥</span>
              <span className="text-sm text-theme-text">
                {t("dashboard.quickActions.groups")}
              </span>
            </Link>
          </div>

          {/* My Groups */}
          <div className="bg-theme-card-bg rounded-lg shadow">
            <div className="px-4 py-3 border-b border-theme-card-border">
              <h2 className="text-lg font-medium text-theme-headline">
                {t("dashboard.sections.myGroups")}
              </h2>
            </div>
            <ul className="divide-y divide-theme-card-border">
              {groups.map((group) =>
                group ? (
                  <li key={group.id}>
                    <Link
                      href={`/groups/${group.id}`}
                      className="block px-4 py-3 hover:bg-theme-bg"
                    >
                      <p className="font-medium text-theme-headline">{group.name}</p>
                      {group.description && (
                        <p className="text-sm text-theme-text">
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
          <div className="bg-theme-card-bg rounded-lg shadow">
            <div className="px-4 py-3 border-b border-theme-card-border flex justify-between items-center">
              <h2 className="text-lg font-medium text-theme-headline">
                {t("dashboard.sections.recentPayments")}
              </h2>
              <Link
                href="/payments"
                className="text-sm text-theme-primary-text hover:text-theme-primary-text/80"
              >
                {t("common.viewAll")}
              </Link>
            </div>
            {recentPayments && recentPayments.length > 0 ? (
              <ul className="divide-y divide-theme-card-border">
                {recentPayments.map((payment) => (
                  <li key={payment.id} className="px-4 py-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium text-theme-headline">
                          {payment.description}
                        </p>
                        <p className="text-sm text-theme-text">
                          {payment.profiles?.display_name ||
                            payment.profiles?.email}{" "}
                          - {payment.payment_date}
                        </p>
                      </div>
                      <span className="font-medium text-theme-headline">
                        {formatCurrency(payment.amount)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-6 text-center text-theme-text">
                {t("dashboard.noPayments")}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
