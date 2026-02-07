import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { t } from "@/lib/i18n";
import Link from "next/link";
import type { Category, Profile } from "@/types/database";
import RecurringRuleList from "./RecurringRuleList";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function RecurringRulesPage({ params }: PageProps) {
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

  // 固定費ルールを取得
  const { data: rules } = await supabase
    .from("recurring_rules")
    .select(`
      *,
      category:categories(id, name, icon, color),
      default_payer:profiles!recurring_rules_default_payer_id_fkey(id, display_name, email),
      splits:recurring_rule_splits(
        id,
        user_id,
        amount,
        percentage,
        user:profiles(id, display_name, email)
      )
    `)
    .eq("group_id", groupId)
    .order("day_of_month", { ascending: true })
    .order("description", { ascending: true });

  const isOwner = membership.role === "owner" || group.owner_id === user.id;

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Link
          href={`/groups/${groupId}`}
          className="text-sm text-theme-primary hover:text-theme-primary/80 mb-2 inline-block"
        >
          &larr; {group.name}
        </Link>
        <h1 className="text-2xl font-bold text-theme-headline">
          {t("recurringRules.title")}
        </h1>
        <p className="text-sm text-theme-muted mt-1">
          {t("recurringRules.subtitle")}
        </p>
      </div>

      {/* Rule List */}
      <RecurringRuleList
        groupId={groupId}
        rules={rules || []}
        members={members}
        categories={(categories as Category[]) || []}
        currentUserId={user.id}
        isOwner={isOwner}
      />
    </div>
  );
}
