# CLAUDE.md - Kakeibo Share 開発ガイド

## プロジェクト概要

**Kakeibo Share** は、ルームシェアやパートナーと家計を共有し、清算処理を行うためのWebアプリケーションです。

### 技術スタック

| カテゴリ | 技術 |
|---------|------|
| Frontend | Next.js 16 (App Router), TypeScript |
| Styling | Tailwind CSS v4 |
| Database & Auth | Supabase (PostgreSQL) |
| Testing | Vitest, React Testing Library |
| Package Manager | npm |

## よく使うコマンド

```bash
npm run dev       # 開発サーバー起動
npm run build     # プロダクションビルド
npm run lint      # ESLint 実行
npm run test      # テスト実行（ウォッチモード）
npm run test:run  # テスト実行（単発）
```

### Supabase CLI コマンド

```bash
npm run db:start          # ローカル Supabase 起動（Docker）
npm run db:stop           # ローカル Supabase 停止
npm run db:reset          # ローカル DB リセット（全マイグレーション再適用）
npm run db:gen-types      # TypeScript 型定義を自動生成（database.generated.ts）
npm run db:migration:new  # 新規マイグレーションファイル作成
npm run db:diff           # ローカル DB と最新マイグレーションの差分表示
```

### 型定義のファイル構成

| ファイル | 役割 | 編集 |
|---------|------|------|
| `src/types/database.generated.ts` | Supabase CLI で自動生成 | **手動編集禁止** |
| `src/types/database.ts` | ヘルパー型・リテラル型オーバーライド | 手動編集可 |

型を更新する際は `npm run db:gen-types` を実行し、`database.generated.ts` をコミットすること。

## プロジェクト構造

```
src/
├── app/                    # App Router ページ
│   ├── (protected)/        # 認証必須ページ
│   ├── auth/               # 認証コールバック
│   ├── login/              # ログイン
│   └── signup/             # サインアップ
├── components/             # 再利用可能なコンポーネント
├── lib/
│   ├── i18n/               # 国際化（翻訳関数）
│   └── supabase/           # Supabase クライアント
├── locales/                # 辞書ファイル（ja.json, en.json）
├── test/                   # テストファイル
└── types/                  # 型定義
```

---

## 開発哲学

このプロジェクトで守るべき3つの原則：

### 1. モバイルアプリのような高速な操作感

- **即時フィードバック**: ボタン押下後は即座に視覚的変化を与える（loading状態、disabled化）
- **楽観的UI更新**: 可能な場合はサーバー応答を待たずにUIを先行更新
- **最小限の画面遷移**: モーダルやインライン編集を活用し、ページ遷移を減らす
- **スケルトンローディング**: 空白画面を見せない

### 2. ルームメイトに配慮したUI表現

- **非攻撃的な言葉選び**: 「未払い」より「清算待ち」、「借金」より「立替」
- **金額の見せ方**: 赤字表示は最小限に、ポジティブな表現を優先
- **プライバシー配慮**: 個人の支出パターンが他メンバーに過度に見えないよう設計
- **公平性の可視化**: 誰かが損している印象を与えない清算提案

### 3. オブジェクト指向を意識したクリーンなコード

- **単一責任**: 1ファイル1責任、関数は1つのことだけを行う
- **依存性の方向**: UI → ビジネスロジック → データアクセス の一方向
- **型による制約**: `string` より `"owner" | "member"` のようなリテラル型
- **副作用の分離**: 純粋関数と副作用を持つ関数を明確に分ける

### 4. 堅実な技術選択（Proven Patterns First）

**Server Actions は使用禁止。API Routes を優先する。**

Next.js の Server Actions は開発体験において不安定な挙動（"Invalid Server Actions request" エラー等）が確認されているため、本プロジェクトでは使用しない。

| パターン | 採用可否 | 理由 |
|---------|---------|------|
| **API Routes** (`app/api/*/route.ts`) | ✅ 推奨 | 実績があり、デバッグしやすく、挙動が予測可能 |
| **Server Actions** (`"use server"`) | ❌ 禁止 | 不安定な挙動が確認されており、トラブルシュートが困難 |
| **Client-side fetch** | ✅ 推奨 | API Routes と組み合わせて使用 |

**API Route の標準パターン:**
```typescript
// src/app/api/[resource]/[action]/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ビジネスロジック実行
  // ...

  return NextResponse.json({ success: true });
}
```

**Client Component からの呼び出し:**
```typescript
const response = await fetch("/api/resource/action", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(data),
});
```

---

## テスト駆動開発（TDD）

### 基本方針：異常系ファースト

**重要**: 新機能を実装する際は、正常系より先に異常系（バリデーションエラー）のテストを書く。

```typescript
// 1. まず異常系のテストを書く
describe("PaymentForm validation", () => {
  it("金額が0以下の場合エラーを表示する", () => { ... });
  it("金額が100万円を超える場合エラーを表示する", () => { ... });
  it("未来の日付の場合エラーを表示する", () => { ... });
  it("説明が空の場合エラーを表示する", () => { ... });
});

// 2. その後に正常系を書く
describe("PaymentForm submission", () => {
  it("有効な入力で支払いを登録できる", () => { ... });
});
```

### テストの優先順位

1. **バリデーションエラー** - ユーザー入力の境界値
2. **認証・認可エラー** - 権限チェック
3. **ネットワークエラー** - API失敗時のハンドリング
4. **正常系** - 期待通りの動作

---

## Development Workflow（3つの開発コアテーマ）

以下の3つのテーマは**厳格なルール**として遵守すること。

### 1. 品質重視（Strict TDD）

**Red-Green-Refactor サイクルの徹底**

| フェーズ | 内容 |
|---------|------|
| **Red** | 実装前に必ず vitest を用いたテストコードを先行作成し、テストが**失敗することを確認**する |
| **Green** | テストを通すための**最小限の実装**のみを行う |
| **Refactor** | テストが通った後、リファクタリング案を**必ず提示**する |

```bash
# TDD サイクルの実行例
npm run test:run -- --watch  # テストをウォッチモードで実行しながら開発
```

**禁止事項:**
- テストを書かずに実装を開始すること
- 最初からテストが通る状態で実装すること（Red フェーズのスキップ）
- リファクタリングの検討を省略すること

### 2. 協調型承認フロー（Human-in-the-Loop）

**独断での進行を禁止する場面:**

| 場面 | 必須アクション |
|------|---------------|
| **ファイルの新規作成** | プランを提示し、ユーザーの承認を得る |
| **破壊的な変更**（既存機能の削除・大幅な変更） | 影響範囲を説明し、ユーザーの承認を得る |
| **アーキテクチャの決定**（新技術導入、設計パターン変更） | 選択肢とトレードオフを提示し、ユーザーの承認を得る |

**フロー:**
```
1. 変更内容のプランを提示
2. ユーザーの承認を待つ
3. 承認後に実装を開始
```

### 3. 自律型ツールの活用（Autonomous Automation）

以下のツールを**積極的かつ自律的に**活用すること:

| ツール | 活用場面 |
|--------|---------|
| **GitHub CLI (`gh`)** | PR作成、Issue管理、リポジトリ状態の確認 |
| **MCP ツール** | 外部ドキュメントの参照、API連携 |
| **自動化スクリプト** | 繰り返しタスクの効率化、CI/CDパイプラインの活用 |

**推奨行動:**
- `git status` / `git diff` でリポジトリの状態を常に把握
- 外部ドキュメントやAPIリファレンスを積極的に参照
- 手作業で繰り返す処理は自動化を検討

### 4. 記憶の保持（Memory Persistence）

**セッションを跨いだ文脈維持のためのルール:**

| タイミング | 必須アクション |
|-----------|---------------|
| **作業の区切り** | `docs/MEMORIES.md` を更新し、完了した作業を記録 |
| **セッション終了前** | 進捗、残課題、次のタスクを `docs/MEMORIES.md` に自律的に記録 |
| **セッション開始時** | `docs/MEMORIES.md` を読み、前回の文脈を把握してから作業開始 |

**記録すべき内容:**
- 完了した機能・修正の概要
- 残っている課題や未解決の問題
- 次に着手すべきタスクの優先順位
- セッション引き継ぎに必要な文脈情報

**重要:** この記録は**自律的に**行うこと。ユーザーからの指示を待たず、区切りのタイミングで主体的に更新する。

### 5. Git Strategy

| ルール | 説明 |
|--------|------|
| **ブランチ命名** | 新機能: `feature/xxx`、バグ修正: `fix/xxx` |
| **main への直接プッシュ禁止** | 必ず feature/fix ブランチから PR を作成 |
| **マージ前の確認** | テスト通過、レビュー承認を経てマージ |
| **Step 開始時のブランチ作成** | 新しい Step や Phase を開始する際は、必ず専用のブランチを作成してから作業を開始する |

**ブランチ作成タイミング:**
```
Phase/Step 開始時 → git checkout -b feature/phaseX-Y-description
```

**禁止事項:**
- `main` ブランチへの直接コミット・プッシュ（例外なし）
- レビューなしでのマージ
- Step 開始時にブランチを切らずに作業を進めること

**ブランチ保持ルール:**
- PR マージ後は混乱を防ぐため古いブランチを削除する
- ただし **1 世代前（直近）の作業ブランチは削除せず残す**（緊急切り戻し用）
- それより古いブランチから順に掃除する

**ドキュメント更新ルール:**
- `MEMORIES.md` や `CLAUDE.md` などドキュメントのみの更新も、作業ブランチ内でコミットし **PR 経由でマージ**する
- セッション終了時の `MEMORIES.md` 記録は、その時点の作業ブランチにコミット・プッシュすればよい

### 6. Demo Mode Policy（本番常設型デモ）

本番環境に常設する「デモ体験機能」の運用ルール：

| ルール | 説明 |
|--------|------|
| **is_demo フラグ** | デモデータは `demo_sessions` テーブルで管理し、本番データと論理分離 |
| **削除保護** | 削除ロジックは `demo_sessions` に紐づくデータのみ対象。非デモデータを巻き込まない厳格なバリデーション必須 |
| **自動削除** | デモデータは 24 時間後に自動削除（将来実装予定） |
| **表現の配慮** | 「デモデータは自動的にリセットされます」など、柔らかい表現で注釈 |

**デモデータの構造:**
```
demo_sessions
├── user_id  → 匿名ユーザー（profiles.is_demo = true）
├── group_id → デモ用グループ
└── expires_at → 有効期限（24時間後）
```

**削除時の必須チェック:**
```typescript
// Good: デモデータのみ削除
if (!session.is_demo) {
  throw new Error("Cannot delete non-demo data");
}

// Bad: フラグチェックなしで削除
await supabase.from("groups").delete().eq("id", groupId);
```

---

## 設計ドキュメント

| ドキュメント | パス | 内容 |
|-------------|------|------|
| **設計書** | `docs/design.md` | 機能仕様、DB設計、バリデーション定義、清算アルゴリズム |
| **UI ガイドライン** | `docs/ui-guidelines.md` | スペーシング、カラー、コンポーネントパターン |
| **開発記憶** | `docs/MEMORIES.md` | 進捗状況、課題、次のタスク、セッション引き継ぎメモ |

---

## 実装前チェックリスト

すべての実装タスクを開始する前に確認：

| チェック項目 | 確認内容 |
|-------------|---------|
| **TDD手順** | テストコードを先に書いているか？Red-Green-Refactorを守っているか？ |
| **機能仕様** | `docs/design.md` の機能一覧に存在するか？ |
| **DB設計** | テーブル・カラムはER図と一致しているか？ |
| **バリデーション** | `docs/design.md` のバリデーション定義に従っているか？ |
| **RLSポリシー** | データアクセスはRLSポリシーの範囲内か？ |
| **承認フロー** | 新規ファイル作成や破壊的変更の場合、ユーザー承認を得たか？ |

**判断基準:**
- すべてOK → 実装開始
- 不明点あり → ユーザーに確認
- 設計書に記載なし → 設計書の更新を提案

---

## Supabase 固有の注意点

### クライアント使い分け

```typescript
// Server Component
import { createClient } from "@/lib/supabase/server";

// Client Component
import { createClient } from "@/lib/supabase/client";
```

### リレーションクエリの型エラー対処

```typescript
type ResultType = { id: string; name: string };

const { data } = (await supabase
  .from("table")
  .select("id, name")) as { data: ResultType[] | null };
```

---

## 環境変数

```bash
# .env.local
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

---

## セキュリティポリシー（共通規律）

dotfiles (`~/.claude/config.json`) で定義された禁止操作：

| カテゴリ | 禁止操作 |
|---------|---------|
| **システム操作** | `sudo`, `rm`, `rm -rf` |
| **機密ファイル読取** | `.env*`, `id_rsa`, `id_ed25519`, `*token*`, `*key*` |
| **機密ファイル書込** | `.env*`, `secrets/**` |
| **ネットワーク** | `curl`, `wget`, `nc` |
| **パッケージ削除** | `npm uninstall`, `npm remove` |
| **データベース直接操作** | `psql`, `mysql`, `mongod`, `mcp__supabase__execute_sql` |

**重要:** これらの操作が必要な場合は、必ずユーザーの明示的な承認を得ること。

---

## セッション終了時のプロセス (Termination Process)

ユーザーが `/done` と入力、あるいはセッションの終了を意図した発言をした場合、エンジニアとして以下の「引き継ぎドキュメント作成」を自動的に実行してください。

1. **MEMORIES.md の同期更新**
   - **完了した作業**: 今セッションの全変更内容を具体的に記録。
   - **ペンディング事項**: 中断したタスクや、次回のセッションですぐに着手すべきことを箇条書きで。
   - **技術的文脈**: 新しく導入した設計（例：Compositionパターン）や注意点を追記。

2. **終了サマリのチャット提示**
   - 完了・未完了・次の一手を、一目でわかる「チェックリスト形式」で提示。

3. **クリーンアップ確認**
   - 全テストがパスしているか、コミット漏れがないかを最終確認し、「引き継ぎ準備完了」を報告。