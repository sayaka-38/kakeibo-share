import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { t } from "@/lib/i18n";
import Link from "next/link";
import type { Profile, Category } from "@/types/database";
import SettlementSessionManager from "./SettlementSessionManager";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function SettlementPage({ params }: PageProps) {
  const { id: groupId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // グループ情報を取得
  const { data: group } = await supabase
    .from("groups")
    .select("*")
    .eq("id", groupId)
    .single();

  if (!group) {
    redirect("/groups");
  }

  // メンバーシップ確認
  const { data: membership } = await supabase
    .from("group_members")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .single();

  if (!membership) {
    redirect("/groups");
  }

  // メンバー一覧を取得
  const { data: membersData } = await supabase
    .from("group_members")
    .select(`
      user_id,
      profiles (id, display_name, email)
    `)
    .eq("group_id", groupId);

  const members: Profile[] =
    membersData
      ?.map((m) => m.profiles as unknown as Profile)
      .filter((p): p is Profile => p !== null) || [];

  // カテゴリ一覧を取得
  const { data: categories } = await supabase
    .from("categories")
    .select("*")
    .or(`is_default.eq.true,group_id.eq.${groupId}`);

  // 既存のdraftセッションを確認
  const { data: existingSession } = await supabase
    .from("settlement_sessions")
    .select("*")
    .eq("group_id", groupId)
    .eq("status", "draft")
    .single();

  // スマート提案を取得
  const { data: suggestion } = await supabase.rpc("get_settlement_period_suggestion", {
    p_group_id: groupId,
    p_user_id: user.id,
  });

  const suggestionData = Array.isArray(suggestion) ? suggestion[0] : suggestion;

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Link
          href={`/groups/${groupId}`}
          className="text-sm text-blue-600 hover:text-blue-800 mb-2 inline-block"
        >
          &larr; {group.name}
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">
          {t("settlementSession.title")}
        </h1>
        <p className="text-sm text-gray-600 mt-1">
          {t("settlementSession.subtitle")}
        </p>
      </div>

      {/* Session Manager */}
      <SettlementSessionManager
        groupId={groupId}
        currentUserId={user.id}
        members={members}
        categories={(categories as Category[]) || []}
        existingSession={existingSession}
        suggestion={suggestionData ? {
          suggestedStart: suggestionData.suggested_start,
          suggestedEnd: suggestionData.suggested_end,
          oldestUnsettledDate: suggestionData.oldest_unsettled_date,
          lastConfirmedEnd: suggestionData.last_confirmed_end,
          unsettledCount: suggestionData.unsettled_count,
        } : null}
      />
    </div>
  );
}
