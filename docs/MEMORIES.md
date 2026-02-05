# MEMORIES.md - 開発進捗と記憶

セッション間の文脈保持用。アーキテクチャ規約・DBスキーマは **CLAUDE.md** を参照。

---

## 最終更新日

2026-02-05

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
| 2026-02-05 | Phase 7 | 清算エンジン完全実装: DB設計 + API + 固定費UI + 清算準備室 + 確定処理 + 履歴表示 + 相殺結果 | PR準備中 |

テスト: 742件パス / ビルド正常（2026-02-05 セッション最新）

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

- `feature/phase7-settlement-engine` — Phase 7 清算エンジン **100%完了**（UI/UX仕上げ含む、PRマージ待ち）
- `feature/edit-payment` — main にマージ済み
- `feature/delete-payment` — main にマージ済み（#29 削除機能 + #30 土台強化）
- `feature/proxy-purchase` — main にマージ済み

---

## 環境情報

- `.env.local`: リモートDB（`byvtpkuocvjnwvihipvy.supabase.co`）に設定済み
- ローカル Docker 環境: Codespaces で不安定（`supabase status` は running だが接続不可の場合あり）
- Migration 015: リモート・ローカルともに適用済み

---

## 次のタスク

### Phase 7: 清算準備室 & 固定費エンジン（100% 完了）

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
