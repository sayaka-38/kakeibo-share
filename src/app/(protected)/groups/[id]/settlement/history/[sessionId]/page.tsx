import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { formatCurrency } from "@/lib/format/currency";
import type { Profile } from "@/types/database";
import SettlementResultCard from "../../SettlementResultCard";
import type { EntryData, SessionData } from "../../SettlementSessionManager";

type PageProps = {
  params: Promise<{ id: string; sessionId: string }>;
};

export default async function SettlementHistoryDetailPage({ params }: PageProps) {
  const { id: groupId, sessionId } = await params;
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

  // セッション情報を取得
  const { data: session } = await supabase
    .from("settlement_sessions")
    .select(`
      *,
      confirmer:profiles!confirmed_by (display_name, email)
    `)
    .eq("id", sessionId)
    .eq("group_id", groupId)
    .single();

  if (!session || session.status === "draft") {
    redirect(`/groups/${groupId}/settlement/history`);
  }

  // エントリ一覧を取得
  const { data: entriesData } = await supabase
    .from("settlement_entries")
    .select(`
      *,
      category:categories!category_id (id, name, icon, color),
      payer:profiles!payer_id (id, display_name, email),
      splits:settlement_entry_splits (
        id,
        user_id,
        amount
      )
    `)
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false });

  // エントリデータを整形
  const entries: EntryData[] = (entriesData || []).map((e) => ({
    id: e.id,
    session_id: e.session_id,
    rule_id: e.rule_id,
    payment_id: e.payment_id,
    description: e.description,
    category_id: e.category_id,
    expected_amount: e.expected_amount,
    actual_amount: e.actual_amount,
    payer_id: e.payer_id,
    payment_date: e.payment_date,
    status: e.status,
    split_type: e.split_type,
    entry_type: e.entry_type,
    filled_by: e.filled_by,
    filled_at: e.filled_at,
    source_payment_id: e.source_payment_id,
    category: e.category as { id: string; name: string; icon: string | null; color: string | null } | null,
    payer: e.payer as { id: string; display_name: string | null; email: string | null } | null,
    splits: (e.splits || []).map((s: { id: string; user_id: string; amount: number }) => ({
      id: s.id,
      user_id: s.user_id,
      amount: s.amount,
      user: members.find((m) => m.id === s.user_id) || null,
    })),
  }));

  const sessionData: SessionData = {
    id: session.id,
    group_id: session.group_id,
    period_start: session.period_start,
    period_end: session.period_end,
    status: session.status,
    created_by: session.created_by,
    created_at: session.created_at,
    confirmed_at: session.confirmed_at,
    confirmed_by: session.confirmed_by,
    net_transfers: (session.net_transfers as SessionData["net_transfers"]) ?? null,
    is_zero_settlement: session.is_zero_settlement ?? false,
    payment_reported_at: session.payment_reported_at ?? null,
    payment_reported_by: session.payment_reported_by ?? null,
    settled_at: session.settled_at ?? null,
    settled_by: session.settled_by ?? null,
  };

  const filledEntries = entries.filter((e) => e.status === "filled");
  const totalAmount = filledEntries.reduce((sum, e) => sum + (e.actual_amount || 0), 0);
  const confirmer = session.confirmer as { display_name: string | null; email: string | null } | null;

  // 統合済み判定: settled + 非0円清算 + net_transfers が空
  const netTransfers = session.net_transfers as unknown[] | null;
  const isConsolidated = session.status === "settled"
    && !session.is_zero_settlement
    && (!netTransfers || netTransfers.length === 0);

  // このセッションに統合された旧セッション一覧を取得
  // 条件: 同グループ・このセッションより前に作成・非0円清算・net_transfers が空
  // status は settled または pending_payment（ゾンビとして残っている場合も含む）
  type ConsolidatedSessionInfo = {
    id: string;
    period_start: string;
    period_end: string;
    confirmed_at: string | null;
  };
  let consolidatedIntoThis: ConsolidatedSessionInfo[] = [];

  if (!isConsolidated && (session.status === "settled" || session.status === "pending_payment")) {
    const { data: mergedSessions } = await supabase
      .from("settlement_sessions")
      .select("id, period_start, period_end, confirmed_at, net_transfers, is_zero_settlement, status")
      .eq("group_id", groupId)
      .in("status", ["settled", "pending_payment"])
      .neq("id", sessionId)
      .lt("created_at", session.created_at)
      .order("created_at", { ascending: false });

    consolidatedIntoThis = (mergedSessions || [])
      .filter((s) => {
        const nt = s.net_transfers as unknown[] | null;
        // 統合済み = 非0円清算 かつ (net_transfers が空 または ゾンビ pending_payment)
        return !s.is_zero_settlement && (
          (!nt || nt.length === 0) ||
          s.status === "pending_payment"
        );
      })
      .map((s) => ({
        id: s.id,
        period_start: s.period_start,
        period_end: s.period_end,
        confirmed_at: s.confirmed_at,
      }));
  }

  // 統合先セッションのエントリも取得（内訳表示用）
  type ConsolidatedEntryInfo = {
    session_id: string;
    description: string;
    actual_amount: number | null;
    payer_id: string;
    payment_date: string;
    status: string;
    payer_display_name: string | null;
  };
  let consolidatedEntries: ConsolidatedEntryInfo[] = [];

  if (consolidatedIntoThis.length > 0) {
    const mergedIds = consolidatedIntoThis.map((s) => s.id);
    const { data: mergedEntries } = await supabase
      .from("settlement_entries")
      .select(`
        session_id,
        description,
        actual_amount,
        payer_id,
        payment_date,
        status,
        payer:profiles!payer_id (display_name)
      `)
      .in("session_id", mergedIds)
      .eq("status", "filled")
      .order("payment_date", { ascending: false });

    consolidatedEntries = (mergedEntries || []).map((e) => ({
      session_id: e.session_id,
      description: e.description,
      actual_amount: e.actual_amount,
      payer_id: e.payer_id,
      payment_date: e.payment_date,
      status: e.status,
      payer_display_name: (e.payer as { display_name: string | null } | null)?.display_name ?? null,
    }));
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Link
          href={`/groups/${groupId}/settlement/history`}
          className="text-sm text-theme-primary-text hover:text-theme-primary-text/80 mb-2 inline-block"
        >
          &larr; 清算履歴
        </Link>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-theme-headline">
            {session.period_start} 〜 {session.period_end}
          </h1>
          {session.status === "settled" && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-theme-text/15 text-theme-text">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
              清算完了
            </span>
          )}
          {session.status === "pending_payment" && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-theme-primary/15 text-theme-primary-text">
              支払い待ち
            </span>
          )}
        </div>
        <div className="mt-2 space-y-1 text-sm text-theme-muted">
          {session.confirmed_at && (
            <p>
              <span className="text-theme-muted/70">清算開始日:</span>{" "}
              {new Date(session.confirmed_at).toLocaleDateString("ja-JP")}
              {confirmer && (
                <span className="text-theme-muted">
                  （{confirmer.display_name || confirmer.email}）
                </span>
              )}
            </p>
          )}
          {session.status === "settled" && session.settled_at && (
            <p>
              <span className="text-theme-muted/70">受取完了日:</span>{" "}
              {new Date(session.settled_at).toLocaleDateString("ja-JP")}
            </p>
          )}
        </div>
      </div>

      {/* 統合済みバナー */}
      {isConsolidated && (
        <div className="bg-theme-muted/10 border border-theme-muted/20 rounded-lg p-4 mb-6">
          <p className="text-sm text-theme-text">
            この清算は後続の清算に統合されました。送金額は統合先の清算に含まれています。
          </p>
        </div>
      )}

      {/* Settlement Result */}
      <div className="mb-6">
        <SettlementResultCard
          session={sessionData}
          entries={entries}
          members={members}
          currentUserId={user.id}
        />
      </div>

      {/* Summary */}
      <div className="bg-theme-card-bg rounded-lg shadow p-4 mb-6">
        <div className="flex justify-between items-center">
          <span className="text-theme-muted">総支出</span>
          <span className="text-xl font-semibold text-theme-headline">{formatCurrency(totalAmount)}</span>
        </div>
        <div className="flex justify-between items-center mt-2 text-sm text-theme-muted">
          <span>支払い件数</span>
          <span>{filledEntries.length}件</span>
        </div>
      </div>

      {/* Entry List */}
      <div className="bg-theme-card-bg rounded-lg shadow">
        <h3 className="px-4 py-3 font-medium text-theme-headline border-b border-theme-card-border">
          含まれる支払い
        </h3>
        <ul className="divide-y divide-theme-card-border">
          {filledEntries.map((entry) => {
            const payerName =
              entry.payer?.display_name ||
              entry.payer?.email ||
              members.find((m) => m.id === entry.payer_id)?.display_name ||
              members.find((m) => m.id === entry.payer_id)?.email ||
              "Unknown";

            const hasSplits = entry.splits && entry.splits.length > 0;

            return (
              <li key={entry.id} className="px-4 py-3">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium text-theme-headline">{entry.description}</p>
                    <p className="text-sm text-theme-muted">
                      {payerName} ・ {entry.payment_date}
                      {entry.category && (
                        <span className="ml-2 text-xs bg-theme-bg px-1.5 py-0.5 rounded">
                          {entry.category.name}
                        </span>
                      )}
                      {entry.split_type === "custom" && (
                        <span className="ml-2 text-xs bg-theme-secondary/20 text-theme-text px-1.5 py-0.5 rounded">
                          カスタム分割
                        </span>
                      )}
                    </p>
                  </div>
                  <span className="font-medium text-theme-headline">
                    {formatCurrency(entry.actual_amount || 0)}
                  </span>
                </div>
                {/* Splits breakdown */}
                {hasSplits && (
                  <div className="mt-2 ml-2 space-y-1">
                    {entry.splits!.map((split) => {
                      const splitUserName =
                        split.user?.display_name ||
                        split.user?.email ||
                        members.find((m) => m.id === split.user_id)?.display_name ||
                        "Unknown";
                      return (
                        <div key={split.id} className="flex justify-between text-xs text-theme-muted">
                          <span>{splitUserName}</span>
                          <span>{formatCurrency(split.amount)}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {/* 統合済みセッションの内訳 */}
      {consolidatedIntoThis.length > 0 && (
        <div className="bg-theme-card-bg rounded-lg shadow mt-6">
          <h3 className="px-4 py-3 font-medium text-theme-headline border-b border-theme-card-border">
            統合された清算の支払い
            <span className="ml-2 text-xs font-normal text-theme-muted">
              {consolidatedIntoThis.length}件の清算を統合
            </span>
          </h3>
          {consolidatedIntoThis.map((mergedSession) => {
            const sessionEntries = consolidatedEntries.filter(
              (e) => e.session_id === mergedSession.id
            );
            const sessionTotal = sessionEntries.reduce(
              (sum, e) => sum + (e.actual_amount || 0),
              0
            );

            return (
              <div key={mergedSession.id}>
                <div className="px-4 py-2 bg-theme-bg/50 border-b border-theme-card-border flex justify-between items-center">
                  <span className="text-xs font-medium text-theme-muted">
                    {mergedSession.period_start} 〜 {mergedSession.period_end}
                  </span>
                  <span className="text-xs text-theme-muted">
                    {formatCurrency(sessionTotal)}（{sessionEntries.length}件）
                  </span>
                </div>
                <ul className="divide-y divide-theme-card-border">
                  {sessionEntries.map((entry, idx) => {
                    const payerName =
                      entry.payer_display_name ||
                      members.find((m) => m.id === entry.payer_id)?.display_name ||
                      members.find((m) => m.id === entry.payer_id)?.email ||
                      "Unknown";

                    return (
                      <li key={`${entry.session_id}-${idx}`} className="px-4 py-2">
                        <div className="flex justify-between items-center">
                          <div>
                            <p className="text-sm text-theme-headline">{entry.description}</p>
                            <p className="text-xs text-theme-muted">
                              {payerName} ・ {entry.payment_date}
                            </p>
                          </div>
                          <span className="text-sm text-theme-headline">
                            {formatCurrency(entry.actual_amount || 0)}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      {/* Back Links */}
      <div className="mt-8 flex justify-center gap-4 text-sm">
        <Link
          href={`/groups/${groupId}/settlement/history`}
          className="text-theme-muted hover:text-theme-text"
        >
          履歴に戻る
        </Link>
        <Link
          href={`/groups/${groupId}`}
          className="text-theme-muted hover:text-theme-text"
        >
          グループに戻る
        </Link>
      </div>
    </div>
  );
}
