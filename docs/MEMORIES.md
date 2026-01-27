# MEMORIES.md - 開発進捗と記憶

このファイルは、セッションを跨いで開発の文脈を保持するための記録です。

---

## 最終更新日

2026-01-27（Phase 5-4 + 5-4b 完了）

---

## 完了した機能

### Step 5-4b: グループ削除機能（PR #18 レビュー待ち）

**概要**: オーナー限定のグループ削除機能を追加。

#### 新規ファイル

| ファイル | 説明 |
|---------|------|
| `src/app/api/groups/delete/route.ts` | グループ削除 API |
| `src/components/DeleteGroupButton.tsx` | 削除ボタン + 確認ダイアログ |

#### 機能詳細

- オーナーのみ削除可能（RLS + API 両方でチェック）
- 確認ダイアログで「他メンバーへの影響」を明示
- CASCADE で関連データ自動削除
- 削除成功後はグループ一覧へリダイレクト

**結果**: PR #18 作成、CI パス。

### Phase 5-4: groups + group_members RLS 強化（PR #17 マージ済み）

**概要**: groups/group_members テーブルの RLS を強化し、招待参加フローを API Route 経由に移行。

#### RLS ポリシー

| テーブル | SELECT | INSERT | UPDATE | DELETE |
|---------|--------|--------|--------|--------|
| groups | メンバーのみ | owner_id = 自分 | owner のみ | owner のみ |
| group_members | メンバーのみ | owner または自分自身 | - | owner または本人 |

#### 新規ファイル

| ファイル | 説明 |
|---------|------|
| `src/app/api/groups/join/route.ts` | 招待参加 API (service role 使用) |
| `src/lib/supabase/admin.ts` | Admin クライアント (service role) |
| `supabase/migrations/006_groups_rls.sql` | RLS ポリシー定義 |

#### 招待参加フロー改善

- クライアント直接アクセス → API Route 経由に変更
- 招待コード露出を防止（RLS で厳格に制限）
- 柔らかいエラーメッセージ表示
- 成功後の自動リダイレクト

**結果**: PR #17 マージ済み。

### Phase 5-3: demo_sessions RLS 強化（PR #15 マージ済み）

**概要**: demo_sessions テーブルの RLS を `expires_at` を活用して強化。

#### RLS ポリシー

| 操作 | ポリシー | 効果 |
|------|---------|------|
| SELECT | `user_id = auth.uid() AND expires_at > now()` | 期限切れデータの自動隔離 |
| INSERT | `user_id = auth.uid()` | 自分のセッションのみ作成可 |
| DELETE | `user_id = auth.uid()` | クリーンアップ処理を許可 |

#### マイグレーションファイル

`supabase/migrations/005_demo_sessions_rls.sql`

**結果**: PR #15 マージ完了。

### Phase 5-2: profiles RLS + バグ修正

**概要**: profiles テーブルの RLS 設定とHydrationエラー・カラム名不整合の修正。

#### DB 変更（Supabase で実行済み）

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

-- UPDATE/INSERT/DELETE ポリシーも設定済み
```

#### コード変更（PR #14）

| ファイル | 変更 |
|---------|------|
| `src/app/(protected)/groups/[id]/page.tsx` | `joined_at` → `created_at`、`toLocaleString("ja-JP")` |
| `src/components/InviteLinkButton.tsx` | `useSyncExternalStore` で Hydration 修正 |
| `src/components/payment-list/RecentPaymentList.tsx` | `toLocaleString("ja-JP")` |
| `src/types/query-results.ts` | `joined_at` → `created_at` |

**結果**: PR #13（RLS設定）、PR #14（バグ修正）マージ済み。

### Phase 5-1: categories RLS + カテゴリ選択機能

- categories テーブルの RLS 設定
- カテゴリ選択 UI の実装
- PR #12 マージ済み

### Phase 4: CI/CD 構築

- GitHub Actions による CI パイプライン（lint, typecheck, test, build）
- PR #11 マージ済み

### Phase 3-1: 型安全性強化とコードクリーンアップ

- `as any` 全排除、Relationships 型追加
- PR #9, #10 マージ済み

### Phase 2: UI コンポーネント統合 + エクセル方式

- Skeleton, Button, NumericKeypad 実装
- 清算計算をエクセル方式に変更

### Phase 1: 基盤構築

- Server Actions → API Routes リファクタリング
- デモデータ削除保護機能
- グループ招待・参加機能

---

## テスト状況

- **414件のテストがパス** ✅
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
- ~~Hydrationエラー~~ → `useSyncExternalStore` で解決
- ~~DBカラム名不整合~~ → 実際のDBスキーマに合わせて修正

---

## 次のタスク

### Phase 5: RLS 設定（継続）

- [x] Step 5-1: categories テーブル RLS + カテゴリ選択 UI（PR #12）
- [x] Step 5-2: profiles テーブル RLS（PR #13, #14）
- [x] Step 5-3: demo_sessions テーブル RLS（PR #15 マージ済み）
- [x] Step 5-4: groups + group_members テーブル RLS（PR #17 マージ済み）
- [x] Step 5-4b: グループ削除機能（PR #18 レビュー待ち）
- [ ] **Step 5-5: payments + payment_splits テーブル RLS** ← 次はここ

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

- ブランチ: `feature/groups-delete`
- PR: #18（レビュー待ち）
- 次の作業: PR マージ後、Step 5-5 へ進む

### Step 5-5: payments + payment_splits RLS（次に実行）

#### 対象テーブル

```
payments: id, group_id, payer_id, category_id, amount, description, payment_date, created_at, updated_at
payment_splits: id, payment_id, user_id, amount, is_paid, created_at
```

#### RLS 要件（設計書より）

| テーブル | SELECT | INSERT | UPDATE | DELETE |
|---------|--------|--------|--------|--------|
| payments | メンバーのみ | メンバーのみ | payer のみ | payer のみ |
| payment_splits | メンバーのみ | メンバーのみ | - | - |

#### 注意点

1. **グループメンバーシップ確認**: payments の group_id から group_members を JOIN
2. **payer 権限**: 支払いの編集・削除は支払者本人のみ
3. **デモデータ考慮**: is_demo フラグとの整合性

### 仕様決定事項（継続）

- **エクセル方式**: 全支払い合計後に1回だけ切り捨て
- **Server Actions 禁止**: API Routes を使用
- **型安全性**: `as any` 禁止、Relationships 型で Join クエリ対応
- **RLS 段階的適用**: categories → profiles → demo_sessions → groups/group_members → payments/payment_splits
- **DBスキーマ**: 上記テーブル定義が唯一の正解、推測禁止
