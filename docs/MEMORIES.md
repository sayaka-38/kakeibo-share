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
| 代理購入 + カスタム割勘 | splits参照方式・バリデーション・自動補完 | PR済 |
| 支払い削除/編集 | RESTful API + RPC原子的置換 | #29, 済 |
| 土台強化 | 認証ガード・isProxySplit共通化・CI permissions | #30 |
| Phase 7 | 清算エンジン完全実装 + 相殺統合 + ゾンビ修正 | #34, #36 |
| Phase 8 | 構造改善・支払い複製・完全日本語化・email NULL対応 | #38 |
| Phase 9A | テーマシステム基盤 — 5パレット・CSS変数・ThemeProvider | #39 |
| Phase 9B | UX磨き — デモBot・割り勘ガード・複製可視化・WCAGコントラスト | #40 |
| Husky導入 | lint-staged + Husky による SQL commit 時の自動型生成 | #41 |
| Phase 10A | UX基盤・セキュリティ強化・設定画面＆匿名化退会 | PR未作成 |

テスト: 868件パス（47ファイル） / ビルド正常 / lint クリーン / Migration 027 まで push 済み / 型同期済み

---

## Phase 10A 詳細

### UX基盤修正
- **Navigation.tsx**: `/groups/[id]/settlement` での「グループ」「清算」二重ハイライトを解消（`isNavItemActive` に `/settlement` 除外条件追加）
- **Header.tsx**: ロゴリンクをログイン時 `/dashboard`、未ログイン時は外部 LP へ分岐
- **ログアウト**: `router.push("/login")` → `window.location.href = LP_URL` で外部 LP へリダイレクト

### セキュリティ強化
- **DELETE /api/payments**: グループオーナー例外を撤廃、支払者本人のみに厳格化
- **RLS Migration 026**: `payments_delete_payer_or_owner` → `payments_delete_payer` に変更

### 設定画面 & 退会機能
- **設定ページ**: `/settings` — プロフィール変更・パスワード変更・退会の3セクション
- **API Routes**: `PUT /api/profile`, `POST /api/auth/change-password`, `POST /api/auth/delete-account`
- **匿名化退会（パターンB）**: `anonymize_user` RPC（Migration 027）
  - profiles 行は残す（FK 維持）→ display_name = "退会済みユーザー", email/avatar = NULL
  - payments, payment_splits, settlement 系は一切変更しない
  - グループオーナーは最古参メンバーに自動委譲
  - auth.users は admin API で削除（再ログイン防止）

---

## 技術メモ（要点のみ）

- **PostgREST RLS DELETE バグ**: サーバーサイドからの DELETE で `auth.uid()` が NULL になりサイレント失敗。対策: SECURITY DEFINER RPC でバイパス（`replace_payment_splits` 等）
- **splits参照方式**: splits ありは各split.amount、なしはレガシー均等割り。端数は支払者吸収
- **代理購入判定**: `payer.amount === 0` + 他メンバーに全額割当パターンで推定（DBフラグなし）
- **認証ガード (proxy.ts)**: Next.js 16 は `middleware.ts` ではなく `proxy.ts`。公開パスホワイトリスト方式
- **清算エンジンAPI**: `/api/settlement-sessions`, `/api/settlement-entries`, `/api/recurring-rules`
- **末日対応**: `day_of_month = 31` → 2月は28/29日（`get_actual_day_of_month` ヘルパー）
- **後出しレシート**: `generate_settlement_entries` が `settlement_id IS NULL` の既存 payments を自動取り込み
- **email NULL**: profiles.email は NULL 可（匿名/デモ/退会ユーザー）。表示時は `display_name || email || "Unknown"` のフォールバック必須
- **テーマ primary-text 分離**: `text-theme-primary-text` はテキスト専用（WCAG AA対応の暗色）、`bg-theme-primary` はボタン背景用（鮮やかな元色を維持）
- **デモ Bot RPC**: `create_demo_bot_partner` は SECURITY DEFINER で auth.users にBot挿入。失敗時はグレースフルに無視して続行
- **匿名化退会**: profiles の物理削除は FK 違反のため禁止。`anonymize_user` RPC で匿名化 UPDATE + グループ退去 + auth.users 削除。payments/settlement は不変
- **設定 API**: `PUT /api/profile`（表示名30文字制限）、`POST /api/auth/change-password`（6文字以上）、`POST /api/auth/delete-account`（RPC + admin 削除）
- **i18n**: `settings.*` キー追加済み（ja.json / en.json 完全多言語化）

---

## 環境情報

- `.env.local`: リモートDB（Supabase hosted）優先
- ローカル Docker: Codespaces で不安定（リモート設定のまま開発継続）
- Migration 027 まで push 済み（026: payments DELETE payer only, 027: anonymize_user RPC）
- profiles.email: NOT NULL 制約解除済み（手動マイグレーション）
- Husky + lint-staged: SQL マイグレーション commit 時に `npm run db:gen-types` 自動実行

---

## Backlog / Future Tasks

### Phase 10B（次期）

- RecurringRuleCard.tsx の 1 行リスト化（UI密度向上）
- 清算準備室「個別調整」UI
- Suspense境界 / クエリ並列化 / 型安全ラッパー

### Phase 11（決定済み）

- **DB環境のローカル完全移行**: Codespaces Docker 安定化 or 代替策
- **水道代対応**: 固定費ルール（`recurring_rules`）に `interval`（1, 2, 12ヶ月等）カラムを追加。隔月・年次の定期支払いに対応
- **カテゴリの任意化**: `payments.category_id` を必須（NOT NULL）から任意（NULL許容）へ変更。フォームUI・バリデーション・表示ロジックの修正を含む

### Phase 12（検討中）

- **支払画面の改善**: `/payments` ページにグループ別フィルタリング（タブ/チップUI）を導入。複数グループ参加時の視認性向上
- **よく使う店チップ**: 直近30日の `payments.description` を頻度集計し、入力補助チップとして表示。フォーム入力の効率化
- **Dashboard の昇華**: 通知・請求サマリーを集約する「アクションセンター」化。未清算通知・支払いリマインダーを一画面に統合
