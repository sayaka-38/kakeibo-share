# MEMORIES.md - 開発進捗と記憶

セッション間の文脈保持用。アーキテクチャ規約・DBスキーマは **CLAUDE.md** を参照。

---

## 最終更新日

2026-02-16

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
| Phase 11-Step2 | interval_months追加・PaymentRow共通化・清算エントリTS化・バリデーション共通化・UI改善 | #46 |
| Phase 11-Step2.5 | groupPaymentsByDate/Month抽出・PaymentRow CSS Grid化・レイアウト堅牢化 | #47 |
| Phase 11-Final | フォーム統合(fixedGroupId)・PaymentRow groupName廃止・groupPaymentsByDate配列化 | #48 |
| Phase 11-Step3 | RPC統合テスト46件追加・孤立コード削除・Migration 030-031 でスキーマバグ3件修正 | （次回PR） |

テスト: 1036件パス（60ファイル） / ビルド正常 / lint クリーン / Migration 031 まで

---

## Phase 11 最終ブラッシュアップ詳細

- **フォーム統合**: `GroupPaymentForm` 廃止。`FullPaymentForm` に `fixedGroupId` prop 追加でインラインモード対応（グループ選択非表示、成功時フォームリセット+ページリフレッシュ）
- **PaymentRow簡素化**: `groupName` prop 廃止 → `payment.groups?.name` を内部で直接参照。`PaymentRowData` 型に `groups?` フィールド追加
- **groupPaymentsByDate配列化**: 戻り値を `{ date, payments }[]` に変更。呼び出し側で `dateOrder`/`byDate` の分離参照が不要に
- **InlinePaymentForm**: テスト用に維持（PaymentForm として re-export）

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

## Progress Management

### テストカバレッジ補強（完了 — 2026-02-16）

**目的**: archive_payment 導入時の教訓（mock テスト全パスだがリモート DB 未適用で 500 エラー）を踏まえ、RPC 統合テストを追加。孤立コード削除でテスト品質も向上。

**結果**: 998 → 1036 テスト（-8 孤立削除 + 46 統合追加）、60 ファイル

#### Step 1: 孤立コード削除 ✅
- `api/payments/delete/route.ts`, `lib/demo/delete-payment.ts`, `test/demo/delete-payment.test.ts` 削除
- `api/settlement-sessions/suggest/route.ts` 削除（ページが RPC 直接呼び出しのため未使用）
- `lib/demo/index.ts` — deletePayment export 除去

#### Step 2: 統合テストヘルパー ✅
- `src/test/integration/helpers.ts` 新規作成（createAdminClient, createAnonClient, checkDbAvailable, SEED定数）
- `archive-payment.test.ts` をヘルパー利用にリファクタ

#### Step 3: RPC 統合テスト（5 ファイル追加）✅
- `replace-payment-splits.test.ts` — 7 tests (UUID: 99990100-01xx)
- `settlement-period-suggestion.test.ts` — 5 tests (seed data活用)
- `create-demo-bot-partner.test.ts` — 3 tests (anon auth + bot作成)
- `anonymize-user.test.ts` — 10 tests (UUID: 99990200-02xx)
- `settlement-flow.test.ts` — 21 tests (UUID: 99990300-03xx, 全清算フロー)

#### 発見・修正したバグ（Migration 030–031）
- `profiles.email` NOT NULL → NULL 許容に変更（anonymize_user が email=NULL を設定）
- `anonymize_user` RPC: `gm.created_at` → `gm.joined_at`（存在しないカラム参照）
- `create_demo_bot_partner` RPC: `is_paid` カラム参照削除（payment_splits に存在しない）

---

## Next Actions（次回セッション引き継ぎ）

### 1. Phase 11 Step 3 PR 作成・マージ
- ブランチ `feature/integration-tests` を作成し、コミット済みの変更で PR を出す
- **リモート DB 更新必須**: `npx supabase db push` で Migration 030–031 をリモートに適用
- マージ後、`main` に戻って次へ

### 2. Step 3B: Playwright E2E テスト導入（検討中）
- ブラウザベースの E2E テストで UI フロー全体をカバー
- 優先シナリオ: ログイン → 支払い登録 → 清算フロー
- Playwright のセットアップ・CI 統合が必要

---

## Backlog

### Phase 11（残り）

- カテゴリの任意化: `payments.category_id` を NULL 許容へ

### Phase 12（検討中）

- よく使う店チップ（入力補助）
- Dashboard アクションセンター化
