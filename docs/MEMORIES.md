# MEMORIES.md - 開発進捗と記憶

セッション間の文脈保持用。アーキテクチャ規約・DBスキーマは **CLAUDE.md** を参照。

最終更新: 2026-02-24 (Phase 15C完 / #78)

---

## 完了済み

| Phase | 内容 | 最終PR | テスト数 |
|-------|------|--------|---------|
| 1–10 | 基盤・UI・型安全・CI・RLS・認証・清算エンジン・テーマ・設定画面・匿名化退会 | #43 | — |
| 11–11.5 | インフラ正常化・多言語(ja/en)・グループ退出/オーナー譲渡・i18n DRY・統合テスト・E2E | #54 | — |
| 12 | カスタムカテゴリCRUD・WCAG対応コントラスト・クールモダン5テーマ | #56 | — |
| 13–13.6 | クイック確定・テンキーOL・スキップバグ修正・FlashMessage・並行清算・複数draft並行タブUI | #63 | — |
| 14 | Edge Function化・Turnstile CAPTCHA・pg_cron自動クリーンアップ | #64 | — |
| 15A–A' | スマートチップ(get_frequent_payments RPC)・スマート再計算(↻・filled/skipped保護) | #66 | 1166 |
| 15B–B' | 連続入力2ボタン・resetForNext・成功通知グリーン化・填記即時登録・ActionSheet | #68–70 | 1173 |
| 15B''–B'''' | withErrorHandler全統一・Zod集約・domain.ts・formatDateSmart・schema.sql最新化 | #72–74 | 1166 |
| 15C前編 | `calculateEntryBalances` 抽出・Group A/B分離・余り→最大payer加算・端数テスト | #75–76 | 1179 |
| **15C完** | **refresh重複防止2層・6項目清算テスト・比率正規化テスト・期間再ドラフト後の二重エントリ根絶** | **#77–78** | **1184** |

**現在**: Vitest **1184件** + Playwright E2E 1件 = **計1185テスト** / ビルド正常 / lint クリーン

---

## 清算ロジック（#75–78 確定版）

| 処理 | アルゴリズム | 保証 |
|------|------------|------|
| **Group A** (split_type ≠ "custom") | 全エントリ合算 → `floor(S_A / n)` → 余りは最大 payer へ | sum(owed) = S_A |
| **Group B** (split_type = "custom") | エントリごとに `floor(actual × stored_ratio)` → 余りは最大比率メンバーへ | sum(owed) = actual_amount |
| **refresh 重複防止①** (同セッション内) | `source_payment_id` を `handledPaymentIds` に登録 | fill済み payment が filled で重複追加されない |
| **refresh 重複防止②** (期間再ドラフト後) | `insertNewRuleEntries` で description + date + payer を paymentMap と照合 | pending 再生成をスキップ |

実例: 均等割り6項目 ¥181,148 + カスタム立替 ¥10,000（100%）→ 負担 **¥100,574** / 差額 **+¥80,574**

---

## キー実装パターン

| パターン | 場所 | メモ |
|---------|------|------|
| 認証ガード | `src/lib/api/authenticate.ts` | `authenticateRequest()` を全 API route 先頭で呼ぶ |
| 通貨フォーマット | `src/lib/format/currency.ts` | 清算時は `showSign: true` |
| 環境変数 | `src/lib/env.ts` | `getSupabaseEnv()` — `process.env.XXX!` 禁止 |
| splits 更新 | DB RPC `replace_payment_splits` | 直接 UPDATE 禁止 |
| スキップエントリ | `actual_amount CHECK (> 0)` 制約 | skip 時は必ず `null`（0 は DB 制約違反） |
| withErrorHandler | `src/lib/api/with-error-handler.ts` | 全 API Route に適用済み |
| Zod スキーマ | `src/lib/validation/schemas.ts` | `paymentRequestSchema` / `recurringRuleRequestSchema` 等 |
| domain.ts | `src/types/domain.ts` | `SessionData` / `EntryData` / `SuggestionData` / `RuleWithRelations` 集約 |
| formatDateSmart | `src/lib/format/date.ts` | 当年 → `M/D`、他年 → `YYYY/M/D`（先頭ゼロなし）。全画面統一済み |
| useTimedMessage | `src/hooks/useTimedMessage.ts` | 5秒自動消去メッセージ hook |
| RPC エラー翻訳 | `src/lib/api/translate-rpc-error.ts` | `translateRpcError` / `translateHttpError` |
| FlashMessage | `src/components/FlashMessage.tsx` | `?flash=xxx` URLパラム・4秒表示・`<Suspense>` 必須 |
| スマートチップ | `DescriptionField.tsx` + `useFrequentPayments` | h-9 固定・onMouseDown+preventDefault でフォーカス保持 |
| スマート再計算 | `src/lib/settlement/refresh-entries.ts` | filled/skipped 絶対保護・pending のみ更新/削除対象 |
| 連続入力 | `usePaymentForm` + `FullPaymentForm` / `InlinePaymentForm` | `resetForNext()` で amount/description/errors のみクリア |
| ActionSheet | `src/components/ui/ActionSheet.tsx` | ボトムドロワー。PaymentRow 三点リーダーから呼出し |
| 填記即時登録 | `fill_settlement_entry_with_payment` RPC (Mig. 041) | `rule_id IS NOT NULL` → payments 即時作成。API Route が振り分け |
| confirm 冪等性 | `confirm_settlement` RPC (Mig. 041) | `source_payment_id IS NOT NULL` は二重作成しない |
| 並行清算 | `api/settlement-sessions` POST | 期間重複 draft のみ 409 ブロック |
| i18n 定数 | `src/lib/i18n/index.ts` | `LOCALE_COOKIE_KEY` / `DEFAULT_LOCALE` 等 |
| デモ作成 | `supabase/functions/create-demo/` | Edge Function 経由必須。Turnstile→service_role→session 返却 |
| pg_cron | Migration 038 | `delete_expired_demo_data()` 3時間おき |

---

## デモ機能 セキュリティ構成

| 役割 | 実装 | 環境変数 |
|------|------|---------|
| ボット対策 | Cloudflare Turnstile | `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (Vercel) / `TURNSTILE_SECRET_KEY` (Edge Fn) |
| アトミックなデモ生成 | Edge Function `create-demo` | `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`（自動） |
| 自動データ削除 | pg_cron + `delete_expired_demo_data()` | — (Migration 038) |

ローカル開発: `TURNSTILE_SECRET_KEY` 未設定 = CAPTCHA スキップ / `NEXT_PUBLIC_TURNSTILE_SITE_KEY` 未設定 = ウィジェット非表示

---

## 統合テスト UUID 割り当て

| ファイル | UUID 範囲 |
|---------|----------|
| archive-payment | `99990000-00xx` |
| replace-payment-splits | `99990100-01xx` |
| anonymize-user | `99990200-02xx` |
| settlement-flow | `99990300-03xx` |
| leave-group / transfer-ownership | `99990400-04xx` |
| create-demo-bot-partner | `99990500-05xx` |

---

## 環境セットアップ（Codespaces）

- `supabase/config.toml`: `enable_anonymous_sign_ins = true`（デモ機能に必須）
- ポート 54321 は**手動で Public 化**が必要: `gh codespace ports visibility 54321:public -c <name>`
- `.env.local` の `NEXT_PUBLIC_SUPABASE_URL` は Codespaces フォワード URL（再作成時のみ書き換え）

---

## ロードマップ

- Dashboard アクションセンター化（未払い・要対応をトップに集約）
- 支払い更新（PUT）の原子性: 現在 `payments/[id]` PUT は2ステップ。将来 `update_payment_with_splits` RPC に統合
- Capacitor アプリ化（iOS / Android）
- LINE 通知連携
