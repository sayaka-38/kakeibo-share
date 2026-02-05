import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { formatCurrency } from "@/lib/format/currency";
import type { Profile, Category } from "@/types/database";
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

  if (!session || session.status !== "confirmed") {
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
    .order("payment_date", { ascending: true });

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
    payer: e.payer as { id: string; display_name: string | null; email: string } | null,
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
  };

  const filledEntries = entries.filter((e) => e.status === "filled");
  const totalAmount = filledEntries.reduce((sum, e) => sum + (e.actual_amount || 0), 0);
  const confirmer = session.confirmer as { display_name: string | null; email: string } | null;

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Link
          href={`/groups/${groupId}/settlement/history`}
          className="text-sm text-blue-600 hover:text-blue-800 mb-2 inline-block"
        >
          &larr; 清算履歴
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">
          {session.period_start} 〜 {session.period_end}
        </h1>
        <p className="text-sm text-gray-600 mt-1">
          {session.confirmed_at && new Date(session.confirmed_at).toLocaleDateString("ja-JP")} 確定
          {confirmer && (
            <span className="text-gray-500">
              （{confirmer.display_name || confirmer.email}）
            </span>
          )}
        </p>
      </div>

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
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="flex justify-between items-center">
          <span className="text-gray-600">総支出</span>
          <span className="text-xl font-semibold">{formatCurrency(totalAmount)}</span>
        </div>
        <div className="flex justify-between items-center mt-2 text-sm text-gray-500">
          <span>支払い件数</span>
          <span>{filledEntries.length}件</span>
        </div>
      </div>

      {/* Entry List */}
      <div className="bg-white rounded-lg shadow">
        <h3 className="px-4 py-3 font-medium text-gray-900 border-b">
          含まれる支払い
        </h3>
        <ul className="divide-y divide-gray-200">
          {filledEntries.map((entry) => {
            const payerName =
              entry.payer?.display_name ||
              entry.payer?.email ||
              members.find((m) => m.id === entry.payer_id)?.display_name ||
              members.find((m) => m.id === entry.payer_id)?.email ||
              "Unknown";

            return (
              <li key={entry.id} className="px-4 py-3">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium text-gray-900">{entry.description}</p>
                    <p className="text-sm text-gray-500">
                      {payerName} ・ {entry.payment_date}
                      {entry.category && (
                        <span className="ml-2 text-xs bg-gray-100 px-1.5 py-0.5 rounded">
                          {entry.category.name}
                        </span>
                      )}
                    </p>
                  </div>
                  <span className="font-medium text-gray-900">
                    {formatCurrency(entry.actual_amount || 0)}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Back Links */}
      <div className="mt-8 flex justify-center gap-4 text-sm">
        <Link
          href={`/groups/${groupId}/settlement/history`}
          className="text-gray-500 hover:text-gray-700"
        >
          履歴に戻る
        </Link>
        <Link
          href={`/groups/${groupId}`}
          className="text-gray-500 hover:text-gray-700"
        >
          グループに戻る
        </Link>
      </div>
    </div>
  );
}
