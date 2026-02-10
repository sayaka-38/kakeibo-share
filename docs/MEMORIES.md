# MEMORIES.md - 開発進捗と記憶

セッション間の文脈保持用。アーキテクチャ規約・DBスキーマは **CLAUDE.md** を参照。

---

## 最終更新日

2026-02-10

---

## 完了済み（1行サマリー）

| Phase | 内容 | PR |
|-------|------|----|
| Phase 1–6 | 基盤・UI・型安全・CI・RLS・CLI移行 | — |
| Phase A | 認証共通化・通貨フォーマット・環境変数厳格化 | #24 |
| 代理購入 + カスタム割勘 | splits参照方式・バリデーション・自動補完 | 済 |
| 支払い削除/編集 | RESTful API + RPC原子的置換 | #29 |
| 土台強化 | 認証ガード・isProxySplit共通化・CI permissions | #30 |
| Phase 7 | 清算エンジン完全実装 + 相殺統合 + ゾンビ修正 | #34, #36 |
| Phase 8 | 構造改善・支払い複製・完全日本語化・email NULL対応 | #38 |
| Phase 9A | テーマシステム基盤 — 5パレット・CSS変数・ThemeProvider | #39 |
| Phase 9B | UX磨き — デモBot・割り勘ガード・複製可視化・WCAGコントラスト | #40 |
| Husky導入 | lint-staged + Husky による SQL commit 時の自動型生成 | #41 |
| Phase 10A | ナビ修正・ログアウトLP遷移・payer-only DELETE・設定画面・匿名化退会 | （本PR） |
| Phase 10B | RecurringRuleCard 1行リスト化・支払い一覧UI統一・認証エラー日本語化 | （本PR） |

テスト: 878件パス（48ファイル） / ビルド正常 / lint クリーン / Migration 027 まで push 済み

---

## 技術メモ（現行のみ）

- **PostgREST RLS DELETE**: サーバーサイド DELETE で `auth.uid()` が NULL → SECURITY DEFINER RPC で回避
- **認証ミドルウェア**: `proxy.ts`（Next.js 16 形式）。公開パスホワイトリスト方式
- **email NULL**: profiles.email は NULL 可。表示: `display_name || email || "Unknown"`
- **テーマ**: `text-theme-primary-text`（WCAG AA暗色）vs `bg-theme-primary`（鮮やか原色）
- **匿名化退会**: `anonymize_user` RPC。profiles 物理削除禁止（FK）。auth.users は admin API 削除
- **支払い認可**: 編集/削除は `payer_id === user.id` のみ。オーナー例外なし
- **清算フロー**: draft → confirmed → pending_payment → settled
- **translateAuthError**: Supabase英語エラー→i18nキーマッピング（`src/lib/auth/translate-error.ts`）
- **ThemeSelector hydration**: `mounted` ステートで SSR プレースホルダー表示

---

## 環境情報

- リモートDB（Supabase hosted）優先。ローカル Docker は Codespaces で不安定
- Migration 027 まで push 済み（026: payer-only DELETE, 027: anonymize_user RPC）
- Husky + lint-staged: SQL commit 時に `npm run db:gen-types` 自動実行

---

## Backlog

### Phase 11（決定済み）

- DB環境のローカル完全移行
- 水道代対応: `recurring_rules` に `interval` カラム追加（隔月・年次）
- カテゴリの任意化: `payments.category_id` を NULL 許容へ

### Phase 12（検討中）

- グループ別フィルタリング（/payments）
- よく使う店チップ（入力補助）
- Dashboard アクションセンター化
