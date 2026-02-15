# MEMORIES.md - 開発進捗と記憶

セッション間の文脈保持用。アーキテクチャ規約・DBスキーマは **CLAUDE.md** を参照。

---

## 最終更新日

2026-02-15

---

## 完了済み（1行サマリー）

| Phase | 内容 | PR |
|-------|------|----|
| Phase 1–6 | 基盤・UI・型安全・CI・RLS・CLI移行 | — |
| Phase A | 認証共通化・通貨フォーマット・環境変数厳格化 | #24 |
| 代理購入 + カスタム割勘 | splits参照方式・バリデーション・自動補完 | 済 |
| 支払い削除/編集 | RESTful API + RPC原子的置換 | #29 |
| 土台強化 | 認証ガード・isProxySplit共通化・CI permissions | #30 |
| Phase 7 | 清算エンジン完全実装 + 相殺統合 + ゾンビ修正 | #34, #36 |
| Phase 8 | 構造改善・支払い複製・完全日本語化・email NULL対応 | #38 |
| Phase 9A | テーマシステム基盤 — 5パレット・CSS変数・ThemeProvider | #39 |
| Phase 9B | UX磨き — デモBot・割り勘ガード・複製可視化・WCAGコントラスト | #40 |
| Husky | lint-staged + Husky による SQL commit 時の自動型生成 | #41 |
| Phase 10A+B | ナビ修正・ログアウトLP遷移・payer-only DELETE・設定画面・匿名化退会・UI統一・認証日本語化 | #43 |
| Phase 11-Step1 | インフラ正常化: seed.sql・.env.test・vitest env固定・CI ローカルスタック化・secrets依存除去 | #44, #45 |
| Phase 11-Step2 | interval_months追加・PaymentRow共通化・清算エントリTS化・バリデーション共通化・UI改善 | （本PR） |

テスト: 972件パス（55ファイル） / ビルド正常 / lint クリーン / Migration 028 まで

---

## Phase 11 Step 2 詳細

- **Migration 028**: `recurring_rules` に `interval_months SMALLINT NOT NULL DEFAULT 1` 追加（CHECK 1-12）
- **RecurringRuleForm**: 発生間隔セレクト追加（毎月/2/3/6/12ヶ月ごと）
- **RecurringRuleCard**: 間隔表示（毎月以外の場合のみ）
- **API /api/recurring-rules**: POST/PUT で `intervalMonths` を受け付け、共通バリデーション関数経由で検証
- **清算エントリ生成**: RPC → TS (`generate-entries.ts` + `recurring-schedule.ts`) に移行。`interval_months` 対応のスケジュール計算
- **PaymentRow**: 共通コンポーネントとして抽出。ダッシュボード（RecentPaymentList）と支払い一覧（PaymentListWithFilter）の両方で使用
- **PaymentListWithFilter**: `/payments` ページのクライアントコンポーネント分離
- **date-group.ts**: `formatDateHeader()` / `groupByDate()` をユーティリティに抽出（単体テスト付き）
- **recurring-rule.ts**: バリデーション関数を共通化（API route + フォームで共有）
- **Navigation**: `md:shrink-0` 追加でサイドバー幅の Layout Shift 防止

---

## 重要な教訓

### db push 必須化
新規マイグレーション追加時は `db:reset`（ローカル）だけでなく `npx supabase db push`（リモート）も必ず実行。テストは `.env.test`（ローカルDB）を使うためGreenでも、dev serverは `.env.local`（リモートDB）に接続するため 500 エラーが発生する。

### 500エラー時の初動プロトコル
1. **まずリモートDBの状態を確認**: `npx supabase db push` で未適用マイグレーションがないか確認
2. **テストがGreenでもdev serverで500**: `.env.test`（ローカル）と `.env.local`（リモート）のDB乖離が原因の可能性大
3. **API route のエラーログを確認**: `console.error` でレスポンスボディ内の `details` フィールドを確認
4. **カラム追加系のエラー**: `column "xxx" does not exist` → マイグレーション未適用。`db push` で解消

---

## 環境情報

- **ローカルスタック優先**: `.env.test` + `vitest.config.ts` の `env` ブロックでテスト時のローカル値固定
- **`.env.local` はリモートDB**: dev server はリモートSupabase（`byvtpkuocvjnwvihipvy.supabase.co`）に接続
- `db:gen-types` は `--local`（ローカルスタック）、`db:gen-types:linked` はフォールバック
- CI: secrets 不要。`supabase start` → `db reset` → 型diff → `stop` のフルサイクル
- Husky + lint-staged: SQL commit 時に `npm run db:gen-types` 自動実行

---

## Backlog

### Phase 11（残り）

- カテゴリの任意化: `payments.category_id` を NULL 許容へ

### Phase 12（検討中）

- よく使う店チップ（入力補助）
- Dashboard アクションセンター化
