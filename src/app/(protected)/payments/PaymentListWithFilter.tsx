"use client";

import { useState } from "react";
import Link from "next/link";
import { t } from "@/lib/i18n";
import { formatCurrency } from "@/lib/format/currency";
import { formatDateHeader, groupPaymentsByDate, groupPaymentsByMonth } from "@/lib/format/date-group";
import { PaymentRow } from "@/components/payment-list/PaymentRow";
import type { PaymentWithRelations } from "@/types/query-results";

type PaymentListWithFilterProps = {
  payments: PaymentWithRelations[];
  groups: { id: string; name: string }[];
  userId: string;
};

export default function PaymentListWithFilter({
  payments,
  groups,
  userId,
}: PaymentListWithFilterProps) {
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  const filteredPayments = selectedGroupId
    ? payments.filter((p) => p.group_id === selectedGroupId)
    : payments;

  const { months, byMonth: paymentsByMonth } = groupPaymentsByMonth(filteredPayments);

  return (
    <>
      {/* Group filter chips */}
      {groups.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 mb-6">
          <button
            type="button"
            onClick={() => setSelectedGroupId(null)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
              selectedGroupId === null
                ? "bg-theme-primary text-theme-button-text"
                : "bg-theme-bg text-theme-muted hover:bg-theme-card-border"
            }`}
          >
            {t("payments.filter.all")}
          </button>
          {groups.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => setSelectedGroupId(g.id)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                selectedGroupId === g.id
                  ? "bg-theme-primary text-theme-button-text"
                  : "bg-theme-bg text-theme-muted hover:bg-theme-card-border"
              }`}
            >
              {g.name}
            </button>
          ))}
        </div>
      )}

      {/* Payment list */}
      {filteredPayments.length > 0 ? (
        <div className="space-y-6">
          {months.map((month) => {
            const monthPayments = paymentsByMonth[month] || [];
            const monthTotal = monthPayments.reduce(
              (sum, p) => sum + Number(p.amount),
              0
            );

            const monthDate = new Date(month + "-01");
            const monthName = monthDate.toLocaleDateString("ja-JP", {
              year: "numeric",
              month: "long",
            });

            const dateGroups = groupPaymentsByDate(monthPayments);

            return (
              <div
                key={month}
                className="bg-theme-card-bg rounded-lg border border-theme-card-border overflow-hidden"
              >
                <div className="px-4 py-3 border-b border-theme-card-border flex justify-between items-center">
                  <h2 className="font-medium text-theme-headline">
                    {monthName}
                  </h2>
                  <span className="text-sm font-medium text-theme-muted">
                    {t("common.total")}: {formatCurrency(monthTotal)}
                  </span>
                </div>
                {dateGroups.map((group, dateIdx) => (
                  <div
                    key={group.date}
                    className={
                      dateIdx > 0
                        ? "border-t border-theme-card-border"
                        : ""
                    }
                  >
                    <div className="px-4 py-1.5 text-xs font-semibold text-theme-text bg-theme-bg">
                      {formatDateHeader(group.date)}
                    </div>
                    <div className="divide-y divide-dashed divide-theme-card-border/60">
                      {group.payments.map((payment) => (
                        <PaymentRow
                          key={`${payment.id}-${payment.updated_at}`}
                          payment={payment}
                          userId={userId}
                          showCategoryBadge
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-theme-card-bg rounded-lg border border-theme-card-border p-6 text-center">
          <p className="text-theme-text mb-4">{t("payments.noPayments")}</p>
          <Link
            href="/payments/new"
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-theme-button-text bg-theme-primary hover:bg-theme-primary/80"
          >
            {t("payments.addFirstPayment")}
          </Link>
        </div>
      )}
    </>
  );
}
