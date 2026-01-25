# MEMORIES.md - 開発進捗と記憶

このファイルは、セッションを跨いで開発の文脈を保持するための記録です。

---

## 最終更新日

2026-01-25（Phase 2-2 Step 1-4 UIコンポーネント統合完了）

---

## 完了した機能

### Phase 2-2 Step 2-4: UIコンポーネント統合（今セッション完了）

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

- **286件のテストがパス** ✅
- 全テスト合格（+19件追加）

---

## 現在の課題

### 解決済み

- ~~Server Actions の不安定な挙動~~ → API Routes に移行で解決
- ~~schema-consistency.test.ts の失敗~~ → 解決済み

---

## 次のタスク

### Phase 2-2 継続作業

- [x] Step 2: スケルトンの実際の画面への適用（PaymentListSkeleton 作成）
- [x] Step 3: NumericKeypad を AmountField に統合（AmountFieldWithKeypad）
- [x] Step 4: Button コンポーネントの既存フォームへの適用（InlinePaymentForm）
- [ ] Step 5: Suspense でのスケルトン表示（サーバーコンポーネント対応）

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

- 現在のブランチ: `feature/phase2-2-ui`
- コミット済み、未プッシュの変更あり

### 今セッションの作業内容

1. **Phase 2-2 Step 1: 基本コンポーネント作成**
   - Skeleton, Button, NumericKeypad を TDD で作成

2. **Phase 2-2 Step 2-4: コンポーネント統合**
   - PaymentListSkeleton 作成
   - InlinePaymentForm に Button 統合
   - AmountFieldWithKeypad 作成（NumericKeypad 統合）

### 技術的ノート

| 項目 | 詳細 |
|------|------|
| **44px タッチターゲット** | Tailwind の `min-h-11` クラスで実現 |
| **スケルトン設計** | Composition パターンで柔軟に組み合わせ可能 |
| **NumericKeypad** | 先頭ゼロ防止、maxLength制限実装済み |
| **AmountFieldWithKeypad** | フォーカスでキーパッド表示、確定で閉じる |

### 変更ファイル一覧（Step 1-4 合計）

| ファイル | 変更内容 |
|---------|---------|
| `CLAUDE.md` | Step開始時ブランチ作成ルール追加 |
| `src/components/ui/Skeleton.tsx` | 新規作成 |
| `src/components/ui/Button.tsx` | 新規作成 |
| `src/components/ui/NumericKeypad.tsx` | 新規作成 |
| `src/components/payment-list/PaymentListSkeleton.tsx` | 新規作成 |
| `src/components/payment-form/fields/AmountFieldWithKeypad.tsx` | 新規作成 |
| `src/components/payment-form/InlinePaymentForm.tsx` | Button 統合 |
| `src/test/components/*.test.tsx` | 各コンポーネントのテスト追加 |
