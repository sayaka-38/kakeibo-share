import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { t } from "@/lib/i18n";
import { FullPaymentForm } from "@/components/payment-form";
import type { EditPaymentData } from "@/components/payment-form";
import { isProxySplit, isCustomSplit, getProxyBeneficiaryId } from "@/lib/calculation/split";
import type { Profile, Group, Category } from "@/types/database";
import type {
  GroupMembershipWithGroupResult,
  MemberWithProfileResult,
} from "@/types/query-results";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditPaymentPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // 支払いデータを取得（splits 含む）
  const { data: payment } = await supabase
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
      settlement_id,
      payment_splits (
        user_id,
        amount
      )
    `
    )
    .eq("id", id)
    .single();

  // 支払いが存在しない or 本人でない or 清算済みの場合はリダイレクト
  if (!payment || payment.payer_id !== user.id || payment.settlement_id) {
    redirect("/payments");
  }

  // グループ情報を取得
  const { data: groupMemberships } = (await supabase
    .from("group_members")
    .select(
      `
      group_id,
      groups (*)
    `
    )
    .eq("user_id", user.id)
    .order("created_at", { referencedTable: "groups", ascending: true })) as {
    data: GroupMembershipWithGroupResult<Group>[] | null;
  };

  const groups =
    groupMemberships
      ?.map((m) => m.groups)
      .filter((g): g is NonNullable<typeof g> => g !== null) || [];

  // カテゴリを取得
  const groupIds = groups.map((g) => g.id);
  const { data: categories } = (await supabase
    .from("categories")
    .select("*")
    .or(
      groupIds.length > 0
        ? `is_default.eq.true,group_id.in.(${groupIds.join(",")})`
        : "is_default.eq.true"
    )) as { data: Category[] | null };

  // メンバーを取得
  const members: { [groupId: string]: Profile[] } = {};
  for (const group of groups) {
    const { data: groupMembers } = (await supabase
      .from("group_members")
      .select(
        `
        profiles (*)
      `
      )
      .eq("group_id", group.id)) as {
      data: MemberWithProfileResult<Profile>[] | null;
    };

    members[group.id] =
      groupMembers
        ?.map((m) => m.profiles)
        .filter((p): p is NonNullable<typeof p> => p !== null) || [];
  }

  // splitType を判定
  const splits = payment.payment_splits || [];
  const totalAmount = Number(payment.amount);
  let splitType: "equal" | "custom" | "proxy" = "equal";
  let proxyBeneficiaryId: string | null = null;

  if (isProxySplit(splits, payment.payer_id)) {
    splitType = "proxy";
    proxyBeneficiaryId = getProxyBeneficiaryId(splits, payment.payer_id);
  } else if (isCustomSplit(splits, payment.payer_id, totalAmount)) {
    splitType = "custom";
  }

  // カスタム割り勘の初期値
  const customSplits: { [userId: string]: string } = {};
  for (const split of splits) {
    customSplits[split.user_id] = String(split.amount);
  }

  const editData: EditPaymentData = {
    paymentId: payment.id,
    groupId: payment.group_id,
    amount: totalAmount,
    description: payment.description,
    categoryId: payment.category_id,
    paymentDate: payment.payment_date,
    splitType,
    proxyBeneficiaryId,
    customSplits,
  };

  return (
    <div className="max-w-lg mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Link
          href="/payments"
          className="text-theme-muted hover:text-theme-text"
          aria-label={t("common.back")}
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </Link>
        <h1 className="text-2xl font-bold text-theme-headline">
          {t("payments.editPayment")}
        </h1>
      </div>

      <div className="bg-theme-card-bg rounded-lg shadow p-6">
        <FullPaymentForm
          groups={groups}
          categories={categories || []}
          members={members}
          currentUserId={user.id}
          editData={editData}
        />
      </div>
    </div>
  );
}
