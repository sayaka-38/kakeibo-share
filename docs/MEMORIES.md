# MEMORIES.md - 開発進捗と記憶

セッション間の文脈保持用。アーキテクチャ規約・DBスキーマは **CLAUDE.md** を参照。

最終更新: 2026-02-19

---

## 完了済み

| Phase | 内容 | 最終PR |
|-------|------|--------|
| 1–10 | 基盤・UI・型安全・CI・RLS・認証・清算エンジン・テーマ・設定画面・匿名化退会 | #43 |
| 11 | インフラ正常化・コード共通化・統合テスト56件・Playwright E2E・Migration 031 | #52 |
| 11.5 | セッション維持ガイド・多言語切替(ja/en)・グループ退出/オーナー譲渡RPC(032-033)・i18n DRY統合・RPC共通エラー翻訳・設定画面分割 | #54 |
| 12 | カスタムカテゴリCRUD・アイコン/カラー選択UI・WCAG対応コントラスト・クールモダン5テーマ刷新・バッジ視認性向上 | — |

**現在**: Vitest 1123件 + Playwright E2E 1件 = **計1124テスト** / ビルド正常 / lint クリーン

---

## 統合テスト UUID 割り当て

| ファイル | UUID 範囲 |
|---------|----------|
| archive-payment | `99990000-00xx` |
| replace-payment-splits | `99990100-01xx` |
| anonymize-user | `99990200-02xx` |
| settlement-flow | `99990300-03xx` |
| leave-group / transfer-ownership | `99990400-04xx` |
| create-demo-bot-partner | `99990500-05xx` |

---

## 環境セットアップ（Codespaces）

- `supabase/config.toml`: `enable_anonymous_sign_ins = true` に変更済み（デモ機能に必須）
- Codespaces でデモを動作させるには **ポート 54321 を Public** に設定すること
  - `gh codespace ports visibility 54321:public -c <codespace-name>`
- `.env.local` の `NEXT_PUBLIC_SUPABASE_URL` は Codespaces フォワード URL を使用
  - 例: `https://<name>-54321.app.github.dev/`

---

## ロードマップ

### Phase 13 — 神UX
- スマート入力チップ（頻度ベースの店名サジェスト）
- 連続入力モード
- カレンダーグリッド UI

### 将来構想
- Dashboard アクションセンター化
- Capacitor アプリ化（iOS / Android）
- LINE 通知連携
- 定期支払いの自動生成
