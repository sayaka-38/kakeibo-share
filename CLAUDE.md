# CLAUDE.md - Kakeibo Share 開発ガイド

**Kakeibo Share** — ルームシェア・パートナー向けの家計共有＆清算Webアプリ。

| カテゴリ | 技術 |
|---------|------|
| Frontend | Next.js 16 (App Router), TypeScript, Tailwind CSS v4 |
| Backend | Supabase (PostgreSQL, Auth, RLS) |
| Testing | Vitest, React Testing Library |
| Package | npm |

---

## 必須アーキテクチャ規約（違反コードはマージ不可）

1. **Server Actions 禁止** → `app/api/*/route.ts` + Client `fetch()`
2. **認証**: `authenticateRequest()` (`src/lib/api/authenticate.ts`)
3. **通貨**: `formatCurrency()` (`src/lib/format/currency.ts`)。清算は `showSign: true`
4. **環境変数**: `getSupabaseEnv()` (`src/lib/env.ts`)。`process.env.XXX!` 禁止

---

## コマンド

```bash
npm run dev / build / lint / test / test:run
npm run db:start / db:stop / db:reset / db:gen-types
npm run db:gen-types:linked   # Docker不可時のフォールバック
```

---

## プロジェクト構造

```
src/
├── app/(protected)/  # 認証必須ページ
├── app/api/          # API Routes
├── components/       # 再利用コンポーネント
├── lib/api/          # authenticateRequest
├── lib/auth/         # translateAuthError
├── lib/format/       # formatCurrency
├── lib/i18n/         # t() 翻訳関数
├── lib/settlement/   # consolidateTransfers 等
├── lib/supabase/     # server / client / middleware / admin
├── lib/theme/        # ThemeProvider / useTheme
├── locales/          # ja.json, en.json
├── test/             # テストファイル
└── types/            # database.ts, database.generated.ts
```

---

## ワークフロー

- **TDD**: Red → Green → Refactor。異常系 → 正常系の順
- **承認フロー**: 新規ファイル・破壊的変更・アーキテクチャ決定はユーザー承認後に実装
- **Git**: `feature/xxx` / `fix/xxx`。`main` 直接コミット禁止。PR 経由のみ
- **記憶**: セッション終了前に `docs/MEMORIES.md` を更新

---

## DB ルール

- **splits 更新**: RPC `replace_payment_splits` 経由（PostgREST DELETE + RLS バグ回避）
- **複数テーブル更新**: RPC で原子性担保。変更後 `npm run db:gen-types`
- **退会**: `anonymize_user` RPC（profiles 物理削除禁止、FK 維持）
- **支払い認可**: `payer_id === user.id` のみ。オーナー例外なし
- **清算フロー**: `draft` → `confirmed` → `pending_payment` → `settled`

### RPC 一覧

| RPC | 用途 |
|-----|------|
| `generate_settlement_entries` | 期間内エントリ自動生成 |
| `confirm_settlement` | draft → confirmed |
| `confirm_settlement_receipt` | pending_payment → settled（一括） |
| `settle_consolidated_sessions` | 統合済み旧セッション settled 化 |
| `replace_payment_splits` | splits 原子的置換 |
| `get_settlement_period_suggestion` | スマート期間提案 |
| `anonymize_user` | 退会匿名化 + グループ退去 |
| `create_demo_bot_partner` | デモBot作成 |

---

## DB スキーマ辞書

> 最新は `src/types/database.generated.ts`。不整合は `npm run db:gen-types` で解消

| テーブル | 主要カラム |
|---------|-----------|
| `profiles` | id, display_name, email?, avatar_url, is_demo |
| `groups` | id, name, description, owner_id, invite_code |
| `group_members` | id, group_id, user_id, role |
| `payments` | id, group_id, payer_id, category_id, amount, description, payment_date |
| `payment_splits` | id, payment_id, user_id, amount |
| `categories` | id, name, icon, color, is_default, group_id |
| `demo_sessions` | id, user_id, group_id, expires_at |
| `recurring_rules` | id, group_id, description, amount, category_id, day_of_month, default_payer_id |
| `recurring_rule_splits` | id, rule_id, user_id, amount |
| `settlement_sessions` | id, group_id, period_start/end, status, net_transfers, is_zero_settlement |
| `settlement_entries` | id, session_id, entry_type, description, expected/actual_amount, payer_id, status |
| `settlement_entry_splits` | id, entry_id, user_id, amount |

型ファイル: `database.generated.ts`（自動生成・編集禁止） / `database.ts`（ヘルパー型・手動編集可）

---

## 設計ドキュメント

| ドキュメント | パス |
|-------------|------|
| 設計書 | `docs/design.md` |
| UI ガイドライン | `docs/ui-guidelines.md` |
| 開発記憶 | `docs/MEMORIES.md` |

---

## セキュリティポリシー

ユーザー承認なしの実行禁止: `sudo`, `rm`, `.env*`, SSH鍵, `curl/wget`, `npm uninstall`, `psql`

---

## セッション終了 (`/done`)

1. `docs/MEMORIES.md` 更新 → 2. チェックリスト提示 → 3. テスト・コミット最終確認
