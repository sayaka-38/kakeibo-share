# MEMORIES.md - 開発進捗と記憶

このファイルは、セッションを跨いで開発の文脈を保持するための記録です。

---

## 最終更新日

2026-01-24（Phase 1-3 完了）

---

## 完了した機能

### Phase 1-3: デモデータ削除保護機能（今セッション完了）

- **`deleteDemoSession` 関数の実装**（`src/lib/demo/delete-demo-session.ts`）
  - `validateDemoDataDeletion` を統合し、本番データ誤削除を防止
  - グループ削除時に関連データ（payments → group_members → groups → demo_sessions）を順番に削除

- **監査ログ機能**（`src/lib/demo/audit-log.ts`）
  - 削除操作の追跡（DELETE_START, DELETE_SUCCESS, DELETE_FAILED, VALIDATION_REJECTED）
  - 詳細なログ出力（テーブル名、エラーコード、タイムスタンプ）

- **エクスポート整理**（`src/lib/demo/index.ts`）
  - 全デモ機能を一元管理

- **テストカバレッジ**
  - `delete-demo-session.test.ts`: 9件
  - `demo-audit-log.test.ts`: 9件
  - `demo-data-protection.test.ts`: 9件

### グループ招待・参加機能（PR #3 マージ済み）

- 招待リンクの生成と共有
- リンク経由でのグループ参加
- 招待トークンの有効期限管理

### DBスキーマ整合性の修正（fix/phase1-schema-consistency）

- カラム名の統一（`created_by` → `owner_id`、`paid_by` → `payer_id`）
- TypeScript型定義とDBスキーマの整合性確保
- デモ機能のDB整合性修正

### UI改善

- フォーム入力文字の視認性改善（コミット 30ba71c）
- スマホでの文字色問題 → **解決済み**

### 環境構築

- `docs/MEMORIES.md` による記憶保持機能を導入
- `CLAUDE.md` に運用ルール追加（記憶の保持、セキュリティポリシー、/done コマンド）

---

## テスト状況

- **190件のテストがパス** ✅
- 全テスト合格（schema-consistency.test.ts の問題も解消済み）

---

## 現在の課題

### 解決済み

- ~~schema-consistency.test.ts の失敗~~ → テストを正しいファイルを参照するよう修正
- ~~ui-ux.test.tsx のタイムアウト~~ → テストアプローチを修正

---

## 次のタスク

### Phase 2-2: UI/UX最適化（次のフェーズ）

- 現在のブランチ: `feat/phase2-2-ui-ux-optimization`
- PaymentForm の UI/UX 改善が進行中
- 未コミットの変更あり

### 将来のタスク

- [ ] 清算機能の実装検討
- [ ] デモデータ自動削除機能（24時間後）

---

## セッション引き継ぎメモ

*次回セッション開始時に参照すべき事項*

- 現在のブランチ: `feat/phase2-2-ui-ux-optimization`
- Phase 1-3 完了、Phase 2-2 に進む準備が整った
- CLAUDE.md の運用ルール（TDD, 承認フロー, 記憶の保持）を厳守すること

### 今セッションの作業内容

1. **Phase 1-3: デモデータ削除保護機能の完成**
   - `deleteDemoSession` 関数を TDD で実装
   - `validateDemoDataDeletion` を削除処理に統合
   - 監査ログ機能を追加（破壊的操作の追跡）
   - エクスポートを `index.ts` で整理

2. **テストの修正**
   - `ui-ux.test.tsx` のタイムアウト問題を解消
   - `schema-consistency.test.ts` の失敗を解消

3. **テスト結果**
   - 全190件のテストがパス

### 新規作成ファイル

| ファイル | 内容 |
|---------|------|
| `src/lib/demo/delete-demo-session.ts` | 削除関数（バリデーション統合） |
| `src/lib/demo/audit-log.ts` | 監査ログ機能 |
| `src/lib/demo/index.ts` | エクスポート整理 |
| `src/test/demo/delete-demo-session.test.ts` | 削除テスト（9件） |
| `src/test/demo/demo-audit-log.test.ts` | 監査ログテスト（9件） |
