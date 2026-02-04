-- ============================================
-- Migration 012: is_payment_payer を plpgsql 化（インライン展開防止）
-- ============================================
--
-- 問題:
--   Migration 011 で作成した is_payment_payer() は LANGUAGE sql で定義。
--   PostgreSQL のオプティマイザが SQL 関数をインライン展開すると、
--   SECURITY DEFINER 属性が失われ、payments テーブルの RLS が
--   呼び出し元の権限で評価される可能性がある。
--
--   SET search_path = public で通常はインライン展開を防止できるが、
--   PostgreSQL のバージョンや設定によっては防止されないケースがある。
--
-- 修正:
--   LANGUAGE plpgsql に変更。plpgsql 関数は PostgreSQL で
--   インライン展開されないことが保証されている。
--   これにより SECURITY DEFINER が常に有効になり、
--   payments テーブルの RLS を確実にバイパスして payer_id を参照できる。
--
-- 依存:
--   - Migration 011: is_payment_payer() 関数、payment_splits_delete_payer ポリシー
--
-- 互換性:
--   - 関数シグネチャ（引数・戻り値）は変更なし
--   - 既存の payment_splits_delete_payer ポリシーはそのまま動作
--


-- ============================================
-- 1. is_payment_payer を plpgsql で再作成
-- ============================================
--
-- CREATE OR REPLACE により既存の関数を上書き。
-- 引数・戻り値は同一のため、依存するポリシーに影響なし。
--

CREATE OR REPLACE FUNCTION public.is_payment_payer(_payment_id UUID, _user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM payments WHERE id = _payment_id AND payer_id = _user_id
  );
END;
$$;


-- ============================================
-- 2. UNIQUE 制約の確認
-- ============================================
--
-- payment_splits(payment_id, user_id) の UNIQUE 制約は
-- 初期スキーマ（Migration 001）で既に定義済み。
-- 念のため冪等に追加を試みる（既存なら DO NOTHING）。
--
-- この制約により、PUT ハンドラの「全削除→再作成」で
-- 削除が RLS で拒否された場合、INSERT 時に
-- UNIQUE violation エラーが発生し、二重登録を DB レベルで防止する。
--

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'payment_splits'::regclass
    AND contype = 'u'
    AND conkey @> ARRAY[
      (SELECT attnum FROM pg_attribute WHERE attrelid = 'payment_splits'::regclass AND attname = 'payment_id'),
      (SELECT attnum FROM pg_attribute WHERE attrelid = 'payment_splits'::regclass AND attname = 'user_id')
    ]
  ) THEN
    ALTER TABLE payment_splits ADD CONSTRAINT payment_splits_payment_id_user_id_unique UNIQUE (payment_id, user_id);
    RAISE NOTICE 'UNIQUE constraint added on payment_splits(payment_id, user_id)';
  ELSE
    RAISE NOTICE 'UNIQUE constraint already exists on payment_splits(payment_id, user_id)';
  END IF;
END;
$$;


-- ============================================
-- 実行後の検証クエリ
-- ============================================
--
-- 1. 関数の言語が plpgsql に変更されたこと:
--    SELECT proname, prolang, prosecdef
--    FROM pg_proc p
--    JOIN pg_language l ON p.prolang = l.oid
--    WHERE proname = 'is_payment_payer';
--
--    期待: prolang = plpgsql のOID, prosecdef = true
--
-- 2. UNIQUE 制約の確認:
--    SELECT conname, contype
--    FROM pg_constraint
--    WHERE conrelid = 'payment_splits'::regclass AND contype = 'u';
--
--    期待: payment_splits_payment_id_user_id_key (or similar) | u
--
-- 3. 削除テスト（認証済みユーザーとして）:
--    -- payer として payment_splits を削除できること
--    DELETE FROM payment_splits WHERE payment_id = '<own-payment-id>';
--    -- 他人の payment_splits は削除できないこと
--    DELETE FROM payment_splits WHERE payment_id = '<other-payment-id>';
--
