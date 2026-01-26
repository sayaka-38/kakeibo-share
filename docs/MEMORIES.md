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
- [x] Step 5-2: profiles テーブル RLS（SQL実行済み、バグ修正完了）
- [ ] Step 5-3: demo_sessions テーブル RLS
- [ ] Step 5-4: groups + group_members テーブル RLS
- [ ] Step 5-5: payments + payment_splits テーブル RLS

### 将来の機能要件

- [ ] 清算機能の実装検討
- [ ] デモデータ自動削除機能（24時間後）
- [ ] 通常ユーザーの支払い削除機能
- [ ] グループ別カテゴリの追加・編集 UI

---

## DBスキーマ（唯一の正解）

**2026-01-26 時点の本番DB構造。推測禁止、以下のみ使用可。**

| テーブル | カラム |
|---------|--------|
| `profiles` | id, display_name, email, avatar_url, is_demo, created_at, updated_at |
| `groups` | id, name, description, owner_id, invite_code, created_at, updated_at |
| `group_members` | id, group_id, user_id, role, created_at |
| `payments` | id, group_id, payer_id, category_id, amount, description, payment_date, created_at, updated_at |
| `payment_splits` | id, payment_id, user_id, amount, is_paid, created_at |
| `categories` | id, name, icon, color, is_default, group_id, created_at |
| `demo_sessions` | id, user_id, group_id, expires_at, created_at |

**注意**: マイグレーションファイル (001_initial_schema.sql) と実際のDBに差異あり。コードでは上記を正とする。

---

## セッション引き継ぎメモ

*次回セッション開始時に参照すべき事項*

### 現在のブランチ状態

- ブランチ: `feature/phase5-rls-setup`
- PR: #12（レビュー待ち）
- 作業ディレクトリ: 変更あり（Hydration修正、カラム名修正）

### Step 5-2: profiles RLS（実行済み）

```sql
-- 既存ポリシー削除
DROP POLICY IF EXISTS "profiles_select_all" ON profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;

-- SELECT: 認証済み + (自分自身 OR 同一グループメンバー)
CREATE POLICY "profiles_select_policy" ON profiles
FOR SELECT USING (
  auth.uid() IS NOT NULL
  AND (
    id = auth.uid()
    OR id IN (
      SELECT gm2.user_id
      FROM group_members gm1
      JOIN group_members gm2 ON gm1.group_id = gm2.group_id
      WHERE gm1.user_id = auth.uid()
    )
  )
);

-- UPDATE: 自分自身のみ
CREATE POLICY "profiles_update_policy" ON profiles
FOR UPDATE USING (id = auth.uid());

-- INSERT: 自分自身のみ
CREATE POLICY "profiles_insert_policy" ON profiles
FOR INSERT WITH CHECK (id = auth.uid());

-- DELETE: 誰も削除不可
CREATE POLICY "profiles_delete_policy" ON profiles
FOR DELETE USING (false);
```

### 今セッションで修正したバグ

1. **group_members.joined_at → created_at**: DBに存在しないカラム参照を修正
2. **Hydrationエラー**: `InviteLinkButton` の `navigator.share` 判定をクライアントサイドのみに変更
3. **toLocaleString**: ロケール指定 `"ja-JP"` を追加

### 仕様決定事項（継続）

- **エクセル方式**: 全支払い合計後に1回だけ切り捨て
- **Server Actions 禁止**: API Routes を使用
- **型安全性**: `as any` 禁止、Relationships 型で Join クエリ対応
- **RLS 段階的適用**: categories → profiles → demo_sessions → groups/group_members → payments/payment_splits
- **DBスキーマ**: 上記テーブル定義が唯一の正解、推測禁止
