# CLAUDE.md - Kakeibo Share 開発ガイド

このファイルは Claude Code がこのリポジトリで作業する際のガイドラインです。

## プロジェクト概要

**Kakeibo Share** は、ルームシェアやパートナーと家計を共有し、清算処理を行うためのWebアプリケーションです。

- **Frontend**: Next.js 16 (App Router) + TypeScript
- **Styling**: Tailwind CSS v4
- **Database & Auth**: Supabase
- **Package Manager**: npm

## よく使うコマンド

```bash
# 開発サーバー起動
npm run dev

# プロダクションビルド
npm run build

# プロダクションサーバー起動
npm run start

# ESLint 実行
npm run lint
```

## プロジェクト構造

```
src/
├── app/                    # App Router ページ
│   ├── (protected)/        # 認証必須ページ（dashboard, payments, settlement, groups）
│   ├── auth/               # 認証コールバック
│   ├── login/              # ログイン
│   ├── signup/             # サインアップ
│   └── page.tsx            # トップページ
├── components/             # 再利用可能なコンポーネント
├── lib/supabase/           # Supabase クライアント設定
│   ├── client.ts           # ブラウザ用クライアント
│   ├── server.ts           # サーバー用クライアント
│   └── middleware.ts       # 認証ミドルウェア
└── types/                  # 型定義
    └── database.ts         # Supabase データベース型
```

## コーディング規約

### TypeScript

- **strict モードを厳守**: `tsconfig.json` で `"strict": true` が有効
- **`any` 型の使用は最小限に**: やむを得ない場合は `eslint-disable` コメントを付与
- **型アサーションよりも型ガードを優先**: `as` より `is` や型の絞り込みを使用
- **インポートエイリアス**: `@/*` を使用（例: `import { createClient } from "@/lib/supabase/client"`）

```typescript
// Good
const user = data as User | null;
if (user) {
  console.log(user.name);
}

// Avoid
const user = data as any;
```

### Next.js App Router

- **Server Components を優先**: データフェッチはサーバーコンポーネントで行う
- **Client Components は最小限に**: `"use client"` は必要な場合のみ使用
- **Route Groups**: 認証が必要なページは `(protected)` グループに配置
- **ページコンポーネントは `page.tsx`**: レイアウトは `layout.tsx`

```typescript
// Server Component（デフォルト）
export default async function Page() {
  const data = await fetchData(); // サーバーで実行
  return <div>{data}</div>;
}

// Client Component（インタラクティブな機能が必要な場合のみ）
"use client";
export default function InteractiveComponent() {
  const [state, setState] = useState();
  // ...
}
```

### Tailwind CSS

- **ユーティリティファーストで記述**: カスタム CSS は最小限に
- **レスポンシブ対応**: `sm:`, `md:`, `lg:` プレフィックスを活用
- **ダークモード**: `dark:` プレフィックスで対応（CSS 変数で定義済み）
- **カラーは CSS 変数を使用**: `globals.css` の `--background`, `--foreground` を参照

```tsx
// Good - Tailwind ユーティリティクラスを使用
<button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
  Click
</button>

// Avoid - インラインスタイルやカスタム CSS
<button style={{ padding: "8px 16px" }}>Click</button>
```

### コンポーネント設計

- **Props の型定義は明示的に**: `type` または `interface` で定義
- **コンポーネントは単一責任**: 1つのコンポーネントは1つの役割
- **ファイル名はPascalCase**: `PaymentForm.tsx`, `Header.tsx`

```typescript
type ButtonProps = {
  label: string;
  onClick: () => void;
  disabled?: boolean;
};

export default function Button({ label, onClick, disabled }: ButtonProps) {
  // ...
}
```

### Supabase

- **サーバーコンポーネントでは `createClient` from `@/lib/supabase/server`**
- **クライアントコンポーネントでは `createClient` from `@/lib/supabase/client`**
- **型安全なクエリ**: `Database` 型を活用、必要に応じて型アサーションを使用

## 開発の基本ルール

### 1. 変更前にプランを提示すること

新機能の追加や大きな変更を行う前に、必ず以下を含むプランを提示してください：

- **変更の目的**: 何を達成しようとしているか
- **影響範囲**: どのファイル/機能に影響があるか
- **実装アプローチ**: どのように実装するか
- **潜在的なリスク**: 考慮すべき問題点

```
例:
「支払い編集機能を追加します」

1. 目的: ユーザーが既存の支払いを編集できるようにする
2. 影響範囲:
   - src/app/(protected)/payments/[id]/edit/page.tsx（新規）
   - src/components/PaymentForm.tsx（編集モード対応）
3. 実装アプローチ:
   - PaymentForm に編集モードを追加
   - 支払い詳細ページから編集ページへのリンクを追加
4. リスク:
   - payment_splits の更新ロジックが複雑になる可能性
```

### 2. 小さな変更から始める

- 大きな変更は小さなステップに分割
- 各ステップでビルドが通ることを確認
- `npm run build` でエラーがないことを確認してからコミット

### 3. 既存のパターンに従う

- 新しいページは既存のページ構造を参考に
- コンポーネントは既存のスタイルガイドに従う
- Supabase クエリは既存のパターンを踏襲

## 環境設定

### 必要な環境変数（`.env.local`）

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### データベースセットアップ

`supabase/schema.sql` を Supabase SQL Editor で実行してテーブルを作成してください。

## トラブルシューティング

### Supabase の型エラー

Supabase のリレーションクエリで型エラーが発生する場合は、明示的な型アサーションを使用：

```typescript
type ResultType = {
  id: string;
  name: string;
};

const { data } = (await supabase
  .from("table")
  .select("id, name")) as { data: ResultType[] | null };
```

### ビルドエラー

```bash
# キャッシュをクリアして再ビルド
rm -rf .next
npm run build
```

## 開発の指針（Development Guidance）

**重要**: すべての実装タスクを開始する前に、このセクションの手順に従うこと。

### 設計ドキュメントの場所

| ドキュメント | パス | 内容 |
|-------------|------|------|
| **プロジェクト設計書** | `docs/design.md` | 機能一覧、ER図、テーブル定義、画面一覧、清算アルゴリズム、セキュリティ設計 |
| **UI ガイドライン** | `docs/ui-guidelines.md` | Tailwind クラス並び順、スペーシング、レスポンシブ、カラーパレット、コンポーネントパターン |

### 実装前の必須セルフチェック

**すべての実装タスクを開始する前に、以下の手順を実行すること:**

```
1. docs/design.md を読み込む
2. docs/ui-guidelines.md を読み込む
3. 以下のセルフチェックを実施
```

#### セルフチェック項目

| カテゴリ | チェック内容 |
|---------|-------------|
| **機能仕様** | 実装しようとしている機能は `docs/design.md` の機能一覧に存在するか？ |
| **DB設計** | 使用するテーブル・カラムは ER図/テーブル定義と一致しているか？ |
| **RLSポリシー** | データアクセスは RLS ポリシーの範囲内か？ |
| **画面設計** | 新規ページの URL は画面一覧のパターンに従っているか？ |
| **UIルール** | Tailwind クラスの並び順を守れるか？ |
| **スペーシング** | 余白は 4px 単位、8pt グリッドに従うか？ |
| **レスポンシブ** | モバイルファーストで実装できるか？ |

#### チェック結果の判断

- **すべて OK** → 実装を開始
- **不明点あり** → ユーザーに確認してから実装
- **設計書に記載なし** → 設計書の更新を提案してから実装

### 実装後の更新

機能実装が完了したら:

1. `docs/design.md` の該当機能の「状態」を「実装済」に更新
2. 新規コンポーネントを追加した場合は `docs/ui-guidelines.md` にパターンを追記（必要に応じて）

### 設計書の活用シーン

| シーン | 参照ドキュメント | 確認セクション |
|--------|-----------------|---------------|
| 新機能追加 | `docs/design.md` | 機能一覧、画面一覧 |
| DB操作 | `docs/design.md` | ER図、テーブル定義、RLSポリシー |
| 清算ロジック変更 | `docs/design.md` | 清算アルゴリズム |
| UI実装 | `docs/ui-guidelines.md` | 全セクション |
| スタイリング | `docs/ui-guidelines.md` | クラス並び順、スペーシング、カラー |
| レスポンシブ対応 | `docs/ui-guidelines.md` | レスポンシブデザイン |
