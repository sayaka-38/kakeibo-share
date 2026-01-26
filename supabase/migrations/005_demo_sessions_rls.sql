-- ============================================
-- Phase 5-3: demo_sessions テーブル RLS 強化
-- expires_at を活用したセキュリティ設計
-- ============================================

-- 1. 既存ポリシーを削除
DROP POLICY IF EXISTS "demo_sessions_select_own" ON demo_sessions;
DROP POLICY IF EXISTS "demo_sessions_insert_own" ON demo_sessions;
DROP POLICY IF EXISTS "demo_sessions_delete_own" ON demo_sessions;

-- 2. SELECT: 自分のセッション かつ 有効期限内のみ
--    → 期限切れセッションへのアクセスをDB層で完全ブロック
CREATE POLICY "demo_sessions_select_policy" ON demo_sessions
FOR SELECT USING (
  user_id = auth.uid()
  AND expires_at > now()
);

-- 3. INSERT: 自分のセッションのみ（期限チェックなし）
--    → 新規セッション作成を許可
CREATE POLICY "demo_sessions_insert_policy" ON demo_sessions
FOR INSERT WITH CHECK (
  user_id = auth.uid()
);

-- 4. DELETE: 自分のセッションのみ（期限不問）
--    → 期限切れセッションのクリーンアップを許可
CREATE POLICY "demo_sessions_delete_policy" ON demo_sessions
FOR DELETE USING (
  user_id = auth.uid()
);

-- 注: UPDATE ポリシーは不要（デモセッションは更新しない設計）
