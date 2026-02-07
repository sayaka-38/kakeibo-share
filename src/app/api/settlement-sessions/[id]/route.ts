import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api/authenticate";

type RouteParams = { params: Promise<{ id: string }> };

// =============================================================================
// GET /api/settlement-sessions/[id]
// 清算セッションの詳細（エントリ一覧含む）を取得
// =============================================================================
export async function GET(request: NextRequest, { params }: RouteParams) {
  const auth = await authenticateRequest();
  if (!auth.success) return auth.response;
  const { user, supabase } = auth;

  const { id } = await params;

  // セッションを取得
  const { data: session, error } = await supabase
    .from("settlement_sessions")
    .select(`
      *,
      created_by_user:profiles!settlement_sessions_created_by_fkey(id, display_name, email),
      confirmed_by_user:profiles!settlement_sessions_confirmed_by_fkey(id, display_name, email)
    `)
    .eq("id", id)
    .single();

  if (error || !session) {
    return NextResponse.json(
      { error: "Settlement session not found" },
      { status: 404 }
    );
  }

  // メンバーシップ確認
  const { data: membership } = await supabase
    .from("group_members")
    .select("id")
    .eq("group_id", session.group_id)
    .eq("user_id", user.id)
    .single();

  if (!membership) {
    return NextResponse.json(
      { error: "You are not a member of this group" },
      { status: 403 }
    );
  }

  // エントリ一覧を取得
  const { data: entries, error: entriesError } = await supabase
    .from("settlement_entries")
    .select(`
      *,
      category:categories(id, name, icon, color),
      payer:profiles!settlement_entries_payer_id_fkey(id, display_name, email),
      filled_by_user:profiles!settlement_entries_filled_by_fkey(id, display_name, email),
      rule:recurring_rules(id, description),
      splits:settlement_entry_splits(
        id,
        user_id,
        amount,
        user:profiles(id, display_name, email)
      )
    `)
    .eq("session_id", id)
    .order("created_at", { ascending: false });

  if (entriesError) {
    console.error("Failed to fetch settlement entries:", entriesError);
    return NextResponse.json(
      { error: "Failed to fetch settlement entries" },
      { status: 500 }
    );
  }

  // 統計情報を計算
  const stats = {
    total: entries?.length ?? 0,
    pending: entries?.filter((e) => e.status === "pending").length ?? 0,
    filled: entries?.filter((e) => e.status === "filled").length ?? 0,
    skipped: entries?.filter((e) => e.status === "skipped").length ?? 0,
    totalAmount: entries
      ?.filter((e) => e.status === "filled")
      .reduce((sum, e) => sum + (e.actual_amount ?? 0), 0) ?? 0,
  };

  return NextResponse.json({ session, entries, stats });
}

// =============================================================================
// DELETE /api/settlement-sessions/[id]
// 清算セッションを削除（draftのみ、作成者のみ）
// =============================================================================
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const auth = await authenticateRequest();
  if (!auth.success) return auth.response;
  const { user, supabase } = auth;

  const { id } = await params;

  // セッションを取得
  const { data: session, error: fetchError } = await supabase
    .from("settlement_sessions")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchError || !session) {
    return NextResponse.json(
      { error: "Settlement session not found" },
      { status: 404 }
    );
  }

  // 作成者確認
  if (session.created_by !== user.id) {
    return NextResponse.json(
      { error: "Only the creator can delete this session" },
      { status: 403 }
    );
  }

  // draft状態確認
  if (session.status !== "draft") {
    return NextResponse.json(
      { error: "Only draft sessions can be deleted" },
      { status: 400 }
    );
  }

  // セッションを削除（CASCADEでentriesも削除される）
  const { error } = await supabase
    .from("settlement_sessions")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Failed to delete settlement session:", error);
    return NextResponse.json(
      { error: "Failed to delete settlement session" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
