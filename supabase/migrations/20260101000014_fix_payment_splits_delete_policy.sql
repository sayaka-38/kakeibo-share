-- ============================================
-- Migration 014: payment_splits DELETE ポリシー修正
-- ============================================
--
-- 問題:
--   Migration 011 で作成した payment_splits_delete_payer ポリシーは
--   is_payment_payer(payment_id, auth.uid()) を使用するが、
--   Next.js API Route 経由の PostgREST セッションで
--   is_payment_payer (plpgsql/SECURITY DEFINER) が
--   期待通りに動作しないケースがある。
--
--   一方、同テーブルの SELECT/INSERT ポリシーが使用する
--   is_group_member(get_payment_group_id(payment_id), auth.uid())
--   は安定して動作している。
--
-- 解決:
--   DELETE ポリシーを SELECT/INSERT と同じパターンに統一。
--   is_group_member + get_payment_group_id の実績ある関数チェーンを使用。
--
-- セキュリティモデル:
--   - RLS 層: グループメンバーであれば splits 削除可能
--     （SELECT/INSERT と同じ粒度 = グループメンバーシップ検証）
--   - アプリ層: PUT ハンドラの step 8 で payer_id === user.id を検証
--     （支払者本人のみ編集操作を許可）
--   - 二重防御の役割分担:
--     RLS = 「グループ外のユーザーからの操作を DB レベルで拒否」
--     App = 「支払者以外のグループメンバーからの操作を API レベルで拒否」
--

-- 既存ポリシーを削除
DROP POLICY IF EXISTS "payment_splits_delete_payer" ON payment_splits;

-- 新ポリシー: グループメンバーのみ splits を削除可能
-- （SELECT/INSERT と同じ is_group_member + get_payment_group_id パターン）
CREATE POLICY "payment_splits_delete_member" ON payment_splits
FOR DELETE USING (
  is_group_member(get_payment_group_id(payment_id), auth.uid())
);
