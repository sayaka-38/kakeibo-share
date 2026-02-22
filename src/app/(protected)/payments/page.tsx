import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { t } from "@/lib/i18n";
import PaymentListWithFilter from "./PaymentListWithFilter";
import type { PaymentWithRelations } from "@/types/query-results";

export default async function PaymentsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Get user's groups (with name for filter)
  const { data: groupMemberships } = (await supabase
    .from("group_members")
    .select("group_id, groups(id, name)")
    .eq("user_id", user?.id || "")) as {
    data: { group_id: string; groups: { id: string; name: string } | null }[] | null;
  };

  const groupIds = groupMemberships?.map((m) => m.group_id) || [];
  const groups = groupMemberships
    ?.map((m) => m.groups)
    .filter((g): g is { id: string; name: string } => g !== null) || [];

  // Get payments from user's groups
  const { data: payments } = groupIds.length
    ? ((await supabase
        .from("payments")
        .select(
          `
        *,
        profiles (
          display_name,
          email
        ),
        categories (
          name,
          icon,
          color
        ),
        groups (
          name
        ),
        payment_splits (
          user_id,
          amount,
          profiles (
            display_name,
            email
          )
        )
      `
        )
        .in("group_id", groupIds)
        .order("payment_date", { ascending: false })
        .order("created_at", { ascending: false })) as {
        data: PaymentWithRelations[] | null;
      })
    : { data: [] as PaymentWithRelations[] };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-theme-headline">{t("payments.title")}</h1>
        <Link
          href="/payments/new"
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-theme-button-text bg-theme-primary hover:bg-theme-primary/80"
        >
          {t("payments.addPayment")}
        </Link>
      </div>

      <PaymentListWithFilter
        payments={payments || []}
        groups={groups}
        userId={user?.id || ""}
      />
    </div>
  );
}
