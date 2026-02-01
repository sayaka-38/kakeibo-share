# MEMORIES.md - 開発進捗と記憶

セッション間の文脈保持用。アーキテクチャ規約・DBスキーマは **CLAUDE.md** を参照。

---

## 最終更新日

2026-02-01

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

テスト: 645件パス / ビルド正常 / Lint エラーなし（2026-02-01 セッション終了時点）

---

## 技術メモ（CLAUDE.md に書ききれない実装詳細）

- **Codespaces 軽量モード**: `config.toml` で studio, inbucket, storage, edge_runtime, analytics, realtime を無効化（有効: db, auth, api）
- **Migration 003**: ローカルDB用に `RENAME COLUMN` のコメントアウトを解除済み（本番は適用済みだった）
- **RLS 無限再帰**: SECURITY DEFINER ヘルパー関数で解消（Migration 007）
- **Hydrationエラー**: `useSyncExternalStore` で解決済み
- **splits参照方式**: `calculateBalances()` は splits がある支払いは各splitのamountで負担額を計算、ない場合はレガシーエクセル方式にフォールバック。端数は支払者吸収（`calculateEqualSplit` の `payerId` で remainder を加算）
- **代理購入の判定**: DB にフラグなし。`payment_splits` で `payer.amount === 0` かつ他メンバーに全額割当のパターンで推定
- **usePaymentForm**: `SplitType = "equal" | "custom" | "proxy"` で 3種の割り勘に対応。`proxyBeneficiaryId` でバリデーションも統合

---

## 現在のブランチ

- `main` — 代理購入 PR マージ後はここから次のブランチを切る

---

## 次のタスク

### 🔜 最優先: 自分の支払いの削除機能

- [ ] 支払い削除 API Route 作成（`DELETE /api/payments/[id]`）
- [ ] 認証 + 権限チェック（支払者本人 or グループオーナーのみ削除可）
- [ ] 支払い一覧・詳細からの削除UIとconfirmダイアログ
- [ ] テスト: 異常系（権限なし・存在しないID）→ 正常系

### Phase B: 構造改善

- [ ] B-1: N+1クエリ解消 — グループ一覧のメンバー数を1クエリに統合
- [ ] B-2: デモ削除ロジック共通化 — 重複関数の抽出・統合
- [ ] B-3: インライン型定義の集約 — `query-results.ts` に集約
- [ ] B-4: 削除ダイアログの表現修正 — 柔らかい文言 + i18n対応

### Phase C: アーキテクチャ改善

- [ ] C-1: Suspense境界追加 — 清算・グループ詳細でストリーミングSSR
- [ ] C-2: クエリ並列化 — `Promise.all()` で直列fetch解消
- [ ] C-3: Supabaseクエリ型安全ラッパー — `as` キャストを型推論で置き換え
- [ ] C-4: `<FieldError>` コンポーネント — エラー表示UIの共通化

### 将来の機能要件

- [ ] 清算機能の実装検討
- [ ] デモデータ自動削除機能（24時間後）
- [ ] グループ別カテゴリの追加・編集 UI
