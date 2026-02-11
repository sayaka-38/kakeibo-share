# MEMORIES.md - 開発進捗と記憶

セッション間の文脈保持用。アーキテクチャ規約・DBスキーマは **CLAUDE.md** を参照。

---

## 最終更新日

2026-02-11

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
| Husky | lint-staged + Husky による SQL commit 時の自動型生成 | #41 |
| Phase 10A+B | ナビ修正・ログアウトLP遷移・payer-only DELETE・設定画面・匿名化退会・UI統一・認証日本語化 | #43 |
| Phase 11-Step1 | インフラ正常化: seed.sql・.env.test・vitest env固定・CI ローカルスタック化・secrets依存除去 | （本PR） |

テスト: 878件パス（48ファイル） / ビルド正常 / lint クリーン / Migration 027 まで

---

## 環境情報

- **ローカルスタック優先**: `.env.test` + `vitest.config.ts` の `env` ブロックでテスト時のローカル値固定
- `db:gen-types` は `--local`（ローカルスタック）、`db:gen-types:linked` はフォールバック
- CI: secrets 不要。`supabase start` → `db reset` → 型diff → `stop` のフルサイクル
- Husky + lint-staged: SQL commit 時に `npm run db:gen-types` 自動実行

---

## Backlog

### Phase 11（残り）

- 水道代対応: `recurring_rules` に `interval` カラム追加（隔月・年次）
- カテゴリの任意化: `payments.category_id` を NULL 許容へ

### Phase 12（検討中）

- グループ別フィルタリング（/payments）
- よく使う店チップ（入力補助）
- Dashboard アクションセンター化
