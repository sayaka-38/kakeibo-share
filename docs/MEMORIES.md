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
| Phase 11-Step2 | interval_months追加・PaymentRow共通化・清算エントリTS化・バリデーション共通化・UI改善 | #46 |
| Phase 11-Step2.5 | groupPaymentsByDate/Month抽出・PaymentRow CSS Grid化・レイアウト堅牢化 | （本PR） |

テスト: 977件パス（55ファイル） / ビルド正常 / lint クリーン / Migration 028 まで

---

## Phase 11 Step 2.5 詳細

- **date-group.ts**: `groupPaymentsByDate()` / `groupPaymentsByMonth()` 追加。`payment_date` アクセサ内蔵の型安全ラッパー
- **RecentPaymentList**: `groupByDate(payments, ...)` → `groupPaymentsByDate(payments)` に簡素化
- **PaymentListWithFilter**: 8行の手動月グルーピングを `groupPaymentsByMonth()` 1行に置換
- **PaymentRow CSS Grid化**: `flex` → `grid grid-cols-[1fr_auto]`。右カラム（金額+アクション）がピクセル固定、左カラムは `min-w-0` で truncate
- **金額に `whitespace-nowrap`** 追加で折り返し防止
- **レイアウトテスト更新**: CSS Grid 構造に合わせて PaymentLayout.test.tsx の3テストを修正、5テスト追加

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
