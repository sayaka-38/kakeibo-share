/**
 * 清算エントリ スマート再計算 (Smart Refresh)
 *
 * 既存エントリを壊さず、最新の支払い・ルール情報で差分更新する。
 *
 * - filled / skipped エントリ → 常に保持（ユーザー入力を守る）
 * - pending ルールエントリ    → 最新ルール設定で内容を同期
 * - pending 不要エントリ       → ルールが削除/無効化なら削除
 * - 新規支払い                → 未取込なら追加
 * - 新規ルール日付            → 未取込なら追加
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { computeRuleDatesInPeriod } from "./recurring-schedule";

type Supabase = SupabaseClient<Database>;

// ---- 型推論のためのクエリ戻り値 ----
type RuleQueryResult = NonNullable<
  Awaited<
    ReturnType<
      ReturnType<Supabase["from"]>["select"]
    >
  >["data"]
>[number] & {
  splits: { user_id: string; amount: number | null; percentage: number | null }[];
};

type EntryQueryResult = {
  id: string;
  rule_id: string | null;
  source_payment_id: string | null;
  payment_date: string;
  status: string;
  description: string;
  expected_amount: number | null;
  payer_id: string | null;
  category_id: string | null;
};

type PaymentQueryResult = {
  id: string;
  description: string | null;
  category_id: string | null;
  amount: number;
  payer_id: string;
  payment_date: string;
  created_at: string;
  payment_splits: { user_id: string; amount: number }[];
};

/**
 * payment_splits のデータから split_type を推定する。
 *
 * - splits が空 → equal
 * - いずれかの金額が 0 → custom（全額負担の代理払いなど）
 * - 最大金額と最小金額の差が 1 超 → custom（意図的な比率設定）
 * - それ以外（1円以内のゆらぎ） → equal（均等割りの端数処理）
 */
function detectSplitType(
  splits: { user_id: string; amount: number }[]
): "equal" | "custom" {
  if (splits.length === 0) return "equal";
  const amounts = splits.map((s) => s.amount);
  const min = Math.min(...amounts);
  const max = Math.max(...amounts);
  if (min === 0 || max - min > 1) return "custom";
  return "equal";
}

/** ローカルタイムゾーンで YYYY-MM-DD 文字列に変換 */
function formatDateLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** アクティブルールの "rule_id|YYYY-MM-DD" → {rule, paymentDate} マップを構築 */
function buildExpectedRuleKeys(
  rules: RuleQueryResult[],
  periodStart: string,
  periodEnd: string
): Map<string, { rule: RuleQueryResult; paymentDate: string }> {
  const map = new Map<string, { rule: RuleQueryResult; paymentDate: string }>();
  for (const rule of rules) {
    const dates = computeRuleDatesInPeriod(
      {
        start_date: (rule as { start_date: string }).start_date,
        end_date: (rule as { end_date: string | null }).end_date,
        interval_months: (rule as { interval_months: number }).interval_months,
        day_of_month: (rule as { day_of_month: number }).day_of_month,
      },
      periodStart,
      periodEnd
    );
    for (const date of dates) {
      const dateStr = formatDateLocal(date);
      map.set(`${(rule as { id: string }).id}|${dateStr}`, { rule, paymentDate: dateStr });
    }
  }
  return map;
}

/**
 * 既存エントリを照合し、不要な pending エントリを削除・更新する。
 * filled / skipped は常に保持（ユーザー入力を守る）。
 */
async function reconcileExistingEntries(
  supabase: Supabase,
  entries: EntryQueryResult[],
  expectedRuleKeys: Map<string, { rule: RuleQueryResult; paymentDate: string }>
): Promise<{ handledRuleKeys: Set<string>; handledPaymentIds: Set<string> }> {
  const handledRuleKeys = new Set<string>();
  const handledPaymentIds = new Set<string>();

  for (const entry of entries) {
    if (entry.rule_id) {
      // 填記済みルールエントリが source_payment_id を持つ場合（fill_settlement_entry_with_payment
      // で即時作成された payment）、その payment を handledPaymentIds に登録しておく。
      // これをしないと refresh 時に同 payment が未清算 payment として重複追加される。
      if (entry.source_payment_id) {
        handledPaymentIds.add(entry.source_payment_id);
      }

      const key = `${entry.rule_id}|${entry.payment_date}`;

      if (expectedRuleKeys.has(key)) {
        handledRuleKeys.add(key);
        if (entry.status === "pending") {
          // pending → 最新ルール設定で同期
          const { rule } = expectedRuleKeys.get(key)!;
          await supabase
            .from("settlement_entries")
            .update({
              description: (rule as { description: string }).description,
              expected_amount: (rule as { default_amount: number | null }).default_amount,
              payer_id: (rule as { default_payer_id: string }).default_payer_id,
              category_id: (rule as { category_id: string | null }).category_id,
            })
            .eq("id", entry.id);
        }
        // filled / skipped → 保持（何もしない）
      } else if (entry.status === "pending") {
        // ルール廃止 or 期間外 → pending のみ削除
        await supabase.from("settlement_entries").delete().eq("id", entry.id);
        // filled / skipped → 保持（ユーザー入力を守る）
      }
    } else if (entry.source_payment_id) {
      handledPaymentIds.add(entry.source_payment_id);
    }
  }

  return { handledRuleKeys, handledPaymentIds };
}

/** 新規ルールエントリを挿入し、追加件数を返す */
async function insertNewRuleEntries(
  supabase: Supabase,
  sessionId: string,
  expectedRuleKeys: Map<string, { rule: RuleQueryResult; paymentDate: string }>,
  handledRuleKeys: Set<string>,
  paymentMap: Map<string, PaymentQueryResult>
): Promise<number> {
  let added = 0;

  for (const [key, { rule, paymentDate }] of expectedRuleKeys) {
    if (handledRuleKeys.has(key)) continue;

    const r = rule as {
      id: string;
      description: string;
      category_id: string | null;
      default_amount: number | null;
      default_payer_id: string;
      split_type: string;
      splits: { user_id: string; amount: number | null; percentage: number | null }[];
    };

    // fill_settlement_entry_with_payment で作成された payment が paymentMap に残っている場合
    // （セッション削除→再ドラフト後も payment は settlement_id=NULL のまま残る）、
    // pending 再生成をスキップ。payment は insertNewPaymentEntries が filled エントリとして追加する。
    const hasMatchingPayment = [...paymentMap.values()].some(
      (p) =>
        p.payment_date === paymentDate &&
        p.payer_id === r.default_payer_id &&
        p.description === r.description
    );
    if (hasMatchingPayment) continue;

    const { data: entry } = await supabase
      .from("settlement_entries")
      .insert({
        session_id: sessionId,
        rule_id: r.id,
        description: r.description,
        category_id: r.category_id,
        expected_amount: r.default_amount,
        payer_id: r.default_payer_id,
        payment_date: paymentDate,
        status: "pending",
        split_type: r.split_type,
        entry_type: "rule",
      })
      .select("id")
      .single();

    if (entry) {
      added++;
      if (r.split_type === "custom" && r.splits?.length > 0) {
        await supabase.from("settlement_entry_splits").insert(
          r.splits.map((s) => ({
            entry_id: entry.id,
            user_id: s.user_id,
            amount:
              s.amount ??
              Math.floor(((r.default_amount ?? 0) * (s.percentage ?? 0)) / 100),
          }))
        );
      }
    }
  }

  return added;
}

/** 新規支払いエントリを挿入し、追加件数を返す */
async function insertNewPaymentEntries(
  supabase: Supabase,
  sessionId: string,
  paymentMap: Map<string, PaymentQueryResult>,
  handledPaymentIds: Set<string>
): Promise<number> {
  let added = 0;

  for (const [, payment] of paymentMap) {
    if (handledPaymentIds.has(payment.id)) continue;

    const hasSplits = (payment.payment_splits?.length ?? 0) > 0;

    // splits データから split_type を正確に推定する（均等割りの誤分類を防ぐ）
    const splitType = hasSplits
      ? detectSplitType(payment.payment_splits)
      : "equal";

    const { data: entry } = await supabase
      .from("settlement_entries")
      .insert({
        session_id: sessionId,
        description: payment.description ?? "",
        category_id: payment.category_id,
        expected_amount: payment.amount,
        actual_amount: payment.amount,
        payer_id: payment.payer_id,
        payment_date: payment.payment_date,
        status: "filled",
        split_type: splitType,
        entry_type: "existing",
        source_payment_id: payment.id,
        filled_by: payment.payer_id,
        filled_at: payment.created_at,
      })
      .select("id")
      .single();

    if (entry) {
      added++;
      // カスタム split のみ splits テーブルにコピー（equal は不要）
      if (splitType === "custom" && hasSplits) {
        await supabase.from("settlement_entry_splits").insert(
          payment.payment_splits.map((s) => ({
            entry_id: entry.id,
            user_id: s.user_id,
            amount: s.amount,
          }))
        );
      }
    }
  }

  return added;
}

/**
 * 清算エントリをスマートマージで再計算する
 *
 * @returns 新たに追加されたエントリ数（負の値はエラーコード）
 *   -1: セッションが見つからない
 *   -2: グループのメンバーでない
 *   -3: セッションが draft 状態でない
 */
export async function refreshSettlementEntries(
  supabase: Supabase,
  sessionId: string,
  groupId: string,
  periodStart: string,
  periodEnd: string,
  userId: string
): Promise<number> {
  // 1. メンバーシップ確認
  const { data: membership } = await supabase
    .from("group_members")
    .select("id")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .single();

  if (!membership) return -2;

  // 2. セッション取得 & draft 確認
  const { data: session } = await supabase
    .from("settlement_sessions")
    .select("id, status")
    .eq("id", sessionId)
    .single();

  if (!session) return -1;
  if (session.status !== "draft") return -3;

  // 3. 既存エントリを取得
  const { data: existingEntries } = await supabase
    .from("settlement_entries")
    .select(
      "id, rule_id, source_payment_id, payment_date, status, description, expected_amount, payer_id, category_id"
    )
    .eq("session_id", sessionId);

  // 4. アクティブなルールと期間内の発生日を計算
  const { data: rules } = await supabase
    .from("recurring_rules")
    .select(`*, splits:recurring_rule_splits(id, user_id, amount, percentage)`)
    .eq("group_id", groupId)
    .eq("is_active", true);

  const expectedRuleKeys = buildExpectedRuleKeys(
    (rules ?? []) as RuleQueryResult[],
    periodStart,
    periodEnd
  );

  // 5. 未清算の支払いを取得
  const { data: payments } = await supabase
    .from("payments")
    .select(`*, payment_splits(user_id, amount)`)
    .eq("group_id", groupId)
    .is("settlement_id", null)
    .lte("payment_date", periodEnd);

  const paymentMap = new Map<string, PaymentQueryResult>();
  for (const p of payments ?? []) paymentMap.set(p.id, p as PaymentQueryResult);

  // 6. 既存エントリを照合（保護・更新・削除）
  const { handledRuleKeys, handledPaymentIds } = await reconcileExistingEntries(
    supabase,
    (existingEntries ?? []) as EntryQueryResult[],
    expectedRuleKeys
  );

  // 7. 新規エントリを追加
  const addedRules = await insertNewRuleEntries(
    supabase,
    sessionId,
    expectedRuleKeys,
    handledRuleKeys,
    paymentMap
  );
  const addedPayments = await insertNewPaymentEntries(
    supabase,
    sessionId,
    paymentMap,
    handledPaymentIds
  );

  return addedRules + addedPayments;
}
