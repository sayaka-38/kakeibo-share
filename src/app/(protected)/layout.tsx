import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Header from "@/components/Header";
import Navigation from "@/components/Navigation";
import { DemoBanner } from "@/components/demo/DemoBanner";
import type { Profile } from "@/types/database";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = (await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single()) as { data: Profile | null };

  // デモユーザーかどうかを判定（is_demoフラグで判定）
  const isDemo = profile?.is_demo ?? false;

  // デモセッションの有効期限を demo_sessions テーブルから取得
  let demoExpiresAt: Date | undefined;
  if (isDemo) {
    const { data: demoSession } = await supabase
      .from("demo_sessions")
      .select("expires_at")
      .eq("user_id", user.id)
      .single();

    if (demoSession?.expires_at) {
      demoExpiresAt = new Date(demoSession.expires_at);
    }
  }

  return (
    <div className="min-h-screen bg-theme-bg">
      <DemoBanner isDemo={isDemo} expiresAt={demoExpiresAt} />
      <Header user={profile} />
      <div className="flex flex-col md:flex-row">
        <Navigation />
        <main className="flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
