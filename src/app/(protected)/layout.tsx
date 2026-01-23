import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Header from "@/components/Header";
import Navigation from "@/components/Navigation";
import { DemoBanner } from "@/components/demo/DemoBanner";

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

  type ProfileResult = {
    id: string;
    email: string;
    display_name: string | null;
    avatar_url: string | null;
    created_at: string;
    updated_at: string;
  };

  const { data: profile } = (await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single()) as { data: ProfileResult | null };

  // デモユーザーかどうかを判定（メールアドレスのドメインで判定）
  const isDemo = profile?.email?.endsWith("@demo.kakeibo.local") ?? false;

  // デモセッションの有効期限を取得（将来的にdemo_sessionsテーブルから取得）
  // 現時点では24時間後を仮定
  const demoExpiresAt = isDemo ? new Date(Date.now() + 24 * 60 * 60 * 1000) : undefined;

  return (
    <div className="min-h-screen bg-gray-50">
      <DemoBanner isDemo={isDemo} expiresAt={demoExpiresAt} />
      <Header user={profile} />
      <div className="flex flex-col md:flex-row">
        <Navigation />
        <main className="flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
