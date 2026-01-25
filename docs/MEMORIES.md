# MEMORIES.md - 開発進捗と記憶

このファイルは、セッションを跨いで開発の文脈を保持するための記録です。

---

## 最終更新日

2026-01-25（Phase 2-3 Step 1-3 完了）

---

## 完了した機能

### Phase 2-3 Step 1-3: 清算ロジック分離（今セッション完了）

**概要**: 清算ロジックを `src/lib/settlement/` に分離し、TDD で実装。

#### 新規ファイル

| ファイル | 説明 |
|---------|------|
| `rounding.ts` | 端数処理（切り捨て + 未清算残高） |
| `calculate-balances.ts` | 残高計算 |
| `suggest-settlements.ts` | 清算提案（最小回数アルゴリズム） |
| `index.ts` | エクスポート |

#### 仕様変更

- **端数処理方針**: 特定個人に加算せず「切り捨て」
- **未清算残高**: 余りは次回清算に持ち越し

#### テスト追加

- `rounding.test.ts`: 21件
- `calculate-balances.test.ts`: 8件
- `suggest-settlements.test.ts`: 9件
- **合計**: 38件追加（プロジェクト合計 330件）

### Phase 2-2 最終 Step: Suspense スケルトン表示

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

### Phase 2-3 進行中 🚧

- [x] Step 1: 端数処理 (`rounding.ts`)
- [x] Step 2: 残高計算 (`calculate-balances.ts`)
- [x] Step 3: 清算提案 (`suggest-settlements.ts`)
- [ ] Step 4: 既存ページのリファクタリング（`settlement/page.tsx` を新ロジックに置き換え）
- [ ] Step 5: グループ詳細ページに清算サマリー表示
- [ ] Step 6: PR 作成

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

- 現在のブランチ: `feature/phase2-3-settlement`
- Phase 2-3 Step 1-3 完了、Step 4-6 残り

### 今セッションの作業内容

1. **Phase 2-3 Step 1-3 完了**
   - Step 1: 端数処理 (`rounding.ts`) - 21テスト
   - Step 2: 残高計算 (`calculate-balances.ts`) - 8テスト
   - Step 3: 清算提案 (`suggest-settlements.ts`) - 9テスト

### 仕様決定事項

- **端数処理**: 切り捨て（floor）
- **未清算残高**: 余りは `unsettledRemainder` として返却、次回に持ち越し

### 次のアクション

1. Step 4: `settlement/page.tsx` を新ロジックでリファクタリング
2. Step 5: グループ詳細ページに清算サマリー表示
3. Step 6: PR 作成
