# Kakeibo Share

ルームシェア・パートナー向けの家計共有＆清算 Web アプリ。グループ内で支払いを記録し、誰がいくら立て替えたかを可視化して、清算額を自動計算します。

## 技術スタック

| カテゴリ | 技術 |
|---------|------|
| Frontend | Next.js 16 (App Router), React 19, TypeScript |
| Styling | Tailwind CSS v4 |
| Backend | Supabase (PostgreSQL, Auth, RLS) |
| Testing | Vitest, React Testing Library |
| Package | npm |

## 主な機能

- **グループ管理** — 招待コードでメンバーを追加
- **支払い記録** — 金額・カテゴリ・割り勘を登録
- **自動清算計算** — 期間を指定して誰が誰にいくら払うかを算出
- **清算フロー** — draft → confirmed → pending_payment → settled の 4 段階
- **定期ルール** — 毎月の固定費を自動で清算エントリに反映
- **デモモード** — 匿名認証で気軽に試せる体験版
- **多言語対応** — 日本語 / 英語
- **テーマ切替** — 5 種類のカラーパレット

## セットアップ

### 前提条件

- Node.js 18+
- Docker（Supabase ローカル開発用）

### インストール

```bash
npm install
```

### ローカル DB 起動

```bash
npm run db:start    # Supabase コンテナ起動
npm run db:reset    # マイグレーション適用 + シードデータ投入
npm run db:gen-types # TypeScript 型生成
```

### 環境変数

`.env.local` に以下を設定:

```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-local-anon-key>
```

`npm run db:start` 実行時にキーが表示されます。

### 開発サーバー

```bash
npm run dev
```

http://localhost:3000 でアクセスできます。

## コマンド一覧

| コマンド | 説明 |
|---------|------|
| `npm run dev` | 開発サーバー起動 |
| `npm run build` | プロダクションビルド |
| `npm run lint` | ESLint 実行 |
| `npm run test` | テスト (watch mode) |
| `npm run test:run` | テスト (単発実行) |
| `npm run db:start` | Supabase ローカル起動 |
| `npm run db:stop` | Supabase ローカル停止 |
| `npm run db:reset` | DB リセット + マイグレーション適用 |
| `npm run db:gen-types` | DB スキーマから TypeScript 型生成 |

## プロジェクト構造

```
src/
├── app/(protected)/  # 認証必須ページ
├── app/api/          # API Routes
├── components/       # 再利用コンポーネント
├── lib/              # ビジネスロジック・ユーティリティ
├── locales/          # i18n 翻訳ファイル (ja/en)
├── test/             # テストファイル
└── types/            # TypeScript 型定義
supabase/
├── migrations/       # SQL マイグレーション
└── seed.sql          # シードデータ
```

## ライセンス

Private
