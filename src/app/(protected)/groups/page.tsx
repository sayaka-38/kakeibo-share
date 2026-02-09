import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { t } from "@/lib/i18n";
import type { GroupMembershipFullResult } from "@/types/query-results";

export default async function GroupsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Get user's groups with member count
  const { data: groupMemberships } = await supabase
    .from("group_members")
    .select(
      `
      group_id,
      role,
      groups (
        id,
        name,
        description,
        created_at
      )
    `
    )
    .eq("user_id", user?.id || "");

  const typedMemberships = groupMemberships as GroupMembershipFullResult[] | null;
  const groups = typedMemberships?.filter((m) => m.groups !== null) || [];

  // Get member count for each group
  const groupsWithCounts = await Promise.all(
    groups.map(async (membership) => {
      const { count } = await supabase
        .from("group_members")
        .select("*", { count: "exact", head: true })
        .eq("group_id", membership.group_id);

      return {
        ...membership.groups!,
        role: membership.role,
        memberCount: count || 0,
      };
    })
  );

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-theme-headline">{t("groups.title")}</h1>
        <Link
          href="/groups/new"
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-theme-button-text bg-theme-primary hover:bg-theme-primary/80"
        >
          {t("groups.createGroup")}
        </Link>
      </div>

      {groupsWithCounts.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          {groupsWithCounts.map((group) => (
            <Link
              key={group.id}
              href={`/groups/${group.id}`}
              className="block bg-theme-card-bg rounded-lg shadow p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="font-medium text-theme-headline">{group.name}</h2>
                  {group.description && (
                    <p className="text-sm text-theme-text mt-1">
                      {group.description}
                    </p>
                  )}
                </div>
                {group.role === "owner" && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-theme-primary/15 text-theme-primary-text">
                    {t("common.owner")}
                  </span>
                )}
              </div>
              <div className="mt-4 flex items-center text-sm text-theme-text">
                <svg
                  className="w-4 h-4 mr-1"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
                  />
                </svg>
                {t("groups.memberCount", { count: group.memberCount })}
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="bg-theme-card-bg rounded-lg shadow p-6 text-center">
          <p className="text-theme-text mb-4">{t("groups.noGroups")}</p>
          <Link
            href="/groups/new"
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-theme-button-text bg-theme-primary hover:bg-theme-primary/80"
          >
            {t("groups.createFirstGroup")}
          </Link>
        </div>
      )}
    </div>
  );
}
