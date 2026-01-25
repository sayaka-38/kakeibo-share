# MEMORIES.md - 開発進捗と記憶

このファイルは、セッションを跨いで開発の文脈を保持するための記録です。

---

## 最終更新日

2026-01-25（Phase 2-2 完了、PR #7 作成）

---

## 完了した機能

### Phase 2-2 最終 Step: Suspense スケルトン表示（今セッション完了）

- `RecentPaymentList`: 非同期サーバーコンポーネント
- グループ詳細ページで `Suspense` + `PaymentListSkeleton` 適用
- PR #7 作成: https://github.com/sayaka-38/kakeibo-share/pull/7

### Phase 2-2 Step 2-4: UIコンポーネント統合

**概要**: 作成したコンポーネントを実際のフォーム・一覧に統合。

| 統合内容 | 詳細 |
|---------|------|
| **PaymentListSkeleton** | 支払い一覧のスケルトンローディング |
| **Button → InlinePaymentForm** | 送信ボタンを 44px Button に置き換え |
| **AmountFieldWithKeypad** | NumericKeypad 統合の金額入力フィールド |

#### AmountFieldWithKeypad 機能

- フォーカス時に NumericKeypad 表示
- 確定キーでキーパッド閉じる
- 直接入力も可能（後方互換性）
- エラー表示対応

### Phase 2-2 Step 1: UIコンポーネント追加

**概要**: TDD で3つのUIコンポーネントを実装し、CLAUDE.md のワークフロールールを更新。

#### 実装コンポーネント

| コンポーネント | パス | 説明 | テスト件数 |
|---------------|------|------|-----------|
| **Skeleton** | `src/components/ui/Skeleton.tsx` | スケルトンローディング（3バリエーション） | 20件 |
| **Button** | `src/components/ui/Button.tsx` | 44pxタッチターゲット対応ボタン | 24件 |
| **NumericKeypad** | `src/components/ui/NumericKeypad.tsx` | 金額入力用カスタムキーパッド | 19件 |

#### Skeleton コンポーネント

- `Skeleton`: 基本スケルトン（サイズ、形状バリエーション）
- `SkeletonText`: テキスト用（行数、サイズ指定可能）
- `SkeletonCard`: カード形式のスケルトン

#### Button コンポーネント

- **タッチターゲット**: 全サイズで最小 44px (min-h-11) 確保
- **バリアント**: primary, secondary, ghost, danger
- **サイズ**: sm, md, lg
- **状態**: loading, disabled
- **アクセシビリティ**: aria-busy, disabled 対応

#### NumericKeypad コンポーネント

- 0-9 の数字キー
- 削除キー（バックスペース）
- 確定キー
- 44px タッチターゲット全キー対応
- maxLength 制限機能
- disabled 状態対応

#### CLAUDE.md 更新

- Git Strategy に「Step 開始時のブランチ作成」ルールを追加
- 新規 Step/Phase 開始時はブランチを切ることを必須化

#### i18n 更新

- `common.confirm` キーを追加（ja: "確定", en: "OK"）

### Server Actions → API Routes リファクタリング（前セッション完了）

**背景**: Server Actions で "Invalid Server Actions request" エラーが発生し、不安定な挙動が確認されたため、API Routes に移行。

- `/api/payments/delete` API Route 作成
- `DeletePaymentForm` コンポーネントを fetch 方式に変更
- CLAUDE.md に Server Actions 使用禁止ポリシー追加

### Phase 1-3: デモデータ削除保護機能

- `deleteDemoSession` 関数の実装
- 監査ログ機能
- エクスポート整理

### グループ招待・参加機能（PR #3 マージ済み）

- 招待リンクの生成と共有
- リンク経由でのグループ参加

---

## テスト状況

- **292件のテストがパス** ✅
- 全テスト合格（Phase 2-2 で +25件追加）

---

## 現在の課題

### 解決済み

- ~~Server Actions の不安定な挙動~~ → API Routes に移行で解決
- ~~schema-consistency.test.ts の失敗~~ → 解決済み

---

## 次のタスク

### Phase 2-2 完了 ✅

- [x] Step 1: 基本コンポーネント作成（Skeleton, Button, NumericKeypad）
- [x] Step 2-4: コンポーネント統合（PaymentListSkeleton, AmountFieldWithKeypad, Button適用）
- [x] Step 5: Suspense スケルトン表示（RecentPaymentList）
- [x] PR #7 作成

### Phase 2-3: 清算ロジック改善（次フェーズ候補）

現状: `/settlement` ページに基本実装済み

改善候補:
- [ ] 清算ロジックをビジネスロジック層に分離
- [ ] 清算計算のユニットテスト追加
- [ ] グループ詳細ページに清算サマリー表示
- [ ] 清算完了マーク機能

### 将来の機能要件

- [ ] 清算機能の実装検討
- [ ] デモデータ自動削除機能（24時間後）
- [ ] **通常ユーザーの支払い削除機能**: 自分が登録した支払いのみ削除可能にする
  - 必要な実装: `/api/payments/[id]` DELETE エンドポイント
  - バリデーション: `payer_id === user.id` のチェック
  - 現在のデモ削除ロジックとは別のフローで実装

---

## セッション引き継ぎメモ

*次回セッション開始時に参照すべき事項*

- 現在のブランチ: `feature/phase2-2-ui`（PR #7 作成済み）
- 次は PR マージ後、`main` から新ブランチを作成

### 今セッションの作業内容

1. **Phase 2-2 完了**
   - Step 1: 基本コンポーネント作成（Skeleton, Button, NumericKeypad）
   - Step 2-4: コンポーネント統合
   - Step 5: Suspense スケルトン表示
   - PR #7 作成

### Phase 2-2 で追加したファイル

| カテゴリ | ファイル |
|---------|---------|
| **UIコンポーネント** | `Skeleton.tsx`, `Button.tsx`, `NumericKeypad.tsx` |
| **支払い一覧** | `PaymentListSkeleton.tsx`, `RecentPaymentList.tsx` |
| **フォーム** | `AmountFieldWithKeypad.tsx` |
| **テスト** | 各コンポーネントのテスト（+25件） |

### 次のアクション

1. PR #7 のレビュー・マージ
2. Phase 2-3 着手（清算ロジック改善）または他の優先タスク
