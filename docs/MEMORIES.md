# MEMORIES.md - 開発進捗と記憶

このファイルは、セッションを跨いで開発の文脈を保持するための記録です。

---

## 最終更新日

2026-01-25（Server Actions → API Routes リファクタリング完了）

---

## 完了した機能

### Server Actions → API Routes リファクタリング（今セッション完了）

**背景**: Server Actions で "Invalid Server Actions request" エラーが発生し、不安定な挙動が確認されたため、API Routes に移行。

- **`/api/payments/delete` API Route 作成**（`src/app/api/payments/delete/route.ts`）
  - POST リクエストで支払い削除を処理
  - 認証チェック、デモデータ保護を統合

- **`DeletePaymentForm` コンポーネント更新**（`src/components/DeletePaymentButton.tsx`）
  - Server Action 呼び出し → `fetch` による API 呼び出しに変更
  - `useRouter().refresh()` でページ更新

- **CLAUDE.md に新ポリシー追加**
  - 「堅実な技術選択（Proven Patterns First）」セクション追加
  - **Server Actions 使用禁止**、API Routes 推奨を明記

- **未使用ファイル削除**
  - `src/app/(protected)/payments/actions.ts` 削除

- **テスト更新**
  - `DeletePaymentButton.test.tsx` を API Route 方式に対応

### Phase 1-3: デモデータ削除保護機能

- `deleteDemoSession` 関数の実装
- 監査ログ機能
- エクスポート整理

### グループ招待・参加機能（PR #3 マージ済み）

- 招待リンクの生成と共有
- リンク経由でのグループ参加

### DBスキーマ整合性の修正

- カラム名の統一
- TypeScript型定義とDBスキーマの整合性確保

---

## テスト状況

- **204件のテストがパス** ✅
- 全テスト合格

---

## 現在の課題

### 解決済み

- ~~Server Actions の不安定な挙動~~ → API Routes に移行で解決
- ~~schema-consistency.test.ts の失敗~~ → 解決済み

---

## 次のタスク

### 継続作業

- [ ] Phase 2-2: UI/UX最適化の継続
- [ ] 清算機能の実装検討
- [ ] デモデータ自動削除機能（24時間後）

### 将来の機能要件

- [ ] **通常ユーザーの支払い削除機能**: 自分が登録した支払いのみ削除可能にする
  - 必要な実装: `/api/payments/[id]` DELETE エンドポイント
  - バリデーション: `payer_id === user.id` のチェック
  - 現在のデモ削除ロジックとは別のフローで実装

---

## セッション引き継ぎメモ

*次回セッション開始時に参照すべき事項*

- 現在のブランチ: `refactor/api-routes-stabilization`
- コミット済み、未プッシュの変更あり

### 今セッションの作業内容

1. **Server Actions 問題の調査と解決**
   - "Invalid Server Actions request" エラーが発生
   - 複数のアプローチを試行（インライン定義、props渡し等）
   - 最終的に API Routes に移行して解決

2. **CLAUDE.md の更新**
   - 「堅実な技術選択」ポリシーを追加
   - Server Actions 禁止、API Routes 推奨を明文化

3. **テスト更新**
   - `DeletePaymentButton.test.tsx` を新しい実装に対応

### 技術的教訓

| 項目 | 学び |
|------|------|
| **Server Actions** | Next.js 16 + React 19 環境で不安定。本番では避けるべき |
| **API Routes** | 実績があり、デバッグしやすく、安定している |
| **移行パターン** | `fetch` + `router.refresh()` で同等のUXを実現可能 |

### 変更ファイル一覧

| ファイル | 変更内容 |
|---------|---------|
| `CLAUDE.md` | 堅実な技術選択ポリシー追加 |
| `src/app/api/payments/delete/route.ts` | 新規作成 |
| `src/components/DeletePaymentButton.tsx` | API Route 方式に変更 |
| `src/app/(protected)/payments/actions.ts` | 削除 |
| `src/test/components/DeletePaymentButton.test.tsx` | テスト更新 |
