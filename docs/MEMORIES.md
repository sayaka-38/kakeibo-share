# MEMORIES.md - 開発進捗と記憶

セッション間の文脈保持用。アーキテクチャ規約・DBスキーマは **CLAUDE.md** を参照。

最終更新: 2026-02-22

---

## 完了済み

| Phase | 内容 | 最終PR |
|-------|------|--------|
| 1–10 | 基盤・UI・型安全・CI・RLS・認証・清算エンジン・テーマ・設定画面・匿名化退会 | #43 |
| 11 | インフラ正常化・コード共通化・統合テスト56件・Playwright E2E・Migration 031 | #52 |
| 11.5 | 多言語切替(ja/en)・グループ退出/オーナー譲渡RPC・i18n DRY・RPC共通エラー翻訳・設定画面分割 | #54 |
| 12 | カスタムカテゴリCRUD・アイコン/カラー選択UI・WCAG対応コントラスト・クールモダン5テーマ | #55, #56 |
| 13 | 神UX（クイック確定・テンキーOL・スキップバグ修正）・グループナビ改善・GroupSelector | #57–#59 |
| 13.3–13.6 | 並行清算解禁・FlashMessage・直接グループ遷移・ヘッダー同期・デッドリンク除去・複数draft並行タブUI | #62, #63 |
| 14 | デモ防衛強化: Edge Function化・Turnstile CAPTCHA・pg_cron自動クリーンアップ・429ハンドリング | #64 |
| **15A** | **スマートチップ: get_frequent_payments RPC・API route・useFrequentPayments hook・常時表示UI** | WIP |
| **15A'** | **スマート再計算: refreshSettlementEntries・↻ボタン・filled/skipped保護ロジック** | WIP |

**現在**: Vitest **1168件** + Playwright E2E 1件 = **計1169テスト** / ビルド正常 / lint クリーン

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
| GroupSelector | `src/components/GroupSelector.tsx` | `pathname` useEffect 依存 → ページ遷移ごとに再取得 |
| 並行清算 | `api/settlement-sessions` POST | 期間重複 draft のみブロック（同期間のみ 409） |
| 複数 draft UI | `SettlementSessionManager` | `localDraftSessions` + `isCreating` ステート。pill タブバー |
| i18n 定数 | `src/lib/i18n/index.ts` | `LOCALE_COOKIE_KEY` / `DEFAULT_LOCALE` 等 |
| RPC エラー翻訳 | `src/lib/api/translate-rpc-error.ts` | `translateRpcError(rpcName, msg)` / `translateHttpError(status)` |
| **デモ作成** | **`supabase/functions/create-demo/`** | **Edge Function 経由必須。Turnstile検証→service_roleでDB生成→session返却** |
| **Turnstile** | **`DemoButton.tsx`** | **`getTurnstileSiteKey()` で取得。未設定時はウィジェット非表示** |
| **pg_cron** | **Migration 038** | **`delete_expired_demo_data()` を3時間おきに実行** |
| **HTTP エラー** | **`translateHttpError(status)`** | **429 → `common.rateLimited`、0/"Failed to fetch" → `common.networkError`** |
| **スマートチップ** | **`DescriptionField.tsx` + `useFrequentPayments`** | **chips あれば常時表示（focus 不要）。h-8 固定でレイアウトシフト防止。onMouseDown+preventDefault でフォーカス保持** |
| **スマート再計算** | **`src/lib/settlement/refresh-entries.ts`** | **filled/skipped エントリは絶対保護。pending のみ更新/削除対象。RPC key="rule_id\|YYYY-MM-DD"** |

---

## デモ機能 セキュリティ構成（Phase 14）

| 役割 | 実装 | 環境変数 |
|------|------|---------|
| ボット対策 (CAPTCHA) | Cloudflare Turnstile | `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (Vercel) / `TURNSTILE_SECRET_KEY` (Edge Function) |
| アトミックなデモ生成 | Edge Function `create-demo` | `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`（自動） |
| 自動データ削除 | pg_cron + `delete_expired_demo_data()` | — (Migration 038 で設定済み) |
| 429 ハンドリング | `translateHttpError(429)` | — |

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

### Phase 15B 候補
- 連続入力モード（支払い登録後すぐ次の入力へ）
- Dashboard アクションセンター化（未払い・要対応をトップに集約）

### 将来構想
- Capacitor アプリ化（iOS / Android）
- LINE 通知連携
- 定期支払いの自動生成
