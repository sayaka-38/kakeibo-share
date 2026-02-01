# CLAUDE.md - Kakeibo Share 開発ガイド

**Kakeibo Share** — ルームシェア・パートナー向けの家計共有＆清算Webアプリ。

| カテゴリ | 技術 |
|---------|------|
| Frontend | Next.js 16 (App Router), TypeScript, Tailwind CSS v4 |
| Backend | Supabase (PostgreSQL, Auth, RLS) |
| Testing | Vitest, React Testing Library |
| Package | npm |

---

## 最優先ルール: 4つの開発アーキテクチャ

以下は**全実装で遵守必須**のアーキテクチャ規約。違反コードはマージ不可。

### 1. Server Actions 禁止 → API Routes

`"use server"` は使用禁止。すべてのサーバー処理は `app/api/*/route.ts` で実装し、Client Component から `fetch()` で呼び出す。

### 2. 共通認証: `authenticateRequest()`

API Route の認証は `src/lib/api/authenticate.ts` の `authenticateRequest()` を使用。直接 `supabase.auth.getUser()` を書かない。

```typescript
const auth = await authenticateRequest();
if (!auth.success) return auth.response;
const { user, supabase } = auth;
```

### 3. 通貨フォーマット: `formatCurrency()`

金額表示は `src/lib/format/currency.ts` の `formatCurrency()` を使用。`¥` やカンマ区切りをハードコーディングしない。清算画面では `showSign: true` オプションで `+¥` / `-¥` を表示。

### 4. 環境変数: `getSupabaseEnv()`

Supabase の環境変数は `src/lib/env.ts` の `getSupabaseEnv()` で取得。`process.env.XXX!`（non-null assertion）は禁止。

---

## よく使うコマンド

```bash
npm run dev          # 開発サーバー起動
npm run build        # プロダクションビルド
npm run lint         # ESLint
npm run test         # テスト（ウォッチ）
npm run test:run     # テスト（単発）
npm run db:start     # ローカル Supabase 起動
npm run db:stop      # ローカル Supabase 停止
npm run db:reset     # ローカル DB リセット
npm run db:gen-types # TypeScript 型定義を自動生成
```

---

## プロジェクト構造

```
src/
├── app/
│   ├── (protected)/     # 認証必須ページ
│   ├── api/             # API Routes
│   ├── auth/            # 認証コールバック
│   ├── login/           # ログイン
│   └── signup/          # サインアップ
├── components/          # 再利用コンポーネント
├── lib/
│   ├── api/             # authenticateRequest 等
│   ├── format/          # formatCurrency 等
│   ├── i18n/            # 国際化（翻訳関数）
│   └── supabase/        # Supabase クライアント (server / client / middleware)
├── locales/             # 辞書ファイル（ja.json, en.json）
├── test/                # テストファイル
└── types/               # 型定義
```

---

## 開発哲学（4原則）

1. **モバイルアプリ的操作感** — 即時フィードバック、楽観的UI、スケルトンローディング、最小限の画面遷移
2. **ルームメイトへの配慮** — 「未払い」→「清算待ち」、「借金」→「立替」、赤字表示は最小限、公平性を可視化
3. **クリーンコード** — 単一責任、UI→ロジック→データの一方向依存、リテラル型優先、副作用分離
4. **堅実な技術選択** — 上記4アーキテクチャに従い、実績のあるパターンのみ採用

---

## ワークフロー

### TDD（Strict Red-Green-Refactor）

- **Red**: テストを先に書き、失敗を確認
- **Green**: テストを通す最小限の実装
- **Refactor**: リファクタリング案を提示
- テスト優先順位: 異常系（バリデーション → 認証 → ネットワーク）→ 正常系

### 承認フロー（Human-in-the-Loop）

以下の場面では**必ずプランを提示し、ユーザー承認後に実装**:
- ファイルの新規作成
- 破壊的な変更（既存機能の削除・大幅変更）
- アーキテクチャの決定（新技術導入、設計パターン変更）

### Git 戦略

- ブランチ命名: `feature/xxx` / `fix/xxx`
- `main` への直接コミット・プッシュは**例外なく禁止**（ドキュメントのみの変更も PR 経由）
- Phase/Step 開始時に必ず専用ブランチを作成
- PR マージ後は古いブランチを削除（1世代前は緊急切り戻し用に残す）

### 記憶の保持

- セッション開始時: `docs/MEMORIES.md` を読み、前回の文脈を把握
- 作業の区切り・セッション終了前: 完了作業、残課題、次タスクを `docs/MEMORIES.md` に**自律的に**記録

---

## DBスキーマ辞書

**推測禁止。以下のテーブル定義のみ使用可。**

> **注意**: 最新の型定義は `src/types/database.generated.ts` を正とする。不整合がある場合は `npm run db:gen-types` を実行すること。

| テーブル | カラム |
|---------|--------|
| `profiles` | id, display_name, email, avatar_url, is_demo, created_at, updated_at |
| `groups` | id, name, description, owner_id, invite_code, created_at, updated_at |
| `group_members` | id, group_id, user_id, role, created_at |
| `payments` | id, group_id, payer_id, category_id, amount, description, payment_date, created_at, updated_at |
| `payment_splits` | id, payment_id, user_id, amount, is_paid, created_at |
| `categories` | id, name, icon, color, is_default, group_id, created_at |
| `demo_sessions` | id, user_id, group_id, expires_at, created_at |

### 型定義ファイル構成

| ファイル | 役割 | 編集 |
|---------|------|------|
| `src/types/database.generated.ts` | Supabase CLI 自動生成 | **手動編集禁止** |
| `src/types/database.ts` | ヘルパー型・リテラル型オーバーライド | 手動編集可 |

### マイグレーション対応表

| 旧ファイル名 | 新ファイル名（タイムスタンプ形式） |
|-------------|-------------------------------|
| `001_initial_schema.sql` | `20260101000001_initial_schema.sql` |
| `002_add_invite_code.sql` | `20260101000002_add_invite_code.sql` |
| `003_rename_columns_for_consistency.sql` | `20260101000003_rename_columns_for_consistency.sql` |
| `004_profiles_rls.sql` | `20260101000004_profiles_rls.sql` |
| `005_demo_sessions_rls.sql` | `20260101000005_demo_sessions_rls.sql` |
| `006_groups_rls.sql` | `20260101000006_groups_rls.sql` |
| `007_fix_rls_auth_flow.sql` | `20260101000007_fix_rls_auth_flow.sql` |
| `008_payments_rls.sql` | `20260101000008_payments_rls.sql` |
| `009_security_hardening.sql` | `20260101000009_security_hardening.sql` |

---

## Demo Mode Policy

- デモデータは `demo_sessions` テーブルで管理し、本番データと論理分離
- 削除ロジックは `demo_sessions` に紐づくデータのみ対象。`is_demo` フラグチェック必須
- デモデータは 24 時間後に自動削除（将来実装予定）

---

## 設計ドキュメント

| ドキュメント | パス | 内容 |
|-------------|------|------|
| 設計書 | `docs/design.md` | 機能仕様、DB制約、バリデーション定義、清算アルゴリズム、RLSポリシー |
| UI ガイドライン | `docs/ui-guidelines.md` | スペーシング、カラー、Tailwind規約 |
| 開発記憶 | `docs/MEMORIES.md` | 進捗、課題、次タスク、セッション引き継ぎ |

---

## セキュリティポリシー

`~/.claude/config.json` で定義。以下は**ユーザーの明示的承認なしに実行禁止**:

| 禁止操作 | 対象 |
|---------|------|
| システム | `sudo`, `rm`, `rm -rf` |
| 機密ファイル | `.env*`, SSH鍵, `*token*`, `*key*`, `secrets/**` |
| ネットワーク | `curl`, `wget`, `nc` |
| パッケージ削除 | `npm uninstall`, `npm remove` |
| DB直接操作 | `psql`, `mysql`, `mcp__supabase__execute_sql` |

---

## セッション終了プロセス (`/done`)

1. `docs/MEMORIES.md` を更新（完了作業、ペンディング、技術的文脈）
2. 完了・未完了・次の一手をチェックリスト形式で提示
3. テストパス・コミット漏れの最終確認 →「引き継ぎ準備完了」を報告
