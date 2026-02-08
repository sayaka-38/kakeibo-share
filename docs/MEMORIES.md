# MEMORIES.md - 開発進捗と記憶

セッション間の文脈保持用。アーキテクチャ規約・DBスキーマは **CLAUDE.md** を参照。

---

## 最終更新日

2026-02-08

---

## 完了済み（1行サマリー）

| 日付 | Phase | 内容 | PR |
|------|-------|------|----|
| — | Phase 1 | 基盤構築: Server Actions→API Routes移行、デモ削除保護、招待機能 | — |
| — | Phase 2 | UI統合: Skeleton/Button/NumericKeypad、清算エクセル方式 | — |
| — | Phase 3 | 型安全性: `as any` 全排除、Relationships型追加 | #9, #10 |
| — | Phase 4 | CI/CD: GitHub Actions (lint, typecheck, test, build) | #11 |
| — | Phase 5 | RLS全テーブル完了 + グループ削除機能 | #12–#21 |
| — | Phase 6 | Supabase CLI移行: マイグレーション標準化、ローカルDB、型自動生成 | マージ済み |
| 2026-01-31 | Phase A | 即効改善: 認証共通化・通貨フォーマット・環境変数厳格化・清算UI改善 | #24 |
| 2026-02-01 | Proxy Purchase | 代理購入機能: Step 1〜10 全完了（DB変更なし・splits参照方式）+ 2人グループUX改善 | PR作成済み |
| 2026-02-01 | Custom Split UX | カスタム割り勘: バリデーション・自動補完・内訳アコーディオン表示 | 同ブランチ |
| 2026-02-02 | Delete Payment | 支払い削除機能: RESTful DELETE API + RLS拡張 + ゴミ箱アイコンUI（100%完了・動作確認済み） | #29 |
| 2026-02-03 | 土台強化 | 認証ガード（ホワイトリスト方式）・isProxySplit共通化・バッジ整理・CI permissions | #30 |
| 2026-02-04 | Edit Payment | 支払い編集機能: PUT API + RPC原子的置換 + 編集UI + E2E動作確認済み | マージ済み |
| 2026-02-05 | Phase 7 | 清算エンジン完全実装: DB設計 + API + 固定費UI + 清算準備室 + 確定処理 + 履歴表示 + 相殺結果 + UI/UX仕上げ | ユーザーテスト中 |

テスト: 812件パス / ビルド正常（2026-02-08 セッション最新）

**Phase 7 + 7.5 + 7.6 ステータス**: UI整理・キャッシュ改善・ソート修正・期間バグ修正完了。コード掃除→PRマージ待ち

**Phase 7.7b 追加修正（2026-02-08）**:
- `/payments` 一覧ページの清算済みガード: `settlement_id` 取得 + 清算済ラベル + 編集/削除ボタン非表示
- `/payments/[id]/edit` ページの清算済みガード: `settlement_id` チェックでリダイレクト
- ゾンビ現象修正: Migration 024 で `confirm_settlement_receipt` RPC を修正 — 同グループの全 pending_payment を一括 settled に更新
- `settle_consolidated_sessions` 新RPC: SECURITY DEFINER で RLS バイパスして統合済みセッション一括更新
- confirm ルートの統合処理: PostgREST → RPC に変更（サイレント失敗回避）
- 履歴詳細ページ UX: 日付ラベル（清算開始日/受取完了日）+ 統合セッションの内訳リスト表示

**Phase 7.5 仕上げ（2026-02-07 第3ラウンド）**:
1. **全画面テーマ適用**: 30+ファイルでハードコード色をテーマ変数に置換（components/18, auth/layout/4, groups/7, dashboard/misc/5）。テスト5件もテーマクラスに更新
2. **相殺統合ロジック**: confirm route に `consolidateTransfers()` 実装。複数 pending_payment セッションの net_transfers を合算→最適振込再計算→旧セッション settled 化。テスト9件追加
3. **固定費ルール個人化**: Migration 022 で `generate_settlement_entries` RPC に `default_payer_id = p_user_id` フィルター追加。actualAmount バリデーションを `< 0` に緩和（0円許可）
4. **日付・フロー検証**: period_end = today（yesterday override なし）確認。pending_payment 中の新規 draft 作成可能を確認

---

## 技術メモ（CLAUDE.md に書ききれない実装詳細）

- **Codespaces 軽量モード**: `config.toml` で studio, inbucket, storage, edge_runtime, analytics, realtime を無効化（有効: db, auth, api）
- **Migration 003**: ローカルDB用に `RENAME COLUMN` のコメントアウトを解除済み（本番は適用済みだった）
- **RLS 無限再帰**: SECURITY DEFINER ヘルパー関数で解消（Migration 007）
- **Hydrationエラー**: `useSyncExternalStore` で解決済み
- **splits参照方式**: `calculateBalances()` は splits がある支払いは各splitのamountで負担額を計算、ない場合はレガシーエクセル方式にフォールバック。端数は支払者吸収（`calculateEqualSplit` の `payerId` で remainder を加算）
- **代理購入の判定**: DB にフラグなし。`payment_splits` で `payer.amount === 0` かつ他メンバーに全額割当のパターンで推定
- **usePaymentForm**: `SplitType = "equal" | "custom" | "proxy"` で 3種の割り勘に対応。`proxyBeneficiaryId` でバリデーションも統合
- **isProxySplit() / getProxyBeneficiaryId()**: `split.ts` に追加。3箇所に重複していたインライン判定を共通化。`isCustomSplit()` 内部でも利用
- **isCustomSplit()**: `split.ts` に追加。均等割り・代理購入でない分割をカスタムと判定（均等割りパターン: `floor(total/N)` + payer に remainder）
- **カスタム割り勘の自動補完**: 2人→双方向自動計算、3人以上→最後のメンバーを自動計算（readOnly）。`lastEditedRef` で最後に編集されたフィールドを追跡
- **PaymentSplitAccordion**: Context パターンで `SplitBadge`（タイトル行内）と `SplitContent`（行外）が状態共有。CSS Grid `grid-rows-[0fr]/[1fr]` でスムーズアニメーション
- **payment_splits プロフィール結合**: クエリに `profiles (display_name, email)` を追加して内訳にメンバー名を表示
- **支払い削除の二重防御**: アプリ層（`DELETE /api/payments/[id]` で 403 応答）+ RLS（`payments_delete_payer_or_owner` ポリシー）。groupId はクライアントから受け取らず DB から導出（改ざん防止）
- **既存デモ削除ルート**: `POST /api/payments/delete` はデモ専用として残存。将来 Phase B-2 で整理予定
- **認証ガード (proxy.ts)**: Next.js 16 は `middleware.ts` ではなく `proxy.ts` を使用。`updateSession()` は公開パスホワイトリスト方式（`PUBLIC_PATHS` 配列）。APIルートはセッションリフレッシュのみ、`authenticateRequest()` が 401 を返す二重防御
- **CI permissions**: `contents: read` + `security-events: write` を明示。GitHub Actions の権限警告を解消
- **PUT splits RPC 原子的置換（決定打・Migration 015）**: PostgREST の DELETE 操作で `auth.uid()` が正しく解決されず RLS DELETE ポリシーがサイレントに失敗する問題を、SECURITY DEFINER RPC `replace_payment_splits(p_payment_id, p_user_id, p_splits JSONB)` で完全に回避。DELETE + INSERT を単一トランザクション内で原子的に実行し、RLS を完全にバイパス。RPC 内部で payer_id 検証の二重防御。戻り値: >= 0 = 挿入件数, -1 = 支払い不在, -2 = 権限なし
- **FullPaymentForm 二重送信防止**: ローカル `isSubmitting` 状態を追加。`form.handleSubmit` を使わない独自 handleSubmit で `isSubmitting` ガードと `try/finally` パターンを実装
- **Navigation 動的清算リンク**: `useSyncExternalStore` で localStorage の `kakeibo_last_group_id` を監視。グループ訪問時に自動保存し、清算リンクを `/groups/[id]/settlement` に動的変更
- **PaymentSplitAccordion duplicate key 修正**: `key={split.user_id}` → `key={\`${split.user_id}-${index}\`}` で重複時のコンソールエラー解消

### Phase 7: 清算エンジン設計メモ

- **新規テーブル（Migration 016）**: `recurring_rules`, `recurring_rule_splits`, `settlement_sessions`, `settlement_entries`, `settlement_entry_splits` + `payments.settlement_id` 追加
- **RPC関数（Migration 017-018）**: `generate_settlement_entries` が複数月まとめ清算・後出しレシート・末日対応を一括処理。`confirm_settlement` が原子的に payments/payment_splits に変換
- **末日対応**: `day_of_month = 31` で2月なら28/29日として処理（`get_actual_day_of_month` ヘルパー関数）
- **後出しレシート対応**: `generate_settlement_entries` が `settlement_id IS NULL` の既存 payments を自動取り込み（`entry_type = 'existing'`）
- **スマート提案**: `get_settlement_period_suggestion` が未清算の最古日と前回確定終了日を返却
- **API設計**:
  - `/api/recurring-rules` — 固定費ルールCRUD
  - `/api/settlement-sessions` — セッションCRUD + `/[id]/confirm` で確定
  - `/api/settlement-sessions/suggest` — スマート提案
  - `/api/settlement-entries` — 手動追加 + `/[id]` で更新
- **RPC修正履歴（v18→v20）**:
  - v18: group_id 重複問題修正（SELECT で明示的に group_id を取得）
  - v19: filled_fields 制約対応（existing 取り込み時に filled_by/filled_at を設定）
  - v20: payment_splits 重複対策（DISTINCT ON で重複レコードを排除）
- **相殺結果計算**: `SettlementResultCard` で payer の支払い総額と splits による負担額を計算し、差額を表示
- **履歴ページ**: `/groups/[id]/settlement/history` に確定済みセッション一覧、`/[sessionId]` で詳細表示

---

## PostgREST RLS DELETE 問題 — 根本原因と解決経緯

支払い編集機能の実装中に遭遇した最大の障壁。将来同様の問題に再遭遇した場合のために経緯を記録する。

### 症状

PUT `/api/payments/[id]` で payment_splits を更新する際、Supabase JS クライアント経由の DELETE 操作が**エラーなしで 0 行削除**になる。INSERT は成功するため、編集するたびに splits が二重登録される。

### 根本原因

PostgREST（Supabase の REST API レイヤー）が DELETE 操作を実行する際、RLS ポリシー内の `auth.uid()` が**サーバーサイド API Route のセッションコンテキストでは正しく解決されない**ケースがある。

- `auth.uid()` は Supabase Auth のセッショントークンに依存
- サーバーサイド（API Route）からの呼び出しでは、`createServerClient` で Cookie からセッションを復元するが、PostgREST が RLS を評価する時点で `auth.uid()` が `NULL` になることがある
- RLS ポリシーが `auth.uid() = (SELECT payer_id FROM payments ...)` を評価 → `NULL != payer_id` → **行が一致しない** → **0 行削除（サイレント失敗）**
- SELECT / INSERT / UPDATE は正常に動作するのに DELETE だけ失敗するため、切り分けが困難だった

### 試行錯誤の経緯（Migration 011→014）

1. **Migration 011**: `payment_splits` に DELETE ポリシー追加 → 効果なし
2. **Migration 012**: `is_payment_payer()` PL/pgSQL ヘルパー関数で判定 → 効果なし
3. **Migration 013**: RPC で DELETE を実行 → 部分的に動作するが不安定
4. **Migration 014**: ポリシー条件の書き換え → 効果なし

いずれも RLS ポリシーの修正では `auth.uid()` の NULL 問題自体を解決できなかった。

### 最終解決策: SECURITY DEFINER RPC（Migration 015）

`replace_payment_splits(p_payment_id, p_user_id, p_splits)` — **RLS を完全にバイパス**する SECURITY DEFINER 関数で、DELETE + INSERT を単一トランザクション内で原子的に実行。

- RLS を通さないため `auth.uid()` の問題が根本的に回避される
- RPC 内部で `payer_id = p_user_id` を検証（アプリ層の認可チェックと合わせて二重防御）
- 戻り値で結果を通知: `>= 0` = 挿入件数, `-1` = 支払い不在, `-2` = 権限なし

### 教訓

- **PostgREST の DELETE + RLS + `auth.uid()` の組み合わせは信頼できない場合がある**（特にサーバーサイドからの呼び出し）
- DELETE が「エラーなし・0 行削除」になる場合、RLS のサイレント失敗を疑う
- 対処法: SECURITY DEFINER RPC でバイパスし、認可ロジックは RPC 内部で自前実装

---

## 現在のブランチ

- `main` — Phase 7 マージ済み（PR #34）
- `fix/ci-gen-types-linked` — CI 型チェック修正（PR #35、CI結果待ち）

---

## 環境情報

- `.env.local`: リモートDB（`byvtpkuocvjnwvihipvy.supabase.co`）に設定済み
- ローカル Docker 環境: Codespaces で不安定（`supabase status` は running だが接続不可の場合あり）
- Migration 015: リモート・ローカルともに適用済み
- Migration 022-023: リモートDB push 済み（固定費個人化 + 期間開始日修正）

---

## 次のタスク

### Phase 7: 清算準備室 & 固定費エンジン（100% 完了 → ユーザーテスト中）

- [x] Step 1: DB設計 — テーブル5個 + RPC7個 + API8本
- [x] Step 2: 固定費ルール設定UI — `/groups/[id]/recurring-rules` ページ
- [x] Step 3: 清算準備室UI — `/groups/[id]/settlement` ページ
- [x] Step 4: チェックリスト入力UI — 金額入力・ステータス変更
- [x] Step 5: 確定処理 & 清算済み表示（バッジ + 最新期間表示）
- [x] UX修正: Navigation 清算リンク動的化 + PaymentSplitAccordion duplicate key 修正
- [x] BUG FIX: RPC `generate_settlement_entries` — group_id 重複 / filled_fields 制約 / entry_splits 重複 全解消
- [x] Step 6: UI/UX 仕上げ
  - 入力者表示（EntryCard に「入力: 〇〇」を追加）
  - 期間選択バグ修正（開始日 > 終了日 問題 + 今日を含まない）
  - 相殺結果カード（SettlementResultCard）追加
  - 清算履歴ページ（`/groups/[id]/settlement/history` + 詳細表示）追加
  - 0件ガード（全て清算済み / 対象なし のメッセージ表示）
- [ ] ユーザーテスト後にマージ

### Phase 7.5: 相殺ネットロジック + 支払い待ちフロー + 仕上げ（完了）

**実装済み内容**:
1. ESLint 11警告全修正（`argsIgnorePattern: "^_"` 追加、不要import削除）
2. Happy Hues Palette 14 をCSS変数で適用（`globals.css` に `@theme inline`）
3. DBマイグレーション 019/020/021（`pending_payment`/`settled` status + net_transfers JSONB + 新RPC 4本 + confirm_settlement 致命バグ修正）
4. API Routes: `report-payment` + `confirm-receipt` 新規作成
5. PendingPaymentView コンポーネント新規作成
6. SettlementSessionManager: pending_payment フロー分岐 + 確定後に履歴詳細ページへリダイレクト + 古い期間の警告表示
7. 期間計算ロジック再定義: 終了日=最新未清算日、開始日=前回清算翌日
8. LINE通知スタブ: `sendLineNotification()` console.log のみ
9. テスト: period-suggestion（12件）+ net-transfer-calculation（17件）
10. テーマ色適用: Button/Layout/Navigation/Header/SettlementResultCard/SettlementEntryList 全てテーマ変数化
11. 履歴詳細: カスタム分割内訳・バッジ表示追加

**環境整備済み**:
- リモートDB: マイグレーション 019/020/021 push 済み
- `db:gen-types`: `--linked` でリモートDBから型再生成済み。手動オーバーライド削除済み
- `package.json`: `db:gen-types` スクリプトを `--local` → `--linked` に変更
- `payment_splits` 重複6件をクリーンアップ済み

**仕上げ（2026-02-07 第3ラウンド）**:
12. 全画面テーマ適用: 30+ファイル（components/auth/groups/dashboard/payments）のハードコード色排除
13. 相殺統合: `consolidateTransfers()` — 複数 pending_payment の net_transfers を balance-map で合算、最適マッチング再計算
14. 固定費個人化: Migration 022 — Part 1 で `default_payer_id = p_user_id` フィルター、0円バリデーション許可
15. テスト: consolidate-transfers（9件）追加、テーマ変更に伴うテスト5件修正。全780件パス

**Phase 7.6: UI整理・キャッシュ・ソート・期間修正（2026-02-07 第4ラウンド）**:
16. UI情報渋滞解消: `consolidateTransfers` を `src/lib/settlement/consolidate.ts` に抽出（共有モジュール化）
17. SettlementSessionManager 3シナリオ構造: pending-only / pending+draft / draft-only でレンダリング分岐
18. PendingPaymentView 簡素化: 4カード→1カード、ボタンは全て secondary
19. SettlementResultCard 統合プレビュー: `pendingTransfers` prop追加、`balancesToTransfers` + `consolidateTransfers` で相殺後の最終送金額表示
20. SettlementEntryList: `pendingTransfers` パススルー、確定ボタン `size="lg"` + `shadow-lg`
21. キャッシュ無効化: confirm/report-payment/confirm-receipt route に `revalidatePath` 追加 + クライアント側 `router.refresh()`
22. ソート順修正: RecentPaymentList・清算エントリ・ダッシュボード・支払い一覧・履歴詳細で `created_at DESC` 副ソート追加
23. 期間開始日バグ修正: フロントエンド（PeriodSelector）+ Migration 023（RPC）で `oldestUnsettledDate` ガード追加
24. テスト: period-suggestion 2件追加（retroactive）+ RecentPaymentList mock修正。全782件パス
25. Migration 023 リモートDB push 済み

### 緊急バグ修正（2026-02-07）

ユーザーテスト中に発覚した5件:
1. **テーマ色未適用** → Button/Navigation/Header/SettlementResultCard/SettlementEntryList をテーマ変数に変更
2. **日付ズレ** → 古いdraftセッションの期間が最新の支払いを含まない問題 → 警告バナー追加
3. **送金指示未表示** → #4の確定エラーが原因でpending_payment状態に到達しなかった → #4修正で解消
4. **確定エラー（致命的）** → Migration 020の`confirm_settlement`でINTEGER変数にTEXTを代入するバグ → Migration 021で修正
5. **履歴の分割内訳なし** → 履歴詳細ページにsplits表示・カスタム分割バッジ追加

### Phase 7.7: 清算プロセス整合性修正（完了 — PR #36）

**Phase 7.7a（初回コミット）** — confirm-receipt リダイレクト、API ガード、統合バッジ
**Phase 7.7b（追加修正）** — ゾンビ現象解消、/payments 一覧ガード、履歴詳細 UX、Phase 8 布石

- [x] confirm-receipt 後の完了フィードバック — 履歴詳細ページへリダイレクト
- [x] 清算済み支払いの編集・削除ガード — API(PUT/DELETE) + フロントエンド(/payments, /payments/[id]/edit, RecentPaymentList)
- [x] 合算時の履歴整合性 — 統合済み旧セッション `net_transfers` クリア + 「統合済み」バッジ
- [x] 「清算済」ラベル — チェックアイコン + 深緑色で全画面統一
- [x] ゾンビ現象修正 — Migration 024: `confirm_settlement_receipt` が同グループ全 pending_payment を一括 settled に更新
- [x] RPC `settle_consolidated_sessions` — confirm ルートの PostgREST → RPC 変更（RLS サイレント失敗回避）
- [x] 履歴詳細 UX — 「清算開始日/受取完了日」ラベル + 統合セッションの内訳リスト表示

### CI 修正（2026-02-08）

- **PR #35**: CI の `supabase gen types` を `--local` → `--project-id`（リモートDB）に変更
- **原因**: ローカルマイグレーションとリモートDBのスキーマ乖離（カラム名・FK名・テーブル差異）
- **前提**: GitHub Secrets に `SUPABASE_ACCESS_TOKEN` を追加済み
- `supabase start/stop` 削除で CI 高速化

### Phase 8 以降のロードマップ

**Phase 8: 構造改善（中掃除）**
- N+1 クエリ解消、共通コンポーネント化、archived_payments 退避

**Phase 9: 機能・UX 拡張**
- 清算準備室「個別調整」UI、UIカラー切り替え

**Phase 10: ユーザー設定・セキュリティ**

**Phase 11: アーキテクチャ改善（大掃除）**

### Phase B: 構造改善

- [ ] B-1: N+1クエリ解消 — グループ一覧のメンバー数を1クエリに統合
- [ ] B-2: デモ削除ロジック共通化 — 重複関数の抽出・統合（`POST /api/payments/delete` の整理含む）
- [ ] B-3: インライン型定義の集約 — `query-results.ts` に集約
- [ ] B-4: 削除ダイアログの表現修正 — 柔らかい文言 + i18n対応

### Phase C: アーキテクチャ改善

- [ ] C-1: Suspense境界追加 — 清算・グループ詳細でストリーミングSSR
- [ ] C-2: クエリ並列化 — `Promise.all()` で直列fetch解消
- [ ] C-3: Supabaseクエリ型安全ラッパー — `as` キャストを型推論で置き換え
- [ ] C-4: `<FieldError>` コンポーネント — エラー表示UIの共通化

### 将来の機能要件

- [ ] デモデータ自動削除機能（24時間後）
- [ ] グループ別カテゴリの追加・編集 UI
