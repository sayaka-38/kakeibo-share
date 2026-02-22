import { createClient } from "@/lib/supabase/server";
import { t } from "@/lib/i18n";
import PaymentForm from "@/components/PaymentForm";
import type { DuplicatePaymentData } from "@/components/payment-form";
import { isProxySplit, isCustomSplit, getProxyBeneficiaryId } from "@/lib/calculation/split";
import type { Profile, Group, Category } from "@/types/database";
import type {
  GroupMembershipWithGroupResult,
  MemberWithProfileResult,
} from "@/types/query-results";

type PageProps = {
  searchParams: Promise<{ copyFrom?: string }>;
};

export default async function NewPaymentPage({ searchParams }: PageProps) {
  const { copyFrom } = await searchParams;
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
    .eq("user_id", user?.id || "")
    .order("created_at", { referencedTable: "groups", ascending: true })) as { data: GroupMembershipWithGroupResult<Group>[] | null };

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

  // Get members for all groups in a single query
  const members: { [groupId: string]: Profile[] } = {};

  if (groupIds.length > 0) {
    const { data: allGroupMembers } = (await supabase
      .from("group_members")
      .select(
        `
        group_id,
        profiles (*)
      `
      )
      .in("group_id", groupIds)) as { data: (MemberWithProfileResult<Profile> & { group_id: string })[] | null };

    for (const gm of allGroupMembers || []) {
      if (gm.profiles) {
        if (!members[gm.group_id]) members[gm.group_id] = [];
        members[gm.group_id].push(gm.profiles);
      }
    }
  }

  // 複製元の支払いデータを取得
  let duplicateData: DuplicatePaymentData | undefined;
  if (copyFrom) {
    const { data: sourcePayment } = await supabase
      .from("payments")
      .select(
        `
        id,
        group_id,
        payer_id,
        amount,
        description,
        category_id,
        payment_date,
        payment_splits (
          user_id,
          amount
        )
      `
      )
      .eq("id", copyFrom)
      .single();

    if (sourcePayment) {
      const splits = sourcePayment.payment_splits || [];
      const totalAmount = Number(sourcePayment.amount);
      let splitType: "equal" | "custom" | "proxy" = "equal";
      let proxyBeneficiaryId: string | null = null;

      if (isProxySplit(splits, sourcePayment.payer_id)) {
        splitType = "proxy";
        proxyBeneficiaryId = getProxyBeneficiaryId(splits, sourcePayment.payer_id);
      } else if (isCustomSplit(splits, sourcePayment.payer_id, totalAmount)) {
        splitType = "custom";
      }

      const customSplits: { [userId: string]: string } = {};
      for (const split of splits) {
        customSplits[split.user_id] = String(split.amount);
      }

      duplicateData = {
        groupId: sourcePayment.group_id,
        amount: totalAmount,
        description: sourcePayment.description,
        categoryId: sourcePayment.category_id,
        paymentDate: sourcePayment.payment_date,
        splitType,
        proxyBeneficiaryId,
        customSplits,
      };
    }
  }

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl font-bold text-theme-headline mb-6">
        {t("payments.addPayment")}
      </h1>

      <div className="bg-theme-card-bg rounded-lg shadow p-6">
        <PaymentForm
          groups={groups}
          categories={categories || []}
          members={members}
          currentUserId={user?.id || ""}
          duplicateData={duplicateData}
        />
      </div>
    </div>
  );
}
