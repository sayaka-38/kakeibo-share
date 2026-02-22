import { Suspense } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { t } from "@/lib/i18n";
import { formatCurrency } from "@/lib/format/currency";
import InviteMemberForm from "@/components/InviteMemberForm";
import FullPaymentForm from "@/components/payment-form/FullPaymentForm";
import { InviteLinkButton } from "@/components/InviteLinkButton";
import { RecentPaymentList } from "@/components/payment-list/RecentPaymentList";
import { PaymentListSkeleton } from "@/components/payment-list/PaymentListSkeleton";
import { DeleteGroupButton } from "@/components/DeleteGroupButton";
import { FlashMessage } from "@/components/FlashMessage";
import type {
  GroupResult,
  GroupMemberDetailResult,
} from "@/types/query-results";
import { CategoryManager } from "@/components/CategoryManager";
import type { Category, Profile } from "@/types/database";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function GroupDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Get group details
  const { data: group } = (await supabase
    .from("groups")
    .select("*")
    .eq("id", id)
    .single()) as { data: GroupResult | null };

  if (!group) {
    notFound();
  }

  // Check if user is a member
  const { data: membership } = await supabase
    .from("group_members")
    .select("role")
    .eq("group_id", id)
    .eq("user_id", user?.id || "")
    .single();

  if (!membership) {
    notFound();
  }

  const typedMembership = membership as { role: string };
  const isOwner = typedMembership.role === "owner";

  // Get group members (created_at はDBのカラム名)
  const { data: members } = (await supabase
    .from("group_members")
    .select(
      `
      role,
      created_at,
      profiles (
        id,
        display_name,
        email
      )
    `
    )
    .eq("group_id", id)) as { data: GroupMemberDetailResult[] | null };

  // Calculate group stats
  const { data: allPayments } = (await supabase
    .from("payments")
    .select("amount")
    .eq("group_id", id)) as { data: { amount: number }[] | null };

  const totalExpenses =
    allPayments?.reduce((sum, p) => sum + Number(p.amount), 0) || 0;

  // Get categories (default + group-specific)
  const { data: categories } = (await supabase
    .from("categories")
    .select("*")
    .or(`is_default.eq.true,group_id.eq.${id}`)) as { data: Category[] | null };

  // Get latest confirmed settlement session
  const { data: latestSettlement } = await supabase
    .from("settlement_sessions")
    .select("period_start, period_end, confirmed_at")
    .eq("group_id", id)
    .eq("status", "confirmed")
    .order("confirmed_at", { ascending: false })
    .limit(1)
    .single();

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <Link
          href="/dashboard"
          className="text-sm text-theme-primary-text hover:text-theme-primary-text/80"
        >
          &larr; {t("dashboard.title")}
        </Link>
      </div>

      <Suspense>
        <FlashMessage messages={{ groupCreated: t("groups.createSuccess") }} />
      </Suspense>

      <div className="bg-theme-card-bg rounded-lg shadow mb-6">
        <div className="px-4 py-5 sm:p-6">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-2xl font-bold text-theme-headline">{group.name}</h1>
              {group.description && (
                <p className="mt-1 text-theme-text">{group.description}</p>
              )}
            </div>
            {isOwner && (
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-theme-primary/15 text-theme-primary-text">
                  {t("common.owner")}
                </span>
                <DeleteGroupButton groupId={id} groupName={group.name} />
              </div>
            )}
          </div>

          <div className="mt-6 grid grid-cols-2 gap-4">
            <div className="bg-theme-bg rounded-lg p-4">
              <p className="text-sm text-theme-text">
                {t("groups.detail.totalExpenses")}
              </p>
              <p className="text-2xl font-semibold text-theme-headline">
                {formatCurrency(totalExpenses)}
              </p>
            </div>
            <div className="bg-theme-bg rounded-lg p-4">
              <p className="text-sm text-theme-text">
                {t("groups.detail.members")}
              </p>
              <p className="text-2xl font-semibold text-theme-headline">
                {members?.length || 0}
              </p>
            </div>
          </div>

          {/* Latest Settlement Info */}
          {latestSettlement && (
            <div className="mt-6 bg-theme-text/10 border border-theme-card-border rounded-lg p-3">
              <p className="text-sm text-theme-text">
                <span className="font-medium">最新の清算期間:</span>{" "}
                {latestSettlement.period_start} 〜 {latestSettlement.period_end}
              </p>
            </div>
          )}

          {/* Quick Links */}
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href={`/groups/${id}/settlement`}
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-theme-button-text bg-theme-primary rounded-lg hover:bg-theme-primary/80 transition-colors"
            >
              {t("settlementSession.title")}
            </Link>
            <Link
              href={`/groups/${id}/recurring-rules`}
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-theme-primary-text bg-theme-primary/10 rounded-lg hover:bg-theme-primary/15 transition-colors"
            >
              {t("recurringRules.title")}
            </Link>
          </div>
        </div>
      </div>

      {/* 支払い登録フォーム */}
      <div className="bg-theme-card-bg rounded-lg shadow mb-6">
        <div className="px-4 py-3 border-b border-theme-card-border">
          <h2 className="text-lg font-medium text-theme-headline">
            {t("payments.addPayment")}
          </h2>
        </div>
        <div className="px-4 py-4 sm:p-6">
          <FullPaymentForm
            groups={[group as import("@/types/database").Group]}
            categories={categories || []}
            members={{
              [id]: (members
                ?.map((m) => m.profiles)
                .filter((p): p is NonNullable<typeof p> => p !== null) || []) as Profile[],
            }}
            currentUserId={user?.id || ""}
            fixedGroupId={id}
          />
        </div>
      </div>

      {/* Category Management */}
      <div className="bg-theme-card-bg rounded-lg shadow mb-6">
        <div className="px-4 py-3 border-b border-theme-card-border">
          <h2 className="text-lg font-medium text-theme-headline">
            {t("categories.management.title")}
          </h2>
        </div>
        <div className="px-4 py-4">
          <CategoryManager groupId={id} categories={categories || []} />
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Members */}
        <div className="bg-theme-card-bg rounded-lg shadow">
          <div className="px-4 py-3 border-b border-theme-card-border">
            <h2 className="text-lg font-medium text-theme-headline">
              {t("groups.detail.members")}
            </h2>
          </div>
          <ul className="divide-y divide-theme-card-border">
            {members?.map((member) => (
              <li
                key={member.profiles?.id}
                className="px-4 py-3 flex justify-between items-center"
              >
                <div>
                  <p className="font-medium text-theme-headline">
                    {member.profiles?.display_name || member.profiles?.email}
                  </p>
                  <p className="text-sm text-theme-text">
                    {t("groups.detail.joined")}{" "}
                    {member.created_at.split("T")[0].replace(/-/g, "/")}
                  </p>
                </div>
                {member.role === "owner" && (
                  <span className="text-xs text-theme-primary-text font-medium">
                    {t("common.owner")}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {/* 招待リンク（全メンバーが利用可能） */}
          <div className="px-4 py-3 border-t border-theme-card-border">
            <InviteLinkButton inviteCode={group.invite_code} />
          </div>

          {/* メールアドレスによる招待（オーナーのみ） */}
          {isOwner && (
            <div className="px-4 py-3 border-t border-theme-card-border">
              <InviteMemberForm groupId={id} />
            </div>
          )}
        </div>

        {/* Recent Payments */}
        <div className="bg-theme-card-bg rounded-lg shadow">
          <div className="px-4 py-3 border-b border-theme-card-border flex justify-between items-center">
            <h2 className="text-lg font-medium text-theme-headline">
              {t("groups.detail.recentPayments")}
            </h2>
            <Link
              href="/payments"
              className="text-sm text-theme-primary-text hover:text-theme-primary-text/80"
            >
              {t("common.viewAll")}
            </Link>
          </div>
          <Suspense fallback={<PaymentListSkeleton count={3} />}>
            <RecentPaymentList groupId={id} limit={5} currentUserId={user?.id} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
