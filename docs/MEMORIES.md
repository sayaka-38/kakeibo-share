# MEMORIES.md - 開発進捗と記憶

セッション間の文脈保持用。アーキテクチャ規約・DBスキーマは **CLAUDE.md** を参照。

最終更新: 2026-02-23 (Phase 15B'')

---

## 完了済み

| Phase | 内容 | 最終PR |
|-------|------|--------|
| 1–10 | 基盤・UI・型安全・CI・RLS・認証・清算エンジン・テーマ・設定画面・匿名化退会 | #43 |
| 11–11.5 | インフラ正常化・多言語(ja/en)・グループ退出/オーナー譲渡・i18n DRY・統合テスト56件・E2E | #52–#54 |
| 12 | カスタムカテゴリCRUD・WCAG対応コントラスト・クールモダン5テーマ | #55, #56 |
| 13–13.6 | 神UX（クイック確定・テンキーOL・スキップバグ修正）・FlashMessage・並行清算解禁・複数draft並行タブUI | #57–#63 |
| 14 | デモ防衛強化: Edge Function化・Turnstile CAPTCHA・pg_cron自動クリーンアップ | #64 |
| 15A–15A' | スマートチップ(get_frequent_payments RPC)・スマート再計算(↻ボタン・filled/skipped保護) | #66 |
| 15B | 連続入力モード: 2ボタン形式（保存して次へ/保存）・resetForNext・成功通知グリーン化 | #68, #69 |
| 15B' | 填記即時登録・ActionSheet・清算内容の調整へ改称・チップトグル・モーダル改善 | #70 |
| **15B''** | **アーキテクチャ洗練: withErrorHandler・Zod統合・domain.ts型集約・useTimedMessage・UI最終調整** | WIP |

**現在**: Vitest **1166件** + Playwright E2E 1件 = **計1167テスト** / ビルド正常 / lint クリーン

---

## キー実装パターン

| パターン | 場所 | メモ |
|---------|------|------|
| 認証ガード | `src/lib/api/authenticate.ts` | `authenticateRequest()` を全 API route の先頭で呼ぶ |
| 通貨フォーマット | `src/lib/format/currency.ts` | 清算時は `showSign: true` |
| 環境変数 | `src/lib/env.ts` | `getSupabaseEnv()` / `getTurnstileSiteKey()` — `process.env.XXX!` 禁止 |
| splits 更新 | DB RPC `replace_payment_splits` | 直接 UPDATE 禁止 |
| スキップエントリ | `actual_amount CHECK (> 0)` 制約 | skip 時は必ず `null`（0 は DB 制約違反） |
| FlashMessage | `src/components/FlashMessage.tsx` | `?flash=xxx` URLパラムを読み4秒表示。`<Suspense>` 必須 |
| 並行清算 | `api/settlement-sessions` POST | 期間重複 draft のみブロック（同期間のみ 409） |
| i18n 定数 | `src/lib/i18n/index.ts` | `LOCALE_COOKIE_KEY` / `DEFAULT_LOCALE` 等 |
| RPC エラー翻訳 | `src/lib/api/translate-rpc-error.ts` | `translateRpcError(rpcName, msg)` / `translateHttpError(status)` |
| デモ作成 | `supabase/functions/create-demo/` | Edge Function 経由必須。Turnstile検証→service_roleでDB生成→session返却 |
| pg_cron | Migration 038 | `delete_expired_demo_data()` を3時間おきに実行 |
| スマートチップ | `DescriptionField.tsx` + `useFrequentPayments` | chips あれば常時表示（focus 不要）。h-9 + overflow-y-hidden。onMouseDown+preventDefault でフォーカス保持。**再タップで × トグル（クリア）** |
| スマート再計算 | `src/lib/settlement/refresh-entries.ts` | filled/skipped エントリは絶対保護。pending のみ更新/削除対象 |
| 連続入力 | `usePaymentForm` + `FullPaymentForm` / `InlinePaymentForm` | `resetForNext()` で amount/description/errors のみクリア。日付・splitType 等は維持 |
| 成功通知 | `src/components/ui/SuccessBanner.tsx` | `bg-green-500/10 border-green-500/30 text-green-700` + SVG チェックマーク。FullPaymentForm/InlinePaymentForm で共用 |
| ActionSheet | `src/components/ui/ActionSheet.tsx` | ボトムドロワー（`fixed bottom-0`）。PaymentRow 三点リーダーから呼出し（編集/複製/削除） |
| **填記即時登録** | `fill_settlement_entry_with_payment` RPC (Migration 041) | `rule_id IS NOT NULL` エントリ填記 → payments 即時作成。スキップ時は payment 削除。API Route が rule_id で RPC を振り分け |
| **confirm_settlement 冪等性** | `confirm_settlement` RPC (Migration 041) | `source_payment_id IS NOT NULL` のエントリは二重作成しない |
| モーダル閉じ | `RecurringRuleForm` / `EntryEditModal` | 背景クリック（`onClick={() => onClose()}`）+ ヘッダー × ボタン（44px タップターゲット） |
| 清算内容の調整 | 旧称「清算準備室」 | UI表示・i18n キー `settlementSession.title` は「清算内容の調整」に統一済み |
| **withErrorHandler** | `src/lib/api/with-error-handler.ts` | `export const DELETE = withErrorHandler<Ctx>(async (req, ctx) => {...}, "名前")` — ZodError → 400、予期せぬ例外 → 500 |
| **Zod スキーマ** | `src/lib/validation/schemas.ts` | API Route body parsing 用。`paymentRequestSchema` / `recurringRuleRequestSchema` / `categoryRequestSchema`。フロントエンド側の i18n バリデーター（`validation/*.ts`）は別途保持 |
| **domain.ts** | `src/types/domain.ts` | `SessionData` / `EntryData` / `SuggestionData` / `RuleWithRelations` を集約。全 consumer は `@/types/domain` から直接 import |
| **useTimedMessage** | `src/hooks/useTimedMessage.ts` | 5秒自動消去メッセージ hook。FullPaymentForm / InlinePaymentForm の成功バナー表示に使用 |

---

## デモ機能 セキュリティ構成（Phase 14）

| 役割 | 実装 | 環境変数 |
|------|------|---------|
| ボット対策 (CAPTCHA) | Cloudflare Turnstile | `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (Vercel) / `TURNSTILE_SECRET_KEY` (Edge Function) |
| アトミックなデモ生成 | Edge Function `create-demo` | `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`（自動） |
| 自動データ削除 | pg_cron + `delete_expired_demo_data()` | — (Migration 038 で設定済み) |

**注意**: ローカル開発では `TURNSTILE_SECRET_KEY` 未設定 = CAPTCHA スキップ。`NEXT_PUBLIC_TURNSTILE_SITE_KEY` 未設定 = ウィジェット非表示。

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

### 将来構想
- Dashboard アクションセンター化（未払い・要対応をトップに集約）
- Capacitor アプリ化（iOS / Android）
- LINE 通知連携
