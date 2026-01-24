import { createClient } from "@/lib/supabase/server";
import { t } from "@/lib/i18n";
import PaymentForm from "@/components/PaymentForm";
import type { Profile, Group, Category } from "@/types/database";
import type {
  GroupMembershipWithGroupResult,
  MemberWithProfileResult,
} from "@/types/query-results";

export default async function NewPaymentPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Get user's groups
  const { data: groupMemberships } = (await supabase
    .from("group_members")
    .select(
      `
      group_id,
      groups (*)
    `
    )
    .eq("user_id", user?.id || "")) as { data: GroupMembershipWithGroupResult<Group>[] | null };

  const groups =
    groupMemberships
      ?.map((m) => m.groups)
      .filter((g): g is NonNullable<typeof g> => g !== null) || [];

  // Get categories
  const groupIds = groups.map((g) => g.id);
  const { data: categories } = (await supabase
    .from("categories")
    .select("*")
    .or(
      groupIds.length > 0
        ? `is_default.eq.true,group_id.in.(${groupIds.join(",")})`
        : "is_default.eq.true"
    )) as { data: Category[] | null };

  // Get members for each group
  const members: { [groupId: string]: Profile[] } = {};

  for (const group of groups) {
    const { data: groupMembers } = (await supabase
      .from("group_members")
      .select(
        `
        profiles (*)
      `
      )
      .eq("group_id", group.id)) as { data: MemberWithProfileResult<Profile>[] | null };

    members[group.id] =
      groupMembers
        ?.map((m) => m.profiles)
        .filter((p): p is NonNullable<typeof p> => p !== null) || [];
  }

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        {t("payments.addPayment")}
      </h1>

      <div className="bg-white rounded-lg shadow p-6">
        <PaymentForm
          groups={groups}
          categories={categories || []}
          members={members}
          currentUserId={user?.id || ""}
        />
      </div>
    </div>
  );
}
