# CLAUDE.md - Kakeibo Share 開発ガイド

**Kakeibo Share** — ルームシェア・パートナー向けの家計共有＆清算Webアプリ。

| カテゴリ | 技術 |
|---------|------|
| Frontend | Next.js 16 (App Router), TypeScript, Tailwind CSS v4 |
| Backend | Supabase (PostgreSQL, Auth, RLS) |
| Testing | Vitest, React Testing Library, Playwright (E2E) |
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
npm run dev / build / lint / test / test:run / test:e2e
npm run db:start / db:stop / db:reset / db:gen-types
```

---

## プロジェクト構造

```
src/
├── app/(protected)/  # 認証必須ページ
├── app/api/          # API Routes
├── components/       # 再利用コンポーネント
├── lib/              # api/ auth/ format/ i18n/ settlement/ supabase/ theme/
├── locales/          # ja.json, en.json
├── test/             # Vitest テスト
└── types/            # database.ts, database.generated.ts
tests/e2e/            # Playwright E2E テスト
```

---

## ワークフロー

- **TDD**: Red → Green → Refactor。異常系 → 正常系の順
- **承認フロー**: 新規ファイル・破壊的変更・アーキテクチャ決定はユーザー承認後に実装
- **Git**: `feature/xxx` / `fix/xxx`。`main` 直接コミット禁止。PR 経由のみ

---

## DB ルール

- **splits 更新**: RPC `replace_payment_splits` 経由
- **複数テーブル更新**: RPC で原子性担保。変更後 `npm run db:gen-types`
- **退会**: `anonymize_user` RPC（profiles 物理削除禁止）
- **支払い認可**: `payer_id === user.id` のみ
- **清算フロー**: `draft` → `confirmed` → `pending_payment` → `settled`
- **型**: `database.generated.ts` 自動生成（編集禁止）/ `database.ts` 手動オーバーライド可

---

## セキュリティポリシー

ユーザー承認なしの実行禁止: `sudo`, `rm`, `.env*`, SSH鍵, `curl/wget`, `npm uninstall`, `psql`

---

## リモートリリースチェックリスト

- [ ] `npx supabase db push` でリモート DB を最新化
- [ ] Vercel の環境変数が同期されていることを確認
