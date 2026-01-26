# MEMORIES.md - 開発進捗と記憶

このファイルは、セッションを跨いで開発の文脈を保持するための記録です。

---

## 最終更新日

2026-01-26（Phase 5-1 RLS + カテゴリ機能完了、PR #12 作成）

---

## 完了した機能

### Phase 5-1: categories RLS + カテゴリ選択機能（今セッション完了）

**概要**: categories テーブルの RLS 設定とカテゴリ選択 UI の実装。

#### DB 変更（Supabase で実行済み）

```sql
-- カラム追加
ALTER TABLE categories ADD COLUMN is_default BOOLEAN DEFAULT false;
ALTER TABLE categories ADD COLUMN group_id UUID REFERENCES groups(id);
UPDATE categories SET is_default = true;

-- RLS 有効化 + ポリシー
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "categories_select_policy" ON categories
FOR SELECT USING (
  is_default = true
  OR group_id IN (SELECT group_id FROM group_members WHERE user_id = auth.uid())
);
```

#### コード変更

| ファイル | 変更 |
|---------|------|
| `src/types/database.ts` | categories に `is_default`, `group_id` 追加 |
| `src/components/payment-form/hooks/usePaymentForm.ts` | `categoryId` を PaymentFormData に追加 |
| `src/components/payment-form/InlinePaymentForm.tsx` | カテゴリ選択セレクトボックス追加 |
| `src/components/GroupPaymentForm.tsx` | カテゴリ受け取り・保存、二重メッセージ修正 |
| `src/app/(protected)/groups/[id]/page.tsx` | カテゴリ取得・渡し処理追加 |

**結果**: PR #12 作成。

### Phase 4: CI/CD 構築

- GitHub Actions による CI パイプライン（lint, typecheck, test, build）
- PR #11 マージ済み

### Phase 3-1: 型安全性強化とコードクリーンアップ

- `as any` 全排除、Relationships 型追加
- Lint エラー修正、未使用コード削除
- PR #9, #10 マージ済み

### Phase 2: UI コンポーネント統合 + エクセル方式

- Skeleton, Button, NumericKeypad 実装
- 清算計算をエクセル方式に変更（端数誤差解消）

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
- ~~カテゴリ選択がない~~ → InlinePaymentForm に追加
- ~~二重成功メッセージ~~ → GroupPaymentForm から削除

---

## 次のタスク

### Phase 5: RLS 設定（継続）

- [x] Step 5-1: categories テーブル RLS + カテゴリ選択 UI（PR #12）
- [ ] Step 5-2: profiles テーブル RLS
- [ ] Step 5-3: demo_sessions テーブル RLS
- [ ] Step 5-4: groups + group_members テーブル RLS
- [ ] Step 5-5: payments + payment_splits テーブル RLS

### 将来の機能要件

- [ ] 清算機能の実装検討
- [ ] デモデータ自動削除機能（24時間後）
- [ ] 通常ユーザーの支払い削除機能
- [ ] グループ別カテゴリの追加・編集 UI

---

## セッション引き継ぎメモ

*次回セッション開始時に参照すべき事項*

### 現在のブランチ状態

- ブランチ: `feature/phase5-rls-setup`
- PR: #12（レビュー待ち）
- 作業ディレクトリ: クリーン

### Step 5-2: profiles RLS（次に実行する SQL）

```sql
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_policy" ON profiles
FOR SELECT USING (
  id = auth.uid()
  OR id IN (
    SELECT gm2.user_id
    FROM group_members gm1
    JOIN group_members gm2 ON gm1.group_id = gm2.group_id
    WHERE gm1.user_id = auth.uid()
  )
);

CREATE POLICY "profiles_update_policy" ON profiles
FOR UPDATE USING (
  id = auth.uid()
);

CREATE POLICY "profiles_insert_policy" ON profiles
FOR INSERT WITH CHECK (
  id = auth.uid()
);
```

### 仕様決定事項（継続）

- **エクセル方式**: 全支払い合計後に1回だけ切り捨て
- **Server Actions 禁止**: API Routes を使用
- **型安全性**: `as any` 禁止、Relationships 型で Join クエリ対応
- **RLS 段階的適用**: categories → profiles → demo_sessions → groups/group_members → payments/payment_splits
