import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { t } from "@/lib/i18n";
import Link from "next/link";
import type { Profile, Category } from "@/types/database";
import SettlementSessionManager from "./SettlementSessionManager";
import type { SessionData } from "./SettlementSessionManager";

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

  // 既存のdraftセッションを全件確認（並行清算のため複数あり得る）
  const { data: allDrafts } = await supabase
    .from("settlement_sessions")
    .select("*")
    .eq("group_id", groupId)
    .eq("status", "draft")
    .order("period_start", { ascending: true });

  const existingDraft = allDrafts?.[0] ?? null;

  // pending_paymentセッションを確認（送金待ち中の清算）
  const { data: pendingSession } = await supabase
    .from("settlement_sessions")
    .select("*")
    .eq("group_id", groupId)
    .eq("status", "pending_payment")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // スマート提案を取得
  const { data: suggestion } = await supabase.rpc("get_settlement_period_suggestion", {
    p_group_id: groupId,
    p_user_id: user.id,
  });

  const suggestionData = Array.isArray(suggestion) ? suggestion[0] : suggestion;

  const mapSession = (s: typeof existingDraft): SessionData | null => {
    if (!s) return null;
    return {
      ...s,
      net_transfers: (s.net_transfers as SessionData["net_transfers"]) ?? null,
      is_zero_settlement: s.is_zero_settlement ?? false,
      payment_reported_at: s.payment_reported_at ?? null,
      payment_reported_by: s.payment_reported_by ?? null,
      settled_at: s.settled_at ?? null,
      settled_by: s.settled_by ?? null,
    };
  };

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Link
          href={`/groups/${groupId}`}
          className="text-sm text-theme-primary-text hover:text-theme-primary-text/80 mb-2 inline-block"
        >
          &larr; {group.name}
        </Link>
        <h1 className="text-2xl font-bold text-theme-headline">
          {t("settlementSession.title")}
        </h1>
        <p className="text-sm text-theme-muted mt-1">
          {t("settlementSession.subtitle")}
        </p>
      </div>

      {/* Session Manager */}
      <SettlementSessionManager
        groupId={groupId}
        currentUserId={user.id}
        members={members}
        categories={(categories as Category[]) || []}
        existingSession={mapSession(existingDraft)}
        allDraftSessions={(allDrafts ?? []).map(mapSession).filter((s): s is SessionData => s !== null)}
        pendingSession={mapSession(pendingSession)}
        suggestion={suggestionData ? {
          suggestedStart: suggestionData.suggested_start,
          suggestedEnd: suggestionData.suggested_end,
          oldestUnsettledDate: suggestionData.oldest_unsettled_date,
          lastConfirmedEnd: suggestionData.last_confirmed_end,
          unsettledCount: suggestionData.unsettled_count,
        } : null}
      />

      {/* History Link */}
      <div className="mt-6 text-center">
        <Link
          href={`/groups/${groupId}/settlement/history`}
          className="text-sm text-theme-muted hover:text-theme-text"
        >
          過去の清算履歴を見る &rarr;
        </Link>
      </div>
    </div>
  );
}
