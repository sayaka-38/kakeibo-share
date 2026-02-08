/**
 * 清算済み支払いの編集・削除ガードテスト
 *
 * 清算が完了した支払い（settlement_id が設定されたもの）は
 * 編集・削除ができないことを検証する。
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const API_ROUTE_PATH = path.join(
  process.cwd(),
  "src/app/api/payments/[id]/route.ts"
);

const PAYMENT_LIST_PATH = path.join(
  process.cwd(),
  "src/components/payment-list/RecentPaymentList.tsx"
);

const CONFIRM_ROUTE_PATH = path.join(
  process.cwd(),
  "src/app/api/settlement-sessions/[id]/confirm/route.ts"
);

const SETTLEMENT_MANAGER_PATH = path.join(
  process.cwd(),
  "src/app/(protected)/groups/[id]/settlement/SettlementSessionManager.tsx"
);

const HISTORY_DETAIL_PATH = path.join(
  process.cwd(),
  "src/app/(protected)/groups/[id]/settlement/history/[sessionId]/page.tsx"
);

const HISTORY_LIST_PATH = path.join(
  process.cwd(),
  "src/app/(protected)/groups/[id]/settlement/history/page.tsx"
);

// =============================================================================
// API ガードテスト
// =============================================================================

describe("清算済み支払いの編集・削除ガード", () => {
  describe("DELETE /api/payments/[id] — settlement_id ガード", () => {
    it("settlement_id をSELECTで取得している", () => {
      const content = fs.readFileSync(API_ROUTE_PATH, "utf-8");
      // DELETE ハンドラの SELECT に settlement_id が含まれる
      expect(content).toContain("settlement_id");
    });

    it("settlement_id がある場合に 403 を返すガードがある", () => {
      const content = fs.readFileSync(API_ROUTE_PATH, "utf-8");
      expect(content).toContain("清算済みの支払いは削除できません");
    });
  });

  describe("PUT /api/payments/[id] — settlement_id ガード", () => {
    it("settlement_id をSELECTで取得している", () => {
      const content = fs.readFileSync(API_ROUTE_PATH, "utf-8");
      // PUT ハンドラのpayment取得にsettlement_idが含まれる
      const putSection = content.substring(content.indexOf("export async function PUT"));
      expect(putSection).toContain("settlement_id");
    });

    it("settlement_id がある場合に 403 を返すガードがある", () => {
      const content = fs.readFileSync(API_ROUTE_PATH, "utf-8");
      expect(content).toContain("清算済みの支払いは編集できません");
    });
  });
});

// =============================================================================
// フロントエンド表示ガードテスト
// =============================================================================

describe("フロントエンド清算済みガード", () => {
  describe("RecentPaymentList — 削除ボタン非表示", () => {
    it("settlement_id がある場合に削除ボタンを非表示にする条件がある", () => {
      const content = fs.readFileSync(PAYMENT_LIST_PATH, "utf-8");
      // !payment.settlement_id の条件で DeletePaymentForm を制御
      expect(content).toContain("!payment.settlement_id");
      expect(content).toContain("DeletePaymentForm");
    });

    it("清算済ラベルにチェックアイコンが含まれる", () => {
      const content = fs.readFileSync(PAYMENT_LIST_PATH, "utf-8");
      // チェックマークSVGパスが含まれる
      expect(content).toContain("M5 13l4 4L19 7");
      expect(content).toContain("清算済");
    });

    it("清算済ラベルがテーマカラー（深緑）を使用している", () => {
      const content = fs.readFileSync(PAYMENT_LIST_PATH, "utf-8");
      // settlement_id バッジ周辺で bg-theme-text/15 を使用
      expect(content).toContain("bg-theme-text/15 text-theme-text");
    });
  });
});

// =============================================================================
// confirm-receipt フィードバックテスト
// =============================================================================

describe("confirm-receipt 完了フィードバック", () => {
  it("confirm-receipt 後に履歴詳細ページへリダイレクトする", () => {
    const content = fs.readFileSync(SETTLEMENT_MANAGER_PATH, "utf-8");
    // handleConfirmReceipt 内で router.push が呼ばれる
    const receiptSection = content.substring(content.indexOf("handleConfirmReceipt"));
    expect(receiptSection).toContain("router.push");
    expect(receiptSection).toContain("/settlement/history/");
  });
});

// =============================================================================
// 合算（相殺統合）整合性テスト
// =============================================================================

describe("合算時の履歴整合性", () => {
  describe("confirm route — 旧セッション net_transfers クリア", () => {
    it("統合済み旧セッションの net_transfers を空配列にする", () => {
      const content = fs.readFileSync(CONFIRM_ROUTE_PATH, "utf-8");
      // 旧セッション更新時に net_transfers: [] が含まれる
      expect(content).toContain("net_transfers: []");
    });
  });

  describe("履歴詳細ページ — 統合済みバナー", () => {
    it("統合済みセッションに対してバナーメッセージを表示する", () => {
      const content = fs.readFileSync(HISTORY_DETAIL_PATH, "utf-8");
      expect(content).toContain("後続の清算に統合されました");
    });

    it("ステータスバッジ（清算完了 / 支払い待ち）が表示される", () => {
      const content = fs.readFileSync(HISTORY_DETAIL_PATH, "utf-8");
      expect(content).toContain("清算完了");
      expect(content).toContain("支払い待ち");
    });

    it("settled_at の日時が表示される", () => {
      const content = fs.readFileSync(HISTORY_DETAIL_PATH, "utf-8");
      expect(content).toContain("settled_at");
      expect(content).toContain("完了");
    });
  });

  describe("履歴一覧ページ — 統合済みバッジ", () => {
    it("統合済みセッションに「統合済み」バッジが表示される", () => {
      const content = fs.readFileSync(HISTORY_LIST_PATH, "utf-8");
      expect(content).toContain("統合済み");
      expect(content).toContain("is_consolidated");
    });
  });
});
