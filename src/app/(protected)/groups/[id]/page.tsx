import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { t } from "@/lib/i18n";
import InviteMemberForm from "@/components/InviteMemberForm";
import { GroupPaymentForm } from "@/components/GroupPaymentForm";
import { InviteLinkButton } from "@/components/InviteLinkButton";
import type {
  GroupResult,
  GroupMemberDetailResult,
  DashboardPaymentResult,
} from "@/types/query-results";

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

  // Get group members
  const { data: members } = (await supabase
    .from("group_members")
    .select(
      `
      role,
      joined_at,
      profiles (
        id,
        display_name,
        email
      )
    `
    )
    .eq("group_id", id)) as { data: GroupMemberDetailResult[] | null };

  // Get recent payments
  const { data: recentPayments } = (await supabase
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
    .eq("group_id", id)
    .order("payment_date", { ascending: false })
    .limit(5)) as { data: DashboardPaymentResult[] | null };

  // Calculate group stats
  const { data: allPayments } = (await supabase
    .from("payments")
    .select("amount")
    .eq("group_id", id)) as { data: { amount: number }[] | null };

  const totalExpenses =
    allPayments?.reduce((sum, p) => sum + Number(p.amount), 0) || 0;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <Link
          href="/groups"
          className="text-sm text-blue-600 hover:text-blue-500"
        >
          &larr; {t("groups.backToGroups")}
        </Link>
      </div>

      <div className="bg-white rounded-lg shadow mb-6">
        <div className="px-4 py-5 sm:p-6">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{group.name}</h1>
              {group.description && (
                <p className="mt-1 text-gray-700">{group.description}</p>
              )}
            </div>
            {isOwner && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                {t("common.owner")}
              </span>
            )}
          </div>

          <div className="mt-6 grid grid-cols-2 gap-4">
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm text-gray-700">
                {t("groups.detail.totalExpenses")}
              </p>
              <p className="text-2xl font-semibold text-gray-900">
                ¥{totalExpenses.toLocaleString()}
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm text-gray-700">
                {t("groups.detail.members")}
              </p>
              <p className="text-2xl font-semibold text-gray-900">
                {members?.length || 0}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 支払い登録フォーム */}
      <div className="bg-white rounded-lg shadow mb-6">
        <div className="px-4 py-3 border-b border-gray-200">
          <h2 className="text-lg font-medium text-gray-900">
            {t("payments.addPayment")}
          </h2>
        </div>
        <div className="px-4 py-4 sm:p-6">
          <GroupPaymentForm
            groupId={id}
            currentUserId={user?.id || ""}
            memberIds={members?.map((m) => m.profiles?.id).filter((id): id is string => !!id) || []}
          />
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Members */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-4 py-3 border-b border-gray-200">
            <h2 className="text-lg font-medium text-gray-900">
              {t("groups.detail.members")}
            </h2>
          </div>
          <ul className="divide-y divide-gray-200">
            {members?.map((member) => (
              <li
                key={member.profiles?.id}
                className="px-4 py-3 flex justify-between items-center"
              >
                <div>
                  <p className="font-medium text-gray-900">
                    {member.profiles?.display_name || member.profiles?.email}
                  </p>
                  <p className="text-sm text-gray-700">
                    {t("groups.detail.joined")}{" "}
                    {new Date(member.joined_at).toLocaleDateString("ja-JP")}
                  </p>
                </div>
                {member.role === "owner" && (
                  <span className="text-xs text-blue-600 font-medium">
                    {t("common.owner")}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {/* 招待リンク（全メンバーが利用可能） */}
          <div className="px-4 py-3 border-t border-gray-200">
            <InviteLinkButton inviteCode={group.invite_code} />
          </div>

          {/* メールアドレスによる招待（オーナーのみ） */}
          {isOwner && (
            <div className="px-4 py-3 border-t border-gray-200">
              <InviteMemberForm groupId={id} />
            </div>
          )}
        </div>

        {/* Recent Payments */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-4 py-3 border-b border-gray-200 flex justify-between items-center">
            <h2 className="text-lg font-medium text-gray-900">
              {t("groups.detail.recentPayments")}
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
                      ¥{Number(payment.amount).toLocaleString()}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-6 text-center text-gray-700">
              {t("payments.noPayments")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
