# MEMORIES.md - 開発進捗と記憶

セッション間の文脈保持用。アーキテクチャ規約・DBスキーマは **CLAUDE.md** を参照。

---

## 最終更新日

2026-02-09

---

## 完了済み（1行サマリー）

| Phase | 内容 | PR |
|-------|------|----|
| Phase 1–6 | 基盤・UI・型安全・CI・RLS・CLI移行 | — |
| Phase A | 認証共通化・通貨フォーマット・環境変数厳格化 | #24 |
| 代理購入 + カスタム割勘 | splits参照方式・バリデーション・自動補完 | PR済 |
| 支払い削除/編集 | RESTful API + RPC原子的置換 | #29, 済 |
| 土台強化 | 認証ガード・isProxySplit共通化・CI permissions | #30 |
| Phase 7 | 清算エンジン完全実装 + 相殺統合 + ゾンビ修正 | #34, #36 |
| Phase 8 | 構造改善・支払い複製・完全日本語化・email NULL対応 | #38 |
| Phase 9A | テーマシステム基盤 — 5パレット・CSS変数・ThemeProvider | #39 |
| Phase 9B | UX磨き — デモBot・割り勘ガード・複製可視化・WCAGコントラスト | #40 |

テスト: 829件パス / ビルド正常 / Migration 025 まで push 済み

---

## 技術メモ（要点のみ）

- **PostgREST RLS DELETE バグ**: サーバーサイドからの DELETE で `auth.uid()` が NULL になりサイレント失敗。対策: SECURITY DEFINER RPC でバイパス（`replace_payment_splits` 等）
- **splits参照方式**: splits ありは各split.amount、なしはレガシー均等割り。端数は支払者吸収
- **代理購入判定**: `payer.amount === 0` + 他メンバーに全額割当パターンで推定（DBフラグなし）
- **認証ガード (proxy.ts)**: Next.js 16 は `middleware.ts` ではなく `proxy.ts`。公開パスホワイトリスト方式
- **清算エンジンAPI**: `/api/settlement-sessions`, `/api/settlement-entries`, `/api/recurring-rules`
- **末日対応**: `day_of_month = 31` → 2月は28/29日（`get_actual_day_of_month` ヘルパー）
- **後出しレシート**: `generate_settlement_entries` が `settlement_id IS NULL` の既存 payments を自動取り込み
- **email NULL**: profiles.email は NULL 可（匿名/デモユーザー）。表示時は `display_name || email || "Unknown"` のフォールバック必須
- **テーマ primary-text 分離**: `text-theme-primary-text` はテキスト専用（WCAG AA対応の暗色）、`bg-theme-primary` はボタン背景用（鮮やかな元色を維持）
- **デモ Bot RPC**: `create_demo_bot_partner` は SECURITY DEFINER で auth.users にBot挿入。失敗時はグレースフルに無視して続行

---

## 環境情報

- `.env.local`: リモートDB（Supabase hosted）優先
- ローカル Docker: Codespaces で不安定（リモート設定のまま開発継続）
- Migration 025 まで push 済み
- profiles.email: NOT NULL 制約解除済み（手動マイグレーション）

---

## 次のタスク

### Phase 10–11（将来）

- 清算準備室「個別調整」UI
- Suspense境界 / クエリ並列化 / 型安全ラッパー
