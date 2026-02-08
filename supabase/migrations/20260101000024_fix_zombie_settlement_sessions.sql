-- ============================================================================
-- Fix: ゾンビ清算セッション解消
-- ============================================================================
-- 問題: confirm_settlement_receipt が対象セッションのみを settled にし、
--       同グループの統合済み旧セッション（pending_payment）が取り残される。
--       confirm ルートの統合処理も PostgREST 経由で実行されるため、
--       RLS やサイレント失敗により旧セッションが更新されないケースがある。
--
-- 修正:
--   1. confirm_settlement_receipt: 同グループの全 pending_payment セッションを
--      一括で settled に更新（ベルトアンドサスペンダー方式）
--   2. settle_consolidated_sessions: 統合済みセッション一括更新用 RPC
--      （confirm ルートの TypeScript コードから呼び出し）
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. confirm_settlement_receipt 修正版
-- ----------------------------------------------------------------------------
-- 変更点: 対象セッション + 同グループの他の pending_payment セッションを
--         すべて settled に更新する
CREATE OR REPLACE FUNCTION confirm_settlement_receipt(
    p_session_id UUID,
    p_user_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_session RECORD;
BEGIN
    -- セッション情報を取得
    SELECT ss.*
    INTO v_session
    FROM settlement_sessions ss
    WHERE ss.id = p_session_id;

    IF NOT FOUND THEN
        RETURN -1;
    END IF;

    -- メンバーシップ確認
    IF NOT EXISTS (
        SELECT 1 FROM group_members
        WHERE group_id = v_session.group_id AND user_id = p_user_id
    ) THEN
        RETURN -2;
    END IF;

    -- pending_payment 状態確認
    IF v_session.status != 'pending_payment' THEN
        RETURN -3;
    END IF;

    -- 対象セッションを清算完了
    UPDATE settlement_sessions
    SET
        status = 'settled',
        settled_at = now(),
        settled_by = p_user_id
    WHERE id = p_session_id;

    -- 同グループの他の pending_payment セッションも一括で settled に更新
    -- net_transfers を空にして「統合済み」であることを示す
    -- （統合済みセッションのゾンビ化を防止）
    UPDATE settlement_sessions
    SET
        status = 'settled',
        settled_at = now(),
        settled_by = p_user_id,
        net_transfers = '[]'::JSONB
    WHERE group_id = v_session.group_id
      AND status = 'pending_payment'
      AND id != p_session_id;

    RETURN 1;
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. settle_consolidated_sessions: 統合済みセッション一括更新 RPC
-- ----------------------------------------------------------------------------
-- confirm ルートの TypeScript コードから呼び出すための SECURITY DEFINER RPC。
-- PostgREST 経由の UPDATE が RLS でサイレントに失敗する問題を回避する。
--
-- 戻り値: 更新した行数
CREATE OR REPLACE FUNCTION settle_consolidated_sessions(
    p_session_ids UUID[],
    p_user_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_updated INTEGER;
BEGIN
    UPDATE settlement_sessions
    SET
        status = 'settled',
        settled_at = now(),
        settled_by = p_user_id,
        net_transfers = '[]'::JSONB
    WHERE id = ANY(p_session_ids)
      AND status = 'pending_payment';

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RETURN v_updated;
END;
$$;

-- コメント
COMMENT ON FUNCTION confirm_settlement_receipt IS '受取確認で清算完了。同グループの全 pending_payment セッションも一括 settled（ゾンビ防止）';
COMMENT ON FUNCTION settle_consolidated_sessions IS '統合済みセッションを一括で settled に更新（SECURITY DEFINER で RLS バイパス）';

-- ----------------------------------------------------------------------------
-- 3. 既存ゾンビセッションの一括クリーンアップ
-- ----------------------------------------------------------------------------
-- 同グループ内に settled セッションが存在するのに pending_payment のまま
-- 取り残されたセッション（ゾンビ）を一括で settled に更新する。
-- net_transfers を空にして「統合済み」であることを示す。
UPDATE settlement_sessions AS zombie
SET
    status = 'settled',
    settled_at = now(),
    settled_by = zombie.created_by,
    net_transfers = '[]'::JSONB
WHERE zombie.status = 'pending_payment'
  AND EXISTS (
      SELECT 1
      FROM settlement_sessions AS newer
      WHERE newer.group_id = zombie.group_id
        AND newer.status = 'settled'
        AND newer.created_at > zombie.created_at
  );
