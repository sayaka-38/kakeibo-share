/**
 * 清算エントリ生成 (TypeScript版)
 *
 * 既存の generate_settlement_entries RPC と同等の処理を TS で実装。
 * interval_months 対応のスケジュール計算を含む。
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { computeRuleDatesInPeriod } from "./recurring-schedule";

/**
 * 清算セッションにエントリを生成
 *
 * Part 1: アクティブな recurring_rules から、期間内の発生日ごとにエントリ作成
 * Part 2: 未清算の既存支払いをエントリとして取り込み
 *
 * @returns 生成されたエントリ数（負の値はエラーコード）
 */
export async function generateSettlementEntries(
  supabase: SupabaseClient<Database>,
  sessionId: string,
  groupId: string,
  periodStart: string,
  periodEnd: string,
  userId: string
): Promise<number> {
  // メンバーシップ確認
  const { data: membership } = await supabase
    .from("group_members")
    .select("id")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .single();

  if (!membership) return -2;

  // セッション取得 & draft確認
  const { data: session } = await supabase
    .from("settlement_sessions")
    .select("id, status")
    .eq("id", sessionId)
    .single();

  if (!session) return -1;
  if (session.status !== "draft") return -3;

  // 既存エントリを削除（再生成のため）
  await supabase.from("settlement_entries").delete().eq("session_id", sessionId);

  let entryCount = 0;

  // =========================================================================
  // Part 1: 固定費ルールからエントリを生成
  // =========================================================================
  const { data: rules } = await supabase
    .from("recurring_rules")
    .select(
      `*, splits:recurring_rule_splits(id, user_id, amount, percentage)`
    )
    .eq("group_id", groupId)
    .eq("is_active", true);

  if (rules) {
    for (const rule of rules) {
      const dates = computeRuleDatesInPeriod(
        {
          created_at: rule.created_at,
          interval_months: rule.interval_months,
          day_of_month: rule.day_of_month,
        },
        periodStart,
        periodEnd
      );

      for (const date of dates) {
        const paymentDate = formatDateLocal(date);

        const { data: entry } = await supabase
          .from("settlement_entries")
          .insert({
            session_id: sessionId,
            rule_id: rule.id,
            description: rule.description,
            category_id: rule.category_id,
            expected_amount: rule.default_amount,
            payer_id: rule.default_payer_id,
            payment_date: paymentDate,
            status: "pending",
            split_type: rule.split_type,
            entry_type: "rule",
          })
          .select("id")
          .single();

        if (entry) {
          entryCount++;

          // カスタム分割設定をコピー
          if (
            rule.split_type === "custom" &&
            rule.splits &&
            rule.splits.length > 0
          ) {
            const splitsToInsert = rule.splits.map(
              (s: {
                user_id: string;
                amount: number | null;
                percentage: number | null;
              }) => ({
                entry_id: entry.id,
                user_id: s.user_id,
                amount:
                  s.amount ??
                  Math.floor(
                    ((rule.default_amount ?? 0) * (s.percentage ?? 0)) / 100
                  ),
              })
            );

            await supabase
              .from("settlement_entry_splits")
              .insert(splitsToInsert);
          }
        }
      }
    }
  }

  // =========================================================================
  // Part 2: 未清算の既存支払いを取り込み
  // =========================================================================
  const { data: payments } = await supabase
    .from("payments")
    .select(`*, payment_splits(user_id, amount)`)
    .eq("group_id", groupId)
    .is("settlement_id", null)
    .lte("payment_date", periodEnd);

  if (payments) {
    for (const payment of payments) {
      const hasSplits =
        payment.payment_splits && payment.payment_splits.length > 0;

      const { data: entry } = await supabase
        .from("settlement_entries")
        .insert({
          session_id: sessionId,
          description: payment.description,
          category_id: payment.category_id,
          expected_amount: payment.amount,
          actual_amount: payment.amount,
          payer_id: payment.payer_id,
          payment_date: payment.payment_date,
          status: "filled",
          split_type: hasSplits ? "custom" : "equal",
          entry_type: "existing",
          source_payment_id: payment.id,
          filled_by: payment.payer_id,
          filled_at: payment.created_at,
        })
        .select("id")
        .single();

      if (entry) {
        entryCount++;

        // 既存の payment_splits をコピー
        if (hasSplits) {
          const splitsToInsert = payment.payment_splits.map(
            (s: { user_id: string; amount: number }) => ({
              entry_id: entry.id,
              user_id: s.user_id,
              amount: s.amount,
            })
          );

          await supabase
            .from("settlement_entry_splits")
            .insert(splitsToInsert);
        }
      }
    }
  }

  return entryCount;
}

/** ローカルタイムゾーンで YYYY-MM-DD 文字列に変換 */
function formatDateLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
