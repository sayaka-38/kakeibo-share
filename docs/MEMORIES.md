# MEMORIES.md - 開発進捗と記憶

このファイルは、セッションを跨いで開発の文脈を保持するための記録です。

---

## 最終更新日

2026-01-25（Phase 3-1 完了、Phase 4 プラン提示）

---

## 完了した機能

### Phase 3-1: 型安全性強化とコードクリーンアップ（今セッション完了）

**概要**: `as any` の全排除、Lint エラー解消、ロジック抽出、未使用コード削除。

#### Step 1: Database型にRelationships追加

| ファイル | 変更内容 |
|---------|---------|
| `src/types/database.ts` | `Relationships` 型を追加、Join クエリの型推論を有効化 |
| 全ページコンポーネント | `as any` を排除、型安全なクエリに変更 |

#### Step 2: Lint エラー修正

- エラー3件、警告12件を修正
- `@typescript-eslint/no-unused-vars` 対応
- 未使用 import の削除

#### Step 3: 割り勘計算ロジック集約

| ファイル | 説明 |
|---------|------|
| `src/lib/calculation/split.ts` | `calculateEqualSplit()` 関数を新規作成 |
| `FullPaymentForm.tsx` | ロジックを `split.ts` に委譲 |
| `GroupPaymentForm.tsx` | 同上 |

#### Step 4: 未使用コード削除

削除した型定義：
- `MemberWithRoleResult` (GroupMemberDetailResult と重複)
- `PaymentForSettlementResult` (未使用)
- `PaymentHistoryResult` (DashboardPaymentResult と重複)

**結果**: 47行削除、コードベースがクリーンに。

### Phase 2-3 Step 1-5: 清算ページリファクタリング + エクセル方式

**概要**: 計算ロジックを「エクセル方式」に変更し、端数誤差累積を解消。

#### エクセル方式の変更点

**問題**: 各支払いごとに端数切り捨て → 誤差が累積
```
従来: 1000円÷3人=333円×3=999円（1円ロス）× N回 = N円の誤差
```

**修正後**: 全支払い合計後に1回だけ切り捨て
```
エクセル方式: 全支払い合計 5166円 ÷ 2人 = 2583円（1回だけ切り捨て）
```

#### 修正内容

| ファイル | 変更内容 |
|---------|---------|
| `calculate-balances.ts` | `splits` を使わず全支払い合計から計算、最後に1回切り捨て |
| `FullPaymentForm.tsx` | `splitEqually` を削除、小数のまま保存（DECIMAL(12,2)対応） |
| `GroupPaymentForm.tsx` | 同上 |
| `settlement/page.tsx` | `payment_splits` クエリを削除、新ロジック適用 |

### Phase 2-2: UIコンポーネント統合

- Skeleton, Button, NumericKeypad コンポーネント実装
- AmountFieldWithKeypad 統合
- PaymentListSkeleton 適用

### Phase 1: 基盤構築

- Server Actions → API Routes リファクタリング
- デモデータ削除保護機能
- グループ招待・参加機能

---

## テスト状況

- **350件のテストがパス** ✅
- ビルド正常 ✅
- Lint エラーなし ✅

---

## 現在の課題

### 解決済み

- ~~Server Actions の不安定な挙動~~ → API Routes に移行で解決
- ~~`as any` の多用~~ → Database型にRelationships追加で解決
- ~~Lintエラー・警告~~ → 全件修正完了
- ~~端数誤差の累積~~ → エクセル方式で解決

---

## 次のタスク

### Phase 3-1 完了 ✅

- [x] Step 1: Database型にRelationships追加、as any 全排除
- [x] Step 2: Lint エラー修正
- [x] Step 3: 割り勘計算ロジック集約
- [x] Step 4: 未使用コード削除
- [ ] Step 5: PR 作成（未push: 1コミット）

### Phase 4: 自動テストの強化と CI/CD 構築（プラン承認待ち）

- [ ] Step 4-1: `.github/workflows/ci.yml` 作成
- [ ] Step 4-2: `typecheck` / `test:coverage` スクリプト追加
- [ ] Step 4-3: Vitest カバレッジ設定

### 将来の機能要件

- [ ] 清算機能の実装検討
- [ ] デモデータ自動削除機能（24時間後）
- [ ] 通常ユーザーの支払い削除機能

---

## セッション引き継ぎメモ

*次回セッション開始時に参照すべき事項*

### 現在のブランチ状態

- ブランチ: `feature/phase3-1-typed-supabase`
- 未push コミット: 1件（`chore: 未使用の型定義 3件を削除`）
- 作業ディレクトリ: クリーン

### Phase 4 CI/CD プラン（提示済み・承認待ち）

```yaml
# .github/workflows/ci.yml の構成
jobs:
  lint:      # ESLint
  typecheck: # tsc --noEmit
  test:      # Vitest + coverage
  build:     # Next.js build (depends on above)
```

**必要な GitHub Secrets:**
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### 仕様決定事項（継続）

- **エクセル方式**: 全支払い合計後に1回だけ切り捨て
- **Server Actions 禁止**: API Routes を使用
- **型安全性**: `as any` 禁止、Relationships 型で Join クエリ対応
