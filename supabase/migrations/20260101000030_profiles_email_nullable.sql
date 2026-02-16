-- ============================================
-- Migration 030: profiles.email を NULL 許容に変更
-- ============================================
-- 理由:
--   - anonymize_user RPC が email = NULL を設定する（退会匿名化）
--   - create_demo_bot_partner が email なしの匿名ユーザーを作成する
--   - 初期スキーマ（001）では NOT NULL だったが、上記の機能追加により
--     NULL 許容が必要になった
--
-- UNIQUE 制約は維持（PostgreSQL は UNIQUE カラムに複数 NULL を許可）

ALTER TABLE profiles ALTER COLUMN email DROP NOT NULL;
