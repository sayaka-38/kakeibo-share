import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { formatCurrency } from "@/lib/format/currency";
type PageProps = {
  params: Promise<{ id: string }>;
};

type ConfirmedSession = {
  id: string;
  period_start: string;
  period_end: string;
  status: string;
  confirmed_at: string;
  confirmed_by: string;
  confirmer?: { display_name: string | null; email: string } | null;
  total_amount: number;
  entry_count: number;
};

export default async function SettlementHistoryPage({ params }: PageProps) {
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

  // 確定済みセッションを取得（confirmed, pending_payment, settled を含む）
  const { data: sessions } = await supabase
    .from("settlement_sessions")
    .select(`
      id,
      status,
      period_start,
      period_end,
      confirmed_at,
      confirmed_by,
      profiles:profiles!confirmed_by (display_name, email)
    `)
    .eq("group_id", groupId)
    .in("status", ["confirmed", "pending_payment", "settled"])
    .order("confirmed_at", { ascending: false });

  // 各セッションのエントリ統計を取得
  const sessionsWithStats: ConfirmedSession[] = await Promise.all(
    (sessions || []).map(async (session) => {
      const { data: entries } = await supabase
        .from("settlement_entries")
        .select("actual_amount")
        .eq("session_id", session.id)
        .eq("status", "filled");

      const totalAmount = (entries || []).reduce(
        (sum, e) => sum + (e.actual_amount || 0),
        0
      );

      return {
        id: session.id,
        period_start: session.period_start,
        period_end: session.period_end,
        status: session.status,
        confirmed_at: session.confirmed_at || "",
        confirmed_by: session.confirmed_by || "",
        confirmer: session.profiles as { display_name: string | null; email: string } | null,
        total_amount: totalAmount,
        entry_count: (entries || []).length,
      };
    })
  );

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Link
          href={`/groups/${groupId}/settlement`}
          className="text-sm text-theme-primary hover:text-theme-primary/80 mb-2 inline-block"
        >
          &larr; 清算準備室
        </Link>
        <h1 className="text-2xl font-bold text-theme-headline">清算履歴</h1>
        <p className="text-sm text-theme-muted mt-1">
          過去に確定した清算の一覧
        </p>
      </div>

      {/* Session List */}
      {sessionsWithStats.length === 0 ? (
        <div className="bg-theme-card-bg rounded-lg shadow p-8 text-center">
          <p className="text-theme-muted">まだ確定した清算がありません</p>
          <Link
            href={`/groups/${groupId}/settlement`}
            className="mt-4 inline-block text-theme-primary hover:text-theme-primary/80"
          >
            清算を開始する
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {sessionsWithStats.map((session) => (
            <Link
              key={session.id}
              href={`/groups/${groupId}/settlement/history/${session.id}`}
              className="block bg-theme-card-bg rounded-lg shadow p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-theme-headline">
                      {session.period_start} 〜 {session.period_end}
                    </h3>
                    {session.status === "pending_payment" && (
                      <span className="text-xs bg-theme-primary/15 text-theme-primary px-1.5 py-0.5 rounded">
                        支払い待ち
                      </span>
                    )}
                    {session.status === "settled" && (
                      <span className="text-xs bg-theme-text/15 text-theme-text px-1.5 py-0.5 rounded">
                        完了
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-theme-muted mt-1">
                    {session.entry_count}件の支払い
                  </p>
                  <p className="text-xs text-theme-muted/70 mt-1">
                    {new Date(session.confirmed_at).toLocaleDateString("ja-JP")} 確定
                    {session.confirmer && (
                      <span>
                        （{session.confirmer.display_name || session.confirmer.email}）
                      </span>
                    )}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold text-theme-headline">
                    {formatCurrency(session.total_amount)}
                  </p>
                  <p className="text-xs text-theme-muted">総支出</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Back to Group */}
      <div className="mt-8 text-center">
        <Link
          href={`/groups/${groupId}`}
          className="text-sm text-theme-muted hover:text-theme-text"
        >
          グループに戻る
        </Link>
      </div>
    </div>
  );
}
