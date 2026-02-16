# MEMORIES.md - 開発進捗と記憶

セッション間の文脈保持用。アーキテクチャ規約・DBスキーマは **CLAUDE.md** を参照。

最終更新: 2026-02-16

---

## 完了済み

| Phase | 内容 | 最終PR |
|-------|------|--------|
| Phase 1–10 | 基盤・UI・型安全・CI・RLS・認証・清算エンジン・テーマ・設定画面・匿名化退会 | #43 |
| Phase 11 | 土台強化: インフラ正常化・コード共通化・統合テスト56件・Playwright E2E・Migration 031 | #52 |

**現在**: Vitest 1036件 + Playwright E2E 1件 = **計1037テスト** / ビルド正常 / lint クリーン

---

## 環境情報

- `.env.test` → `127.0.0.1:54322` (Vitest)、`.env.local` → `127.0.0.1:54321` (dev server)
- リモートリリース時は `npx supabase db push` + Vercel 環境変数確認
- Husky + lint-staged: SQL commit 時に `npm run db:gen-types` 自動実行
- E2E: Codespaces では `npx playwright install-deps chromium` が必要

---

## 統合テスト UUID 割り当て

| ファイル | UUID 範囲 |
|---------|----------|
| archive-payment | `99990000-00xx` |
| replace-payment-splits | `99990100-01xx` |
| anonymize-user | `99990200-02xx` |
| settlement-flow | `99990300-03xx` |
| create-demo-bot-partner | `99990500-05xx` |

---

## ロードマップ

### 近未来 — システム基盤の完成
- 認証の永続化（セッション維持の安定化）
- 言語切替トグル（ja / en 動的切替）
- オーナー脱退バリデーション（最後のオーナーが抜けられないガード）

### Phase 12 — カテゴリの高度化
- グループ別カスタムカテゴリ CRUD
- アイコン・カラー選択 UI（視認性改善）

### Phase 13 — 神UX
- スマート入力チップ（頻度ベースの店名サジェスト）
- 連続入力モード（レジ横でポンポン記録）
- カレンダーグリッド UI（月次ビュー）

### 将来構想
- Dashboard アクションセンター化
- Capacitor アプリ化（iOS / Android）
- LINE 通知連携
- 定期支払いの自動生成（recurring_rules → payments）
